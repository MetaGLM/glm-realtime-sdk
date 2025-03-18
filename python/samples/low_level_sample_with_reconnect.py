# Copyright (c) ZhiPu Corporation.
# Licensed under the MIT license.

import asyncio
import base64
import os
import signal
import sys
import wave
import logging
import random
from io import BytesIO
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

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("reconnect_demo")

shutdown_event: Optional[asyncio.Event] = None


def handle_shutdown(sig=None, frame=None):
    """处理关闭信号"""
    if shutdown_event:
        logger.info("正在关闭程序...")
        shutdown_event.set()


def encode_wave_to_base64(wave_file_path):
    """
    将WAV文件转换为base64编码，确保生成标准的WAV格式
    Args:
        wave_file_path: WAV文件路径
    Returns:
        base64编码的字符串
    """
    try:
        with wave.open(wave_file_path, "rb") as wave_file:
            # 获取音频参数
            channels = wave_file.getnchannels()
            sample_width = wave_file.getsampwidth()
            frame_rate = wave_file.getframerate()
            frames = wave_file.readframes(wave_file.getnframes())

            # 验证音频参数是否合法
            if channels < 1 or sample_width < 1 or frame_rate <= 0:
                logger.error(f"无效的音频参数: channels={channels}, sample_width={sample_width}, frame_rate={frame_rate}")
                return None

            # 创建字节流并写入标准WAV格式
            wave_io = BytesIO()
            with wave.open(wave_io, "wb") as wave_out:
                # 设置WAV文件头部信息
                wave_out.setnchannels(channels)
                wave_out.setsampwidth(sample_width)  # 位深度 (1 = 8位, 2 = 16位, etc.)
                wave_out.setframerate(frame_rate)  # 采样率 (常见值: 44100, 48000)
                # 写入音频数据
                wave_out.writeframes(frames)

            # 确保写入完整的WAV文件数据
            wave_io.seek(0)

            # 获取字节数据并编码为base64
            logger.info(f"音频参数: 声道数={channels}, 位深度={sample_width*8}位, 采样率={frame_rate}Hz")
            return base64.b64encode(wave_io.getvalue()).decode("utf-8")
    except Exception as e:
        logger.error(f"音频文件处理错误: {str(e)}")
        return None


async def send_audio(client: RTLowLevelClient, audio_file_path: str):
    """发送音频"""
    base64_content = encode_wave_to_base64(audio_file_path)
    if base64_content is None:
        logger.error("音频编码失败")
        return

    # 验证音频数据长度
    if len(base64_content) == 0:
        logger.error("音频数据为空")
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


class ConnectionBreaker:
    """模拟网络连接中断的工具类"""
    def __init__(self, client: RTLowLevelClient):
        self.client = client
        self.break_task = None
        self.enabled = False
        
    def start(self, min_interval=10, max_interval=30):
        """开始模拟随机断开连接"""
        self.enabled = True
        self.break_task = asyncio.create_task(self._run_breaker(min_interval, max_interval))
        
    def stop(self):
        """停止模拟随机断开连接"""
        self.enabled = False
        if self.break_task:
            self.break_task.cancel()
            
    async def _run_breaker(self, min_interval, max_interval):
        """执行随机断开连接的循环"""
        while self.enabled:
            # 随机等待一段时间
            interval = random.uniform(min_interval, max_interval)
            logger.info(f"计划在 {interval:.2f} 秒后模拟连接中断")
            await asyncio.sleep(interval)
            
            if not self.enabled:
                break
                
            # 模拟连接中断
            logger.warning("模拟连接中断...")
            if hasattr(self.client, 'ws') and self.client.ws:
                try:
                    # 强制关闭连接但不触发正常关闭流程
                    await self.client.ws.close(code=1006, message=b"Simulated network interruption")
                except Exception as e:
                    logger.error(f"模拟中断时出错: {e}")


async def on_reconnect():
    """重连成功的回调函数"""
    logger.info("重连成功，重新初始化会话状态...")


async def with_zhipu(audio_file_path: str, simulate_breaks=True):
    global shutdown_event
    shutdown_event = asyncio.Event()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, handle_shutdown)

    api_key = get_env_var("ZHIPU_API_KEY")
    try:
        # 使用新的重连参数创建客户端
        client = RTLowLevelClient(
            url="wss://open.bigmodel.cn/api/paas/v4/realtime", 
            headers={"Authorization": f"Bearer {api_key}"},
            max_retries=5,                # 最多重试5次
            initial_retry_delay=1.0,      # 初始1秒延迟
            max_retry_delay=15.0,         # 最大15秒延迟
            retry_jitter=0.2,             # 20%的随机抖动
            on_reconnect=on_reconnect     # 重连成功后的回调
        )
        
        # 创建连接断开模拟器
        connection_breaker = ConnectionBreaker(client)
        
        try:
            await client.connect()
            
            # 如果需要，启动连接断开模拟器
            if simulate_breaks:
                connection_breaker.start(min_interval=5, max_interval=15)  # 5-15秒随机断开
                logger.info("已启动连接断开模拟器")
            
            # 发送会话配置
            if shutdown_event.is_set():
                return

            session_message = SessionUpdateMessage(
                session=SessionUpdateParams(
                    input_audio_format="wav",
                    output_audio_format="pcm",
                    modalities={"audio", "text"},
                    turn_detection=ClientVAD(),
                    beta_fields={"chat_mode": "audio", "tts_source": "e2e", "auto_search": False},
                    tools=[],
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
                # 发送创建响应的消息
                await client.send_json({"type": "response.create"})

            # 创建发送和接收任务
            send_task = asyncio.create_task(send_audio_with_commit())
            receive_task = asyncio.create_task(message_handler.receive_messages())

            # 等待任务完成
            try:
                await asyncio.gather(send_task, receive_task)
            except Exception as e:
                logger.error(f"任务执行出错: {e}")
                # 取消未完成的任务
                for task in [send_task, receive_task]:
                    if not task.done():
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass
        finally:
            # 停止连接断开模拟器
            if simulate_breaks:
                connection_breaker.stop()
                logger.info("已停止连接断开模拟器")
            # 关闭客户端连接
            await client.close()
    except Exception as e:
        logger.error(f"发生错误: {e}")
    finally:
        if shutdown_event.is_set():
            logger.info("程序已完成退出")


if __name__ == "__main__":
    load_dotenv()
    if len(sys.argv) < 2:
        print("使用方法: python low_level_sample_with_reconnect.py <音频文件> [--no-simulate]")
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(f"音频文件 {file_path} 不存在")
        sys.exit(1)
        
    # 检查是否禁用断开模拟
    simulate_breaks = True
    if len(sys.argv) > 2 and sys.argv[2] == "--no-simulate":
        simulate_breaks = False
        print("断开连接模拟已禁用")

    try:
        asyncio.run(with_zhipu(file_path, simulate_breaks))
    except KeyboardInterrupt:
        print("\n程序被用户中断")
    except Exception as e:
        print(f"程序执行出错: {e}")
    finally:
        print("程序已退出")