import UserStream from './userStream.ts';
import ChatVAD, { VADOptions } from './vad.ts';
import StreamPlayer from './streamPlayer.ts';

/**
 * 1.不能同步响应的配置，均从options读取
 * 2.能同步响应的配置，均配置setter方法
 */
export interface ChatBaseOptions {
  audioElement?: HTMLAudioElement | null;
  ttsFormat?: 'mp3' | 'pcm';
  userStream?: {
    videoElement?: HTMLVideoElement | null;
    facingMode?: 'user' | 'environment';
    videoDevice?: 'screen' | 'camera';
    videoDeviceID?: string;
  };
  vadOptions?: VADOptions;
}

/*
 * 协议层的抽象层
 * 1.定义协议层必须使用的字段
 * 2.用于表示哪些字段和方法是允许友类访问的，与协议层的字段设计解耦，但实际还是从协议层访问，所以为抽象层
 *  */
export default abstract class ChatBase {
  // 表示用户正在说话
  abstract speeching: boolean;
  // 允许用户输入
  protected abstract active: boolean;
  // 用于协议层表示本轮对话结束的标记
  abstract ttsFinished: boolean;
  // 对话历史
  protected messageData: unknown[] = [];
  abstract start: () => void;
  abstract destroy: () => void;
  abstract log: (
    type: 'info' | 'error' | 'warning' | 'success',
    msg: string,
  ) => void;

  // 用户媒体流
  userStream: UserStream;
  // VAD实例
  vad: ChatVAD;
  // 流式播放器
  streamPlayer: StreamPlayer;
  // 允许自动播放缓存的TTS，主要用于用户与tts播放暂停的交互，手动暂停tts播放后，新收到的tts不会再自动播放，需要手动重新开启
  playBufferedTTS = true;
  // 允许用户打断tts的播放
  userInterrupt = true;
  // 此模式需要用更大的音量才能打断tts，属于优化交互的策略(尚不完善)
  interruptLouder = false;

  // tts播放状态由播放器维护
  get ttsPlaying() {
    return this.streamPlayer.playing;
  }

  protected constructor(protected options: ChatBaseOptions) {
    this.streamPlayer = new StreamPlayer(this, {
      audio: options.audioElement,
      format: options.ttsFormat,
    });
    this.userStream = new UserStream(this, options.userStream);
    this.vad = new ChatVAD(this, options.vadOptions);
  }
}
