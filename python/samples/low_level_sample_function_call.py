# Copyright (c) ZhiPu Corporation.
# Licensed under the MIT license.

import asyncio
import base64
import os
import signal
import sys
from typing import Optional

from dotenv import load_dotenv
from message_handler import create_message_handler

from rtclient import RTLowLevelClient
from rtclient.models import (
    ClientVAD,
    InputAudioBufferAppendMessage,
    InputAudioBufferCommitMessage,
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
        with open(wave_file_path, "rb") as audio_file:
            return base64.b64encode(audio_file.read()).decode("utf-8")
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
        audio=base64_content, client_timestamp=int(asyncio.get_event_loop().time() * 1000)
    )
    await client.send(audio_message)


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
        async with RTLowLevelClient(
            url="wss://open.bigmodel.cn/api/paas/v4/realtime", headers={"Authorization": f"Bearer {api_key}"}
        ) as client:
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
                        "contact_name": {"type": "string", "description": "要拨打的联系人姓名"},
                    },
                    "required": ["contact_name"],
                },
            }

            session_message = SessionUpdateMessage(
                session=SessionUpdateParams(
                    input_audio_format="wav",
                    output_audio_format="pcm",
                    modalities={"audio", "text"},
                    turn_detection=ClientVAD(),
                    beta_fields={"chat_mode": "audio", "tts_source": "e2e", "auto_search": False},
                    tools=[phone_call_tool],  # 添加电话功能工具
                )
            )
            await client.send(session_message)

            if shutdown_event.is_set():
                return

            # 创建消息处理器
            message_handler = await create_message_handler(client, shutdown_event)

            async def send_audio_with_commit():
                # 发送音频数据
                await send_audio(client, audio_file_path)
                # 提交音频缓冲区
                commit_message = InputAudioBufferCommitMessage(
                    client_timestamp=int(asyncio.get_event_loop().time() * 1000)
                )
                await client.send(commit_message)

            # 创建发送和接收任务
            send_task = asyncio.create_task(send_audio_with_commit())
            receive_task = asyncio.create_task(message_handler.receive_messages())

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
