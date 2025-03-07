import {
  base64ToUnit8Arr,
  convertPCMBase64ToFloat32Array,
} from '@/utils/chatHelper.ts';
import ChatBase from './chatBase.ts';
import MediaStreamPlayer from './mediaSourcePlayer.ts';
import PCMPlayer from './pcmPlayer.ts';

type StreamPlayerOptions = {
  format?: 'mp3' | 'pcm';
  audio?: HTMLAudioElement | null;
};

/**
 * 流式播放器的规范
 * 1.接入流式播放器的实例，统一方法来抹平差异，对于特定的播放器，也可以额外定制自己的方法，但是要按条件调用
 *
 *
 */

export default class StreamPlayer {
  // 能被客户端支持流式管理的音频格式
  // mp3 属于mpeg，受浏览器mediasource api支持
  // pcm 属于wav，受浏览器web audio api支持
  format: 'mp3' | 'pcm' = 'pcm';
  // 提供的播放器，可以直接在这里添加
  player: MediaStreamPlayer | PCMPlayer;
  // tts的音频片段
  ttsChunks: ArrayBuffer[] = [];

  constructor(
    private chatBase: ChatBase,
    private options: StreamPlayerOptions,
  ) {
    this.format = options.format ?? 'pcm';
    if (this.format === 'mp3') {
      this.player = this.createMediaStreamPlayer();
    } else if (this.format === 'pcm') {
      this.player = this.createPcmPlayer();
    } else {
      this.player = this.createMediaStreamPlayer();
    }
  }

  // 设置音频格式
  /**
   * 设置音频格式
   * @param format - 音频格式，支持 'mp3' 或 'pcm'
   * @returns Promise<void>
   *
   * 在realtime api中，被播放的音频格式作为状态被前后端维护，所以需要先在协议层上报新的格式，待后端响应后，再本地切换播放器
   * 如果切换时有任务在进行，新的音频格式在下轮对话生效
   * 直接执行会打断播放，影响已缓存的ttsChunks
   *
   * 1. 如果新格式与当前格式相同，直接返回
   * 2. 销毁当前播放器实例，并清空ttsChunks
   * 3. 更新格式
   * 4. 根据新格式创建对应的播放器实例
   * 5. 初始化新播放器
   */
  setFormat = async (format: 'mp3' | 'pcm') => {
    if (format === this.format) return;
    this.destroy();
    this.format = format;
    if (format === 'mp3') {
      this.player = this.createMediaStreamPlayer();
    } else {
      this.player = this.createPcmPlayer();
    }
    await this.init();
  };

  createMediaStreamPlayer = () => {
    return new MediaStreamPlayer(this.chatBase, {
      audioElement: this.options.audio ?? new Audio(),
    });
  };

  createPcmPlayer = () => {
    return new PCMPlayer();
  };

  get playing() {
    return this.player.playing;
  }

  init = async () => {
    await this.player.init();
  };

  append = (audioParts: string) => {
    if (this.format === 'mp3') {
      const parts = base64ToUnit8Arr(audioParts);
      (this.player as MediaStreamPlayer).adaptBuffer(parts);
      this.ttsChunks.push(parts as ArrayBuffer);
    } else if (this.format === 'pcm') {
      const parts = convertPCMBase64ToFloat32Array(audioParts);
      (this.player as PCMPlayer).append(parts);
      this.ttsChunks.push(parts as ArrayBuffer);
    }
  };

  reset = () => {
    this.player.reset();
  };

  pause = () => {
    this.player.pause();
  };

  destroy = () => {
    this.player.destroy();
    this.ttsChunks = [];
  };

  /******** MediaSource 模式专属管理方法 ********/
  // 结束一个MediaSource的流管理
  // 尽管这里确定了执行条件，但用户代码仍需判断，主要是确定语境
  endOfStream = () => {
    if (this.format === 'mp3') {
      (this.player as MediaStreamPlayer).endOfStream();
    }
  };

  // 调度音频切片直接追加or排队
  adaptBuffer = (data: BufferSource) => {
    if (this.format === 'mp3') {
      (this.player as MediaStreamPlayer).adaptBuffer(data);
    }
  };

  // 检查buffer是否处理完成
  checkBufferUpdating = () => {
    if (this.format === 'mp3') {
      return (this.player as MediaStreamPlayer).checkBufferUpdating();
    }
    return false;
  };
}
