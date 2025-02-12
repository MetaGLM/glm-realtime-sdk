# Copyright (c) ZhiPu Corporation.
# Licensed under the MIT license.

import asyncio
import base64
import json
import os
import signal
import sys
from typing import Optional

from dotenv import load_dotenv

from rtclient import RTLowLevelClient
from rtclient.models import (
    ClientVAD,
    FunctionCallOutputItem,
    InputAudioBufferAppendMessage,
    InputAudioBufferCommitMessage,
    ItemCreateMessage,
    SessionUpdateMessage,
    SessionUpdateParams,
)

shutdown_event: Optional[asyncio.Event] = None

def handle_shutdown(sig=None, frame=None):
    if shutdown_event:
        print("\n正在关闭程序...")
        shutdown_event.set()

def encode_wave_to_base64(wave_file_path):
    """将WAV文件转换为base64编码"""
    try:
        with open(wave_file_path, 'rb') as audio_file:
            return base64.b64encode(audio_file.read()).decode('utf-8')
    except Exception as e:
        print(f"音频文件处理错误: {str(e)}")
        return None

async def send_audio(client: RTLowLevelClient, audio_file_path: str):
    """发送音频"""
    base64_content = encode_wave_to_base64(audio_file_path)
    if base64_content is None:
        print("音频编码失败")
        return
    
    # 发送音频数据
    audio_message = InputAudioBufferAppendMessage(
        audio=base64_content,
        client_timestamp=int(asyncio.get_event_loop().time() * 1000)
    )
    await client.send(audio_message)

async def receive_messages(client: RTLowLevelClient):
    try:
        while not client.closed:
            if shutdown_event.is_set():
                print("正在停止消息接收...")
                break
                
            try:
                message = await asyncio.wait_for(client.recv(), timeout=1.0)
                if message is None:
                    continue


                msg_type = message.type if hasattr(message, 'type') else message.get('type')
                if msg_type is None:
                    print("收到未知类型的消息:", message)
                    continue

                match msg_type:
                    case "session.created":
                        print("会话创建消息")
                        print(f"  Session Id: {message.session.id}")
                    
                    case "error":
                        print("错误消息")
                        print(f"  Error: {message.error}")
                    
                    case "session.updated":
                        print("会话更新消息")
                        print(f"updated session: {message.session}")
                
                    case "input_audio_buffer.committed":
                        print("音频缓冲区提交消息")
                        print(f"  Item Id: {message.item_id}")
                        # 发送创建响应的消息
                        await client.send_json({"type": "response.create"})
                    
                    case "input_audio_buffer.speech_started":
                        print("语音开始消息")
                    
                    case "input_audio_buffer.speech_stopped":
                        print("语音结束消息")
                    
                    case "conversation.item.created":
                        print("会话项目创建消息")
                    
                    case "conversation.item.input_audio_transcription.completed":
                        print("输入音频转写完成消息")
                        print(f"  Transcript: {message.transcript}")
                    
                    case "response.created":
                        print("响应创建消息")
                        print(f"  Response Id: {message.response.id}")
                    
                    case "response.done":
                        print("响应完成消息")
                        if hasattr(message, 'response'):
                            print(f"  Response Id: {message.response.id}")
                            print(f"  Status: {message.response.status}")
                    
                    case "response.audio.delta":
                        print("模型音频增量消息")
                        print(f"  Response Id: {message.response_id}")
                        if message.delta:
                            print(f"  Delta Length: {len(message.delta)}")
                        else:
                            print("  Delta: None")
                    
                    case "response.audio_transcript.delta":
                        print("模型音频文本增量消息")
                        print(f"  Response Id: {message.response_id}")
                        print(f"  Delta: {message.delta if message.delta else 'None'}")
                    
                    case "response.function_call_arguments.done":
                        print("函数调用参数完成消息")
                        print(f"  Response Id: {message.response_id}")
                        print(f"  Function Name: {message.name}")
                        print(f"  Arguments: {message.arguments}")
                        
                        # 解析函数调用参数
                        try:
                            args = json.loads(message.arguments)
                            # 模拟电话功能的响应
                            response = {
                                "status": "success",
                                "message": f"成功拨打电话给 {args.get('contact_name', '未知姓名')}"
                            }
                            
                            # 创建函数调用输出项
                            output_item = FunctionCallOutputItem(
                                output=json.dumps(response, ensure_ascii=False)
                            )
                            
                            # 发送函数调用结果
                            create_message = ItemCreateMessage(
                                item=output_item
                            )
                            await client.send(create_message)
                            
                            # 发送 response.create 让模型生成回复
                            await client.send_json({"type": "response.create"})
                            
                        except json.JSONDecodeError as e:
                            print(f"解析函数调用参数失败: {e}")
                    
                    case "heartbeat":
                        print("心跳消息")
                    case "response.audio.done":
                        print("模型音频完成消息")
                    case "response.audio_transcript.done":
                        print("模型音频文本完成消息")
                    case _:
                        print(f"未处理的消息类型: {msg_type}")
                        print(message)
            except TimeoutError:
                continue  # 超时后继续尝试接收
            except Exception as e:
                if not shutdown_event.is_set():
                    print(f"接收消息时发生错误: {e}")
                break
    finally:
        if not client.closed:
            await client.close()
            print("WebSocket连接已关闭")

