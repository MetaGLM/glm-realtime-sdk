import RealtimeChat from '@/utils/chatSDK/realtimeChat';

declare global {
  interface Window {
    realtime?: RealtimeChat;
  }
}

export {};
