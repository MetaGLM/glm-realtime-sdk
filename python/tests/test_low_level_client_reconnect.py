# Copyright (c) ZhiPu Corporation.
# Licensed under the MIT License.

import unittest
import asyncio
import logging
import aiohttp
from unittest.mock import AsyncMock, MagicMock, patch
from aiohttp import ClientSession, WSMsgType, WSServerHandshakeError, ClientConnectorError

from rtclient.low_level_client import RTLowLevelClient, ConnectionError


class TestRTLowLevelClientReconnect(unittest.TestCase):
    def setUp(self):
        # 设置测试用的日志级别
        logging.basicConfig(level=logging.DEBUG)
        # 创建事件循环
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

    def tearDown(self):
        # 关闭事件循环
        self.loop.close()

    @patch('rtclient.low_level_client.ClientSession')
    async def async_test_connect_success(self, mock_session):
        # 配置模拟对象
        mock_ws = AsyncMock()
        mock_ws.closed = False
        mock_session_instance = AsyncMock()
        mock_session_instance.ws_connect = AsyncMock(return_value=mock_ws)
        mock_session.return_value = mock_session_instance

        # 创建客户端并连接
        client = RTLowLevelClient("wss://example.com/ws")
        await client.connect()

        # 验证调用了正确的方法
        mock_session.assert_called_once()
        mock_session_instance.ws_connect.assert_called_once()
        self.assertFalse(client.closed)

        # 清理
        await client.close()

    @patch('rtclient.low_level_client.ClientSession')
    async def async_test_connect_failure_no_retry(self, mock_session):
        # 配置模拟对象以抛出异常
        mock_session_instance = AsyncMock()
        error = WSServerHandshakeError(request_info=MagicMock(), history=MagicMock(), status=403)
        mock_session_instance.ws_connect = AsyncMock(side_effect=error)
        mock_session.return_value = mock_session_instance

        # 创建客户端，设置不重试
        client = RTLowLevelClient("wss://example.com/ws", max_retries=0)
        
        # 尝试连接应该失败
        with self.assertRaises(ConnectionError):
            await client.connect()

        # 验证调用情况
        mock_session.assert_called_once()
        mock_session_instance.ws_connect.assert_called_once()
        self.assertTrue(client.closed)

    @patch('rtclient.low_level_client.ClientSession')
    @patch('rtclient.low_level_client.asyncio.sleep', new_callable=AsyncMock)
    async def async_test_reconnect_success_after_failure(self, mock_sleep, mock_session):
        # 配置模拟对象，第一次连接失败，第二次成功
        mock_ws = AsyncMock()
        mock_ws.closed = False
        mock_session_instance = AsyncMock()
        
        # 第一次调用抛出异常，第二次返回成功
        error = WSServerHandshakeError(request_info=MagicMock(), history=MagicMock(), status=500)
        mock_session_instance.ws_connect = AsyncMock(side_effect=[error, mock_ws])
        mock_session.return_value = mock_session_instance

        # 创建客户端，设置重试一次
        client = RTLowLevelClient("wss://example.com/ws", max_retries=1, initial_retry_delay=0.1)
        
        # 连接应该最终成功
        await client.connect()

        # 验证调用情况
        mock_session.assert_called_once()
        self.assertEqual(mock_session_instance.ws_connect.call_count, 2)
        mock_sleep.assert_called_once()
        self.assertFalse(client.closed)

        # 清理
        await client.close()

    @patch('rtclient.low_level_client.ClientSession')
    async def async_test_send_with_reconnect(self, mock_session):
        # 配置模拟对象
        mock_ws = AsyncMock()
        mock_ws.closed = False
        mock_ws.send_str = AsyncMock()
        
        mock_session_instance = AsyncMock()
        mock_session_instance.ws_connect = AsyncMock(return_value=mock_ws)
        mock_session.return_value = mock_session_instance

        # 创建客户端并连接
        client = RTLowLevelClient("wss://example.com/ws")
        await client.connect()
        
        # 模拟连接断开
        mock_ws.closed = True
        
        # 设置重连方法
        original_reconnect = client.reconnect
        client.reconnect = AsyncMock(side_effect=lambda: setattr(mock_ws, 'closed', False) or original_reconnect.__call__())
        
        # 尝试发送消息
        await client.send({"test": "message"})
        
        # 验证重连被调用
        client.reconnect.assert_called_once()
        # 验证消息被发送
        mock_ws.send_str.assert_called_once()

        # 清理
        await client.close()

    @patch('rtclient.low_level_client.ClientSession')
    async def async_test_recv_reconnect_on_error(self, mock_session):
        # 配置模拟对象
        mock_ws = AsyncMock()
        mock_ws.closed = False
        
        # 配置receive方法抛出异常
        error_msg = MagicMock()
        error_msg.type = WSMsgType.ERROR
        error_msg.data = "Connection error"
        mock_ws.receive = AsyncMock(return_value=error_msg)
        
        mock_session_instance = AsyncMock()
        mock_session_instance.ws_connect = AsyncMock(return_value=mock_ws)
        mock_session.return_value = mock_session_instance

        # 创建客户端并连接
        client = RTLowLevelClient("wss://example.com/ws")
        await client.connect()
        
        # 设置重连方法
        client.reconnect = AsyncMock(return_value=True)
        
        # 接收消息
        result = await client.recv()
        
        # 验证重连被调用
        client.reconnect.assert_called_once()
        # 返回值应为None
        self.assertIsNone(result)

        # 清理
        await client.close()

    def test_connect_success(self):
        self.loop.run_until_complete(self.async_test_connect_success())

    def test_connect_failure_no_retry(self):
        self.loop.run_until_complete(self.async_test_connect_failure_no_retry())

    def test_reconnect_success_after_failure(self):
        self.loop.run_until_complete(self.async_test_reconnect_success_after_failure())

    def test_send_with_reconnect(self):
        self.loop.run_until_complete(self.async_test_send_with_reconnect())

    def test_recv_reconnect_on_error(self):
        self.loop.run_until_complete(self.async_test_recv_reconnect_on_error())


if __name__ == '__main__':
    unittest.main()