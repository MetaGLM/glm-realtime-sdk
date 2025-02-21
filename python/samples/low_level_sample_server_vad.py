# Copyright (c) ZhiPu Corporation.
# Licensed under the MIT license.

import asyncio
import base64
import os
import signal
import sys
import wave
from io import BytesIO
from typing import Optional

from dotenv import load_dotenv
from message_handler import create_message_handler

from rtclient import RTLowLevelClient
from rtclient.models import (
    InputAudioBufferAppendMessage,
    ServerVAD,
    SessionUpdateMessage,
    SessionUpdateParams,
)

shutdown_event: Optional[asyncio.Event] = None


def handle_shutdown(sig=None, frame=None):
    """处理关闭信号"""
    if shutdown_event:
        print("\n正在关闭程序...")
        shutdown_event.set()


async def send_audio(client: RTLowLevelClient, audio_file_path: str):
    """
    持续分帧发送音频：
    DefaultServerVADCfg
    var DefaultVadConfig = VadConfig{
        PositiveSpeechThreshold: 0.85,
        NegativeSpeechThreshold: 0.35,
        RedemptionFrames:        8, // 8x96ms = 768ms
        MinSpeechFrames:         3, // 3x96ms = 288ms
        PreSpeechPadFrames:      1,
        FrameSamples:            1536, // 96ms
        VadInterval:             32 * time.Millisecond,
    }
    """
    try:
        # 读取音频文件
        with wave.open(audio_file_path, "rb") as wave_file:
            channels = wave_file.getnchannels()
            sample_width = wave_file.getsampwidth()
            frame_rate = wave_file.getframerate()
            audio_data = wave_file.readframes(wave_file.getnframes())

        print(f"音频信息: 采样率={frame_rate}Hz, 声道数={channels}, 位深={sample_width*8}位")

        #  根据 servervad 的设置模拟一个较为贴合的场景, 计算相关参数, 实际使用时参数可以调整, ***不必严格遵守***
        frame_size = 1536  # 固定帧大小（采样点数）
        step_ms = 32  # 发送间隔（毫秒）
        step_samples = int(frame_rate * step_ms / 1000)  # 每步采样点数
        bytes_per_sample = sample_width * channels

        # 按步长分帧发送
        for pos in range(0, len(audio_data), step_samples * bytes_per_sample):
            # 提取当前帧数据
            frame_bytes = audio_data[pos : pos + frame_size * bytes_per_sample]
            if not frame_bytes:
                break

            # 构造WAV格式
            wav_io = BytesIO()
            with wave.open(wav_io, "wb") as wav_out:
                wav_out.setnchannels(channels)
                wav_out.setsampwidth(sample_width)
                wav_out.setframerate(frame_rate)
                wav_out.writeframes(frame_bytes)

            # 发送数据
            wav_io.seek(0)
            base64_data = base64.b64encode(wav_io.getvalue()).decode("utf-8")
            message = InputAudioBufferAppendMessage(
                audio=base64_data, client_timestamp=int(asyncio.get_event_loop().time() * 1000)
            )

            try:
                await client.send(message)
                await asyncio.sleep(step_ms / 1000)  # 等待下一帧
            except Exception as e:
                print(f"发送失败: {e}")
                break

    except Exception as e:
        print(f"音频处理失败: {e}")


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
            if shutdown_event.is_set():
                return

            session_message = SessionUpdateMessage(
                session=SessionUpdateParams(
                    input_audio_format="wav",
                    output_audio_format="pcm",
                    modalities={"audio", "text"},
                    turn_detection=ServerVAD(),
                    beta_fields={"chat_mode": "audio", "tts_source": "e2e", "auto_search": False},
                    tools=[],
                )
            )
            await client.send(session_message)

            if shutdown_event.is_set():
                return

            # 创建消息处理器
            message_handler = await create_message_handler(client, shutdown_event)

            # 创建发送和接收任务
            send_task = asyncio.create_task(send_audio(client, audio_file_path))
            receive_task = asyncio.create_task(message_handler.receive_messages())

            try:
                await asyncio.gather(send_task, receive_task)
            except Exception as e:
                print(f"任务执行出错: {e}")
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
        print("使用方法: python low_level_sample_server_vad.py <音频文件>")
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
