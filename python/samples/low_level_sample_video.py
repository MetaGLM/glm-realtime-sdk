import asyncio
import base64
import os
import signal
import sys
import time
from typing import Optional

from dotenv import load_dotenv
from message_handler import create_message_handler

from rtclient import RTLowLevelClient
from rtclient.models import (
    ClientVAD,
    InputAudioBufferAppendMessage,
    InputAudioBufferCommitMessage,
    InputVideoFrameAppendMessage,
    SessionUpdateMessage,
    SessionUpdateParams,
)

shutdown_event: Optional[asyncio.Event] = None


def handle_shutdown(sig=None, frame=None):
    """处理关闭信号"""
    if shutdown_event:
        print("\n正在关闭程序...")
        shutdown_event.set()


def encode_image_to_base64(image_path: str) -> str:
    """
    将图片文件转换为base64编码
    Args:
        image_path: 图片文件路径
    Returns:
        base64编码的字符串
    """
    try:
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")
    except Exception as e:
        print(f"图片文件处理错误: {str(e)}")
        return None


async def send_media(client: RTLowLevelClient, audio_file_path: str, image_file_path: str):
    """发送音频和视频帧，实现异步发送和时间戳管理"""
    # 编码音频和图片
    with open(audio_file_path, "rb") as audio_file:
        audio_base64 = base64.b64encode(audio_file.read()).decode("utf-8")

    image_base64 = encode_image_to_base64(image_file_path)
    if image_base64 is None:
        print("图片编码失败")
        return

    base_timestamp = int(time.time() * 1000)
    VIDEO_INTERVAL = 500  # 每500ms发送一帧，2fps

    async def send_audio():
        """异步发送音频数据"""
        audio_message = InputAudioBufferAppendMessage(audio=audio_base64, client_timestamp=base_timestamp)
        await client.send(audio_message)

    async def send_video():
        """异步发送视频帧"""
        video_timestamp = base_timestamp
        for _ in range(2):  # 2fps
            video_message = InputVideoFrameAppendMessage(video_frame=image_base64, client_timestamp=video_timestamp)
            await client.send(video_message)
            video_timestamp += VIDEO_INTERVAL
            await asyncio.sleep(VIDEO_INTERVAL / 1000)

    # 创建音频和视频的异步任务
    audio_task = asyncio.create_task(send_audio())
    video_task = asyncio.create_task(send_video())

    # 等待所有任务完成
    await asyncio.gather(audio_task, video_task)

    # 发送音频缓冲区提交信号
    commit_message = InputAudioBufferCommitMessage(client_timestamp=int(time.time() * 1000))
    await client.send(commit_message)


def get_env_var(var_name: str) -> str:
    value = os.environ.get(var_name)
    if not value:
        raise OSError(f"环境变量 '{var_name}' 未设置或为空。")
    return value


async def with_zhipu(audio_file_path: str, image_file_path: str):
    global shutdown_event
    shutdown_event = asyncio.Event()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, handle_shutdown)

    api_key = get_env_var("ZHIPU_API_KEY")
    try:
        async with RTLowLevelClient(
            url="wss://open.bigmodel.cn/api/paas/v4/realtime", headers={"Authorization": f"Bearer {api_key}"}
        ) as client:
            if shutdown_event.is_set():
                return

            # 使用消息模型发送会话配置
            session_message = SessionUpdateMessage(
                session=SessionUpdateParams(
                    input_audio_format="wav",
                    output_audio_format="pcm",
                    modalities={"audio", "text"},
                    turn_detection=ClientVAD(),
                    beta_fields={"chat_mode": "video_passive", "tts_source": "e2e", "auto_search": False},
                    tools=[],
                )
            )
            await client.send(session_message)

            if shutdown_event.is_set():
                return

            # 创建消息处理器
            message_handler = await create_message_handler(client, shutdown_event)

            # 创建发送和接收任务
            send_task = asyncio.create_task(send_media(client, audio_file_path, image_file_path))
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
    if len(sys.argv) < 3:
        print("使用方法: python low_level_sample_video.py <音频文件> <图片文件>")
        sys.exit(1)

    audio_path = sys.argv[1]
    image_path = sys.argv[2]

    if not os.path.exists(audio_path):
        print(f"音频文件 {audio_path} 不存在")
        sys.exit(1)

    if not os.path.exists(image_path):
        print(f"图片文件 {image_path} 不存在")
        sys.exit(1)

    try:
        asyncio.run(with_zhipu(audio_path, image_path))
    except KeyboardInterrupt:
        print("\n程序被用户中断")
    except Exception as e:
        print(f"程序执行出错: {e}")
    finally:
        print("程序已退出")