def get_env_var(var_name: str) -> str:
    value = os.environ.get(var_name)
    if not value:
        raise OSError(f"环境变量 '{var_name}' 未设置或为空。")
    return value

async def with_zhipu(audio_file_path: str):
    global shutdown_event
    shutdown_event = asyncio.Event()
    

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, handle_shutdown)
        
    api_key = get_env_var("ZHIPU_API_KEY")
    try:
        async with RTLowLevelClient(url="wss://open.bigmodel.cn/api/paas/v4/realtime", headers={"Authorization": f"Bearer {api_key}"}) as client:
            # 发送会话配置
            if shutdown_event.is_set():
                return
            # phone_call_tool 电话 tool
            phone_call_tool = {
                "type": "function",
                "name": "phoneCall",
                "description": "拨打电话给指定的联系人",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "contact_name": {
                            "type": "string",
                            "description": "要拨打的联系人姓名"
                        },
                    },
                    "required": ["contact_name"]
                }
            }
                
            session_message = SessionUpdateMessage(
                session=SessionUpdateParams(
                    input_audio_format="wav",
                    output_audio_format="pcm",
                    modalities={"audio", "text"},
                    turn_detection=ClientVAD(),
                    beta_fields={
                        "chat_mode": "audio",
                        "tts_source": "e2e",
                        "auto_search": False
                    },
                    tools=[phone_call_tool]  # 添加电话功能工具
                )
            )
            await client.send(session_message)
            
            if shutdown_event.is_set():
                return

            async def send_audio_with_commit():
                # 发送音频数据
                await send_audio(client, audio_file_path)
                # 提交音频缓冲区
                commit_message = InputAudioBufferCommitMessage(
                    client_timestamp=int(asyncio.get_event_loop().time() * 1000)
                )
                await client.send(commit_message)
            
            
            send_task = asyncio.create_task(send_audio_with_commit())
            receive_task = asyncio.create_task(receive_messages(client))
            
            # 等待任务完成
            try:
                await asyncio.gather(send_task, receive_task)
            except Exception as e:
                print(f"任务执行出错: {e}")
                # 取消未完成的任务
                for task in [send_task, receive_task]:
                    if not task.done():
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass
    except Exception as e:
        print(f"发生错误: {e}")
    finally:
        if shutdown_event.is_set():
            print("程序已完成退出")

if __name__ == "__main__":
    load_dotenv()
    if len(sys.argv) < 2:
        print("使用方法: python low_level_sample_function_call.py <音频文件>")
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(f"音频文件 {file_path} 不存在")
        sys.exit(1)

    try:
        asyncio.run(with_zhipu(file_path))
    except KeyboardInterrupt:
        print("\n程序被用户中断")
    except Exception as e:
        print(f"程序执行出错: {e}")
    finally:
        print("程序已退出") 