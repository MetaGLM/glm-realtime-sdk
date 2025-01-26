import asyncio
import base64
import os
import signal
import sys
import time
from io import BytesIO
from typing import Optional

from dotenv import load_dotenv
from PIL import Image

from rtclient import RTLowLevelClient

# 全局变量用于控制程序状态
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
        with open(image_path, 'rb') as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    except Exception as e:
        print(f"图片文件处理错误: {str(e)}")
        return None


async def send_media(client: RTLowLevelClient, audio_file_path: str, image_file_path: str):
    """发送音频和视频帧，实现异步发送和时间戳管理"""
    # 编码音频
    with open(audio_file_path, 'rb') as audio_file:
        audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
    
    # 编码图片
    image_base64 = encode_image_to_base64(image_file_path)
    if image_base64 is None:
        print("图片编码失败")
        return

    # 基准时间戳
    base_timestamp = int(time.time() * 1000)
    
    # 视频发送间隔(ms)，2fps
    VIDEO_INTERVAL = 500   # 每500ms发送一帧，2fps
    
    async def send_audio():
        """异步发送音频数据"""
        # 发送音频数据，只发送一次
        audio_data = {
            "type": "input_audio_buffer.append",
            "audio": audio_base64,
            "client_timestamp": base_timestamp
        }
        await client.send_json(audio_data)
    
    async def send_video():
        """异步发送视频帧"""
        video_timestamp = base_timestamp
        # 在音频持续时间内发送视频帧
        # 假设音频长度为1秒，则需要发送2帧
        for _ in range(2):  # 2fps
            video_data = {
                "type": "input_audio_buffer.append_video_frame",
                "video_frame": image_base64,
                "client_timestamp": video_timestamp
            }
            await client.send_json(video_data)
            video_timestamp += VIDEO_INTERVAL
            await asyncio.sleep(VIDEO_INTERVAL / 1000)  # 转换为秒
    
    # 创建音频和视频的异步任务
    audio_task = asyncio.create_task(send_audio())
    video_task = asyncio.create_task(send_video())
    
    # 等待所有任务完成
    await asyncio.gather(audio_task, video_task)
    
    # 发送音频缓冲区提交信号
    commit_data = {
        "type": "input_audio_buffer.commit",
        "client_timestamp": int(time.time() * 1000)
    }
    await client.send_json(commit_data)


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
                msg_type = message.type
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
                        print(f"  Content Index: {message.content_index}")
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
                    
                    case "response.video.delta":
                        print("模型视频增量消息")
                        print(f"  Response Id: {message.response_id}")
                        if message.delta:
                            print(f"  Delta Length: {len(message.delta)}")
                        else:
                            print("  Delta: None")
                    
                    case "response.video_transcript.delta":
                        print("模型视频文本增量消息")
                        print(f"  Response Id: {message.response_id}")
                        print(f"  Delta: {message.delta if message.delta else 'None'}")
                    
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


async def with_zhipu(audio_file_path: str, image_file_path: str):
    global shutdown_event
    shutdown_event = asyncio.Event()
    
    # 设置信号处理
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, handle_shutdown)
        
    api_key = get_env_var("ZHIPU_API_KEY")
    try:
        async with RTLowLevelClient(url="wss://open.bigmodel.cn/api/paas/v4/realtime", headers={"Authorization": f"Bearer {api_key}"}) as client:
            # 发送会话配置
            if shutdown_event.is_set():
                return
                
            await client.send_json({
                "type": "session.update",
                "session": {
                    "input_audio_format": "wav",
                    "output_audio_format": "pcm",
                    "modalities": ["audio", "text"],
                    "turn_detection": {"type": "client_vad"},
                    "beta_fields": {
                        "chat_mode": "video_passive",
                        "tts_source": "e2e",
                        "auto_search": False
                    },
                    "tools": []
                }
            })
            
            if shutdown_event.is_set():
                return
                
            # 发送音频和视频数据
            await send_media(client, audio_file_path, image_file_path)
            
            if shutdown_event.is_set():
                return
                
            # 接收消息
            await receive_messages(client)
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