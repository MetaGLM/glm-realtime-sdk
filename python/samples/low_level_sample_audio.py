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
    """处理关闭信号"""
    if shutdown_event:
        print("\n正在关闭程序...")
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
        with wave.open(wave_file_path, 'rb') as wave_file:
            # 获取音频参数
            channels = wave_file.getnchannels()
            sample_width = wave_file.getsampwidth()
            frame_rate = wave_file.getframerate()
            frames = wave_file.readframes(wave_file.getnframes())
            
            # 验证音频参数是否合法
            if channels < 1 or sample_width < 1 or frame_rate <= 0:
                print(f"无效的音频参数: channels={channels}, sample_width={sample_width}, frame_rate={frame_rate}")
                return None
            
            # 创建字节流并写入标准WAV格式
            wave_io = BytesIO()
            with wave.open(wave_io, 'wb') as wave_out:
                # 设置WAV文件头部信息
                wave_out.setnchannels(channels)
                wave_out.setsampwidth(sample_width)  # 位深度 (1 = 8位, 2 = 16位, etc.)
                wave_out.setframerate(frame_rate)    # 采样率 (常见值: 44100, 48000)
                # 写入音频数据
                wave_out.writeframes(frames)

            # 确保写入完整的WAV文件数据
            wave_io.seek(0)
            
            # 获取字节数据并编码为base64
            print(f"音频参数: 声道数={channels}, 位深度={sample_width*8}位, 采样率={frame_rate}Hz")
            return base64.b64encode(wave_io.getvalue()).decode('utf-8')
    except Exception as e:
        print(f"音频文件处理错误: {str(e)}")
        return None


async def send_audio(client: RTLowLevelClient, audio_file_path: str):
    """发送音频"""
    base64_content = encode_wave_to_base64(audio_file_path)
    if base64_content is None:
        print("音频编码失败")
        return
    
    # 验证音频数据长度
    if len(base64_content) == 0:
        print("音频数据为空")
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

                # 直接获取消息类型
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
                        print(f"  Arguments: {message.arguments if message.arguments else 'None'}")
                    
                    case "heartbeat":
                        print("心跳消息")
                    
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
                    tools=[]
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
        print("使用方法: python low_level_sample.py <音频文件>")
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

