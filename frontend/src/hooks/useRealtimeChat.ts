import {
  createContext,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import RealtimeChat, {
  RealtimeOptions,
} from '../utils/chatSDK/realtimeChat.ts';
import { RealtimeStatus } from '@/types/realtime.ts';
import { TagProps } from 'antd';

type Props = Omit<RealtimeOptions, 'audioElement'> & {
  videoElement?: RefObject<HTMLVideoElement | null>;
  audioElement?: RefObject<HTMLAudioElement | null>;
};

export const RealtimeChatContext = createContext<{
  current: RealtimeChat | undefined;
}>({ current: undefined });

export const statusTextMap: Record<RealtimeStatus, string> = {
  READY: '准备就绪',
  USER_MEDIA_AUDIO_INIT: '申请麦克风权限',
  USER_MEDIA_VIDEO_INIT: '申请摄像头权限',
  USER_MEDIA_AUDIO_ERROR: '用户音频流请求失败',
  USER_MEDIA_VIDEO_ERROR: '用户视频流请求失败',
  VAD_INIT: 'VAD 初始化',
  VAD_INIT_ERROR: 'VAD 初始化失败',
  STREAM_PLAYER_INIT: '流媒体播放器初始化',
  STREAM_PLAYER_INIT_ERROR: '流媒体播放器初始化失败',
  WS_INIT: 'WebSocket 初始化',
  WS_OPEN: 'WebSocket 已连接',
  WS_CLOSE: 'WebSocket 已断开',
  WS_ERROR: 'WebSocket 连接错误',
  SESSION_UPDATE: '更新会话配置',
  APP_AVAILABLE: '应用可用',
};

export const statusColorMap: Record<RealtimeStatus, TagProps['color']> = {
  READY: 'processing',
  USER_MEDIA_AUDIO_INIT: 'processing',
  USER_MEDIA_VIDEO_INIT: 'processing',
  USER_MEDIA_AUDIO_ERROR: 'error',
  USER_MEDIA_VIDEO_ERROR: 'error',
  VAD_INIT: 'processing',
  VAD_INIT_ERROR: 'error',
  STREAM_PLAYER_INIT: 'processing',
  STREAM_PLAYER_INIT_ERROR: 'error',
  WS_INIT: 'processing',
  WS_OPEN: 'success',
  WS_CLOSE: 'warning',
  WS_ERROR: 'error',
  SESSION_UPDATE: 'processing',
  APP_AVAILABLE: 'success',
};

const useRealtimeChat = (props: Props) => {
  const {
    onMessage,
    onLog,
    onSubmitCustomCallTools,
    onActive,
    onSpeeching,
    onHistory,
    ...options
  } = props;
  const {
    wsURL,
    audioElement,
    videoElement,
    inputMode = 'manual',
    ttsFormat = 'pcm',
    userStream = {},
    vadOptions = {},
    sessionConfig,
    chatMode,
  } = options;

  const chatInstance = useRef<RealtimeChat | undefined>();

  const [active, setActive] = useState(false);
  const [speeching, setSpeeching] = useState(false);
  const [vadOpen, setVadOpen] = useState(false);
  const [status, setStatus] = useState<RealtimeStatus>('READY');

  useEffect(() => {
    return () => {
      chatInstance.current?.destroy();
    };
  }, []);

  const init = () => {
    if (chatInstance.current) {
      chatInstance.current.destroy();
    }
    chatInstance.current = new RealtimeChat({
      wsURL,
      sessionConfig,
      chatMode,
      inputMode,
      ttsFormat,
      useHistory: true,
      onHistory,
      audioElement: audioElement?.current,
      userStream: {
        ...userStream,
        videoElement: videoElement?.current,
      },
      vadOptions,
      onVADOpen: setVadOpen,
      onActive: active => {
        setActive(active);
        onActive?.(active);
      },
      onSpeeching: speeching => {
        setSpeeching(speeching);
        onSpeeching?.(speeching);
      },
      onStatus: setStatus,
      onMessage,
      onLog,
      onSubmitCustomCallTools,
    });
  };

  const start = useCallback(async () => {
    if (!chatInstance.current) return;
    await chatInstance.current.start();
  }, []);

  const close = useCallback(() => {
    if (!chatInstance.current) return;
    chatInstance.current.destroy();
    chatInstance.current = undefined;
  }, []);

  const manualTalk = useCallback(() => {
    if (!chatInstance.current) return;
    chatInstance.current.manualTalk();
  }, []);

  const releaseManualTalk = useCallback(() => {
    if (!chatInstance.current) return;
    chatInstance.current.releaseManualTalk();
  }, []);

  const updateSessionConfig = useCallback(() => {
    if (!chatInstance.current) return;
    chatInstance.current.updateSessionConfig();
  }, []);

  return {
    init,
    active,
    speeching,
    manualTalk,
    releaseManualTalk,
    start,
    close,
    vadOpen,
    status,
    chatInstance,
    updateSessionConfig,
  };
};

export default useRealtimeChat;
