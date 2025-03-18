# Copyright (c) ZhiPu Corporation.
# Licensed under the MIT License.

import json
import uuid
import logging
import asyncio
import random
from collections.abc import AsyncIterator
from typing import Any, Optional, Callable

from aiohttp import ClientSession, WSMsgType, WSServerHandshakeError, ClientConnectorError

from rtclient.models import ServerMessageType, UserMessageType, create_message_from_dict
from rtclient.util.user_agent import get_user_agent


logger = logging.getLogger(__name__)


class ConnectionError(Exception):
    def __init__(self, message: str, headers=None):
        super().__init__(message)
        self.headers = headers


class RTLowLevelClient:
    def __init__(
        self,
        url: str,
        headers: Optional[dict[str, str]] = None,
        params: Optional[dict[str, Any]] = None,
        max_retries: int = 5,
        initial_retry_delay: float = 1.0,
        max_retry_delay: float = 30.0,
        retry_jitter: float = 0.1,
        on_reconnect: Optional[Callable[[], None]] = None,
    ):
        """初始化WebSocket客户端

        Args:
            url: WebSocket服务器地址
            headers: 请求头
            params: URL参数
            max_retries: 最大重试次数, 设置为0表示不重试, 设置为-1表示无限重试
            initial_retry_delay: 初始重试延迟(秒)
            max_retry_delay: 最大重试延迟(秒)
            retry_jitter: 随机波动因子(0-1之间), 用于避免重连风暴
            on_reconnect: 重连成功后的回调函数
        """
        self._url = url
        self._headers = headers or {}
        self._params = params or {}
        self._session = None
        self.request_id: Optional[uuid.UUID] = None
        self.ws = None
        
        # 重连参数
        self._max_retries = max_retries
        self._initial_retry_delay = initial_retry_delay
        self._max_retry_delay = max_retry_delay
        self._retry_jitter = retry_jitter
        self._on_reconnect = on_reconnect
        self._reconnecting = False
        self._retry_count = 0
        self._should_reconnect = True
        
    async def connect(self):
        """连接到WebSocket服务器"""
        if self._session is None:
            self._session = ClientSession()
            
        self._retry_count = 0
        self._should_reconnect = True
        await self._do_connect()
        
    async def _do_connect(self):
        """执行实际的连接逻辑"""
        try:
            self.request_id = uuid.uuid4()
            headers = {
                "User-Agent": get_user_agent(),
                **self._headers
            }
            self.ws = await self._session.ws_connect(
                self._url,
                headers=headers,
                params=self._params
            )
            logger.info("WebSocket连接成功")
            self._retry_count = 0  # 连接成功后重置重试计数
            self._reconnecting = False
            
            # 如果这是重连成功，则调用回调
            if self._retry_count > 0 and self._on_reconnect:
                self._on_reconnect()
                
        except (WSServerHandshakeError, ClientConnectorError) as e:
            error_type = "握手" if isinstance(e, WSServerHandshakeError) else "连接"
            status = getattr(e, 'status', 'unknown')
            error_message = f"WebSocket{error_type}失败，状态码: {status}"
            logger.error(error_message)
            
            if not await self._handle_connection_failure(e):
                if self._session:
                    await self._session.close()
                headers = getattr(e, 'headers', None)
                raise ConnectionError(error_message, headers) from e

    async def _handle_connection_failure(self, exception) -> bool:
        """处理连接失败的情况，尝试重连
        
        Returns:
            bool: 如果将继续重连则返回True，否则返回False
        """
        # 检查是否需要重连
        if self._max_retries == 0 or (self._max_retries > 0 and self._retry_count >= self._max_retries):
            logger.warning(f"达到最大重试次数 {self._max_retries}，停止重连")
            return False
        
        if not self._should_reconnect:
            logger.info("重连已被禁用，不再尝试重连")
            return False
            
        if self._reconnecting:
            logger.debug("已经在重连中，跳过重连请求")
            return True
            
        self._reconnecting = True
        self._retry_count += 1
        
        # 计算指数退避延迟时间（带随机抖动）
        delay = min(self._initial_retry_delay * (2 ** (self._retry_count - 1)), self._max_retry_delay)
        jitter = random.uniform(-self._retry_jitter, self._retry_jitter)
        adjusted_delay = max(0.1, delay * (1 + jitter))
        
        logger.info(f"尝试第 {self._retry_count} 次重连，等待 {adjusted_delay:.2f} 秒")
        
        # 异步等待后重连
        try:
            await asyncio.sleep(adjusted_delay)
            await self._do_connect()
            return True
        except Exception as e:
            logger.error(f"重连过程中发生错误: {e}")
            self._reconnecting = False
            return True  # 继续让上层处理重连逻辑
            
    async def reconnect(self) -> bool:
        """手动触发重连
        
        Returns:
            bool: 重连是否成功
        """
        if self._reconnecting:
            logger.warning("已在重连过程中，忽略重连请求")
            return False
            
        logger.info("手动触发重连")
        self._reconnecting = True
        
        try:
            # 确保旧连接已关闭
            if self.ws and not self.ws.closed:
                await self.ws.close()
                
            await self._do_connect()
            return not self.closed
        except Exception as e:
            logger.error(f"手动重连失败: {e}")
            return False
        finally:
            self._reconnecting = False
            
    async def send(self, message: UserMessageType | dict[str, Any]):
        """发送消息到服务器

        Args:
            message: 要发送的消息，可以是 UserMessageType 或 dict
        """
        if self.ws is None or self.ws.closed:
            logger.error("WebSocket连接已关闭，无法发送消息")
            await self.reconnect()
            if self.ws is None or self.ws.closed:
                raise ConnectionError("WebSocket连接已关闭且重连失败，无法发送消息")
                
        try:
            if hasattr(message, 'model_dump_json'):
                message_data = message.model_dump_json()
            else:
                message_data = json.dumps(message)
            await self.ws.send_str(message_data)
        except Exception as e:
            logger.error(f"发送消息失败: {e}")
            # 尝试重连并重新发送
            if await self.reconnect():
                # 重连成功，重试发送
                if hasattr(message, 'model_dump_json'):
                    message_data = message.model_dump_json()
                else:
                    message_data = json.dumps(message)
                await self.ws.send_str(message_data)
            else:
                raise

    async def send_json(self, message: dict[str, Any]):
        """发送JSON消息到服务器

        Args:
            message: 要发送的JSON消息
        """
        if self.ws is None or self.ws.closed:
            logger.error("WebSocket连接已关闭，无法发送JSON消息")
            await self.reconnect()
            if self.ws is None or self.ws.closed:
                raise ConnectionError("WebSocket连接已关闭且重连失败，无法发送JSON消息")
                
        try:
            await self.ws.send_json(message)
        except Exception as e:
            logger.error(f"发送JSON消息失败: {e}")
            # 尝试重连并重新发送
            if await self.reconnect():
                await self.ws.send_json(message)
            else:
                raise

    async def recv(self) -> Optional[ServerMessageType]:
        """接收服务器消息

        Returns:
            接收到的消息对象
        """
        if self.ws is None or self.ws.closed:
            logger.error("WebSocket连接已关闭，无法接收消息")
            await self.reconnect()
            if self.ws is None or self.ws.closed:
                return None
                
        try:
            websocket_message = await self.ws.receive()
            
            if websocket_message.type == WSMsgType.TEXT:
                data = json.loads(websocket_message.data)
                msg = create_message_from_dict(data)
                return msg
            elif websocket_message.type == WSMsgType.CLOSED:
                logger.warning("服务器关闭了WebSocket连接")
                await self.reconnect()
                return None
            elif websocket_message.type == WSMsgType.ERROR:
                logger.error(f"WebSocket连接错误: {websocket_message.data}")
                await self.reconnect()
                return None
            else:
                return None
        except Exception as e:
            logger.error(f"接收消息时发生错误: {e}")
            await self.reconnect()
            return None

    def __aiter__(self) -> AsyncIterator[ServerMessageType]:
        return self

    async def __anext__(self):
        message = await self.recv()
        if message is None:
            raise StopAsyncIteration
        return message

    async def close(self):
        """关闭连接"""
        self._should_reconnect = False  # 禁用重连
        
        if self.ws:
            try:
                await self.ws.close()
            except Exception as e:
                logger.warning(f"关闭WebSocket连接时发生错误: {e}")
                
        if self._session:
            try:
                await self._session.close()
                self._session = None
            except Exception as e:
                logger.warning(f"关闭HTTP会话时发生错误: {e}")

    @property
    def closed(self) -> bool:
        """连接是否已关闭"""
        return self.ws.closed if self.ws else True

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, *args):
        await self.close()
