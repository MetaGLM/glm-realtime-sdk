"""
统一的消息处理模块
用于处理与智谱AI实时音视频API的WebSocket通信消息
支持音频、视频、函数调用和服务端VAD等多种场景
"""

import asyncio
import json
from collections.abc import Callable
from typing import Any, Optional

from rtclient import RTLowLevelClient
from rtclient.models import (
    FunctionCallOutputItem,
    ItemCreateMessage,
)


class MessageHandler:
    def __init__(self, client: RTLowLevelClient, shutdown_event: Optional[asyncio.Event] = None):
        """
        初始化消息处理器
        Args:
            client: WebSocket客户端实例
            shutdown_event: 关闭事件，用于控制消息接收的终止
        """
        self.client = client
        self.shutdown_event = shutdown_event
        self._custom_handlers: dict[str, Callable] = {}

    def register_handler(self, message_type: str, handler: Callable):
        """
        注册自定义消息处理器
        Args:
            message_type: 消息类型
            handler: 处理函数，接收message参数
        """
        self._custom_handlers[message_type] = handler

    async def _handle_function_call(self, message: Any):
        """处理函数调用消息"""
        print("函数调用参数完成消息")
        print(f"  Response Id: {message.response_id}")
        if hasattr(message, "name"):
            print(f"  Function Name: {message.name}")
        print(f"  Arguments: {message.arguments if message.arguments else 'None'}")

        # 如果是电话功能的函数调用，处理响应
        if hasattr(message, "name") and message.name == "phoneCall":
            try:
                args = json.loads(message.arguments)
                response = {"status": "success", "message": f"成功拨打电话给 {args.get('contact_name', '未知姓名')}"}
                await asyncio.sleep(1)

                output_item = FunctionCallOutputItem(output=json.dumps(response, ensure_ascii=False))
                create_message = ItemCreateMessage(item=output_item)
                await self.client.send(create_message)
                await self.client.send_json({"type": "response.create"})
            except json.JSONDecodeError as e:
                print(f"解析函数调用参数失败: {e}")

    async def _handle_session_messages(self, message: Any, msg_type: str):
        """处理会话相关消息"""
        match msg_type:
            case "session.created":
                print("会话创建消息")
                print(f"  Session Id: {message.session.id}")
            case "session.updated":
                print("会话更新消息")
                print(f"updated session: {message.session}")
            case "error":
                print("错误消息")
                print(f"  Error: {message.error}")

    async def _handle_audio_input_messages(self, message: Any, msg_type: str):
        """处理音频输入相关消息"""
        match msg_type:
            case "input_audio_buffer.committed":
                print("音频缓冲区提交消息")
                if hasattr(message, "item_id"):
                    print(f"  Item Id: {message.item_id}")
                await self.client.send_json({"type": "response.create"})
            case "input_audio_buffer.speech_started":
                print("语音开始消息")
            case "input_audio_buffer.speech_stopped":
                print("语音结束消息")

    async def _handle_conversation_messages(self, message: Any, msg_type: str):
        """处理会话项目相关消息"""
        match msg_type:
            case "conversation.item.created":
                print("会话项目创建消息")
            case "conversation.item.input_audio_transcription.completed":
                print("输入音频转写完成消息")
                print(f"  Transcript: {message.transcript}")

    async def _handle_response_messages(self, message: Any, msg_type: str):
        """处理响应相关消息"""
        match msg_type:
            case "response.created":
                print("响应创建消息")
                print(f"  Response Id: {message.response.id}")
            case "response.done":
                print("响应完成消息")
                if hasattr(message, "response"):
                    print(f"  Response Id: {message.response.id}")
                    print(f"  Status: {message.response.status}")
            case "response.audio.delta":
                print("模型音频增量消息")
                print(f"  Response Id: {message.response_id}")
                if message.delta:
                    print(f"  Delta Length: {len(message.delta)}")
                else:
                    print("  Delta: None")
            case "response.audio.done":
                print("模型音频完成消息")
            case "response.audio_transcript.delta":
                print("模型音频文本增量消息")
                print(f"  Response Id: {message.response_id}")
                print(f"  Delta: {message.delta if message.delta else 'None'}")
            case "response.audio_transcript.done":
                print("模型音频文本完成消息")

    async def receive_messages(self):
        """
        统一的消息接收处理函数
        处理所有类型的消息，包括音频、视频、函数调用和服务端VAD等场景
        """
        try:
            while not self.client.closed:
                if self.shutdown_event and self.shutdown_event.is_set():
                    print("正在停止消息接收...")
                    break

                try:
                    message = await asyncio.wait_for(self.client.recv(), timeout=5.0)
                    if message is None:
                        continue

                    msg_type = message.type if hasattr(message, "type") else message.get("type")
                    if msg_type is None:
                        print("收到未知类型的消息:", message)
                        continue

                    # 检查是否有自定义处理器
                    if msg_type in self._custom_handlers:
                        await self._custom_handlers[msg_type](message)
                        continue

                    if msg_type.startswith("session.") or msg_type == "error":
                        await self._handle_session_messages(message, msg_type)
                    elif msg_type.startswith("input_audio_buffer."):
                        await self._handle_audio_input_messages(message, msg_type)
                    elif msg_type.startswith("conversation.item."):
                        await self._handle_conversation_messages(message, msg_type)
                    elif msg_type.startswith("response."):
                        if msg_type == "response.function_call_arguments.done":
                            await self._handle_function_call(message)
                        else:
                            await self._handle_response_messages(message, msg_type)
                    elif msg_type == "heartbeat":
                        print("心跳消息")
                    else:
                        print(f"未处理的消息类型: {msg_type}")
                        print(message)

                except TimeoutError:
                    continue  # 超时后继续尝试接收
                except Exception as e:
                    if not self.shutdown_event or not self.shutdown_event.is_set():
                        print(f"接收消息时发生错误: {e}")
                    break
        finally:
            if not self.client.closed:
                await self.client.close()
                print("WebSocket连接已关闭")


async def create_message_handler(
    client: RTLowLevelClient, shutdown_event: Optional[asyncio.Event] = None
) -> MessageHandler:
    """
    创建消息处理器实例
    Args:
        client: WebSocket客户端实例
        shutdown_event: 关闭事件
    Returns:
        MessageHandler实例
    """
    return MessageHandler(client, shutdown_event)
