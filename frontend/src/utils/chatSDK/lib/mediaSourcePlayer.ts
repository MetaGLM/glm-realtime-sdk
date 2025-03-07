import { getMediaSource } from '@/utils/chatHelper.ts';
import ChatBase from './chatBase.ts';
import { Player } from '@/types/chat.ts';

type MediaSourcePlayerOptions = {
  audioElement: HTMLAudioElement;
};

export default class MediaSourcePlayer extends Player {
  constructor(
    private chatBase: ChatBase,
    private options: MediaSourcePlayerOptions,
  ) {
    super();
  }

  playing = false;
  // tts的媒体源
  ttsMediaSource: MediaSource | null = null;
  // tts媒体源的buffer数据源
  ttsSourceBuffer: SourceBuffer | null = null;
  // resolve method from Promise Executor,用于将sourceBuffer的updateend事件异步化，串行执行
  private sourceBufferResolver: ((value: unknown) => void) | null = null;
  // ttsSourceBuffer处于更新状态
  bufferUpdating = false;
  // 本地维护的ttsBuffer队列，保证对返回片段的完整处理
  bufferQueue: BufferSource[] = [];
  // 用于支持模型连续说话效果
  // MediaSource在更新状态时，不知道duration的真实长度，所以是Infinity
  // <audio/>触发ended之后，currentTime会归零重置，导致播放效果不自然，
  // 但end时间触发能够获取此时的duration，在模型的连续说话过程中，需要将该值更新，并在后续更新中用于判断从哪里继续播放
  lastDuration = 0;
  ttsEnded = false;

  append = (data: BufferSource) => {
    // 将音频片段追加到sourceBuffer，sourceBuffer进入update状态，只有updateend后才能处理下一片
    if (!this.ttsSourceBuffer) return;
    this.ttsSourceBuffer.addEventListener(
      'updateend',
      this.sourceBufferOnUpdateEnd,
      { once: true }, // 每个chunk注册一次，形成串行事件流
    );
    this.ttsSourceBuffer.appendBuffer(data);
    this.bufferUpdating = true;

    new Promise(resolve => {
      this.sourceBufferResolver = resolve;
    });
  };

  private sourceBufferOnUpdateEnd = () => {
    // sourceBuffer updateend的回调
    // 1.根据缓冲时长，判断是否自动播放tts语音
    // 2.追加下一个分片到sourceBuffer
    if (!this.ttsMediaSource) return;

    if (this.sourceBufferResolver) {
      this.sourceBufferResolver(0); // 表示上一个chunk的promise处理完毕
      this.sourceBufferResolver = null; // 重置
    }

    // 更新时MediaSource.duration为Infinity，此时不知道准确时间
    if (Object.is(this.ttsMediaSource.duration, Infinity)) {
      this.lastDuration = 0;
    }

    if (
      !this.playing &&
      this.ttsMediaSource.duration >= 0.5
    ) {

      // ended之后，为了实现继续播放而不是audio.currentTime归零，需要手动跳到上次结束的时间
      if (this.ttsEnded && this.lastDuration) {
        this.options.audioElement.currentTime = this.lastDuration;
      }

      this.options.audioElement.play();
      this.playing = true;
    }

    this.bufferUpdating = false;
    if (this.bufferQueue.length) {
      // 如果tts_finish变为true时，可能还有剩余任务未处理完，此时仍进入此分支，直到最后一个任务结束
      this.append(this.bufferQueue.shift() as BufferSource);
    }
  };

  init = async () => {
    // 初始化一个媒体源，媒体源关闭后不能再追加buffer，每轮对话都创建新的媒体源，相当于独立的音频文件
    if (!this.options.audioElement) {
      throw new Error('MISSING_AUDIO_ELEMENT');
    }

    this.initAudioEvent();

    this.ttsMediaSource = getMediaSource('prefer');
    this.options.audioElement.src = URL.createObjectURL(this.ttsMediaSource);
    this.options.audioElement.disableRemotePlayback = true; // ios需要这个触发sourceopen

    await new Promise(resolve => {
      this.ttsMediaSource?.addEventListener('sourceopen', resolve, {
        once: true,
      });
    });
    if (!this.ttsMediaSource) return;
    // 创建音频源的buffer数据源，指定mimeType
    this.ttsSourceBuffer = this.ttsMediaSource.addSourceBuffer('audio/mpeg');
  };

  /**
   * 重置MediaSource
   * - 把每轮对话的音频视为一个文件，结束时进行封存
   *
   * 1. 检查当前MediaSource和SourceBuffer是否存在
   * 2. 如果存在且满足以下条件:
   *    - MediaSource有持续时长(duration > 0)
   *    - SourceBuffer在活跃状态(在activeSourceBuffers中)
   *    - SourceBuffer没有正在更新(updating为false)
   * 3. 移除当前SourceBuffer
   * 4. 重新初始化一个新的MediaSource
   *
   * 用于在每轮对话结束后重置音频源,以便开始新的对话
   */
  reset = async () => {
    // 释放资源并重置创建新的MediaSource
    if (!this.ttsMediaSource || !this.ttsSourceBuffer) return;
    // 均为必须条件
    if (
      this.ttsMediaSource.duration > 0 &&
      Array.from(this.ttsMediaSource.activeSourceBuffers).includes(
        this.ttsSourceBuffer,
      ) &&
      !this.ttsSourceBuffer.updating
    ) {
      this.ttsMediaSource.removeSourceBuffer(this.ttsSourceBuffer);
    }
    await this.init();
  };

  destroy = () => {
    this.endOfStream();
    if (this.ttsSourceBuffer?.updating) {
      this.ttsSourceBuffer.abort();
    }
    this.removeAudioEvent();
  };

  pause = () => {
    this.options.audioElement.pause();
    this.playing = false;
  }

  endOfStream = () => {
    if (this.ttsMediaSource?.readyState === 'open') {
      this.ttsMediaSource.endOfStream();
    }
  }

  // 调度音频切片直接追加or排队
  adaptBuffer = (data: BufferSource) => {
    if (this.checkBufferUpdating()) {
      this.bufferQueue.push(data);
    } else {
      this.append(data);
    }
  }

  checkBufferUpdating = () => {
    return this.bufferUpdating || this.ttsSourceBuffer?.updating || this.bufferQueue.length > 0;
  }

  private onPlayTTS = () => {
    this.playing = true;
    this.ttsEnded = false;
    this.chatBase.interruptLouder &&
      this.chatBase.userStream.gainNode?.gain.setValueAtTime(
        0.18,
        this.chatBase.userStream.recorderContext!.currentTime,
      );
  };
  private onWaitTTS = () => {
    console.log('waiting');
  };
  private onPauseTTS = () => {
    this.playing = false;

    this.chatBase.interruptLouder &&
      this.chatBase.userStream.gainNode?.gain.setValueAtTime(
        1,
        this.chatBase.userStream.recorderContext!.currentTime,
      );
  };
  private onCloseTTS = () => {
    this.playing = false;
    this.ttsEnded = true;
    this.chatBase.interruptLouder &&
      this.chatBase.userStream.gainNode?.gain.setValueAtTime(
        1,
        this.chatBase.userStream.recorderContext!.currentTime,
      );
  };
  private initAudioEvent = () => {
    if (!this.options.audioElement) {
      throw new Error('MISSING_AUDIO_ELEMENT');
    }

    this.options.audioElement.addEventListener('play', this.onPlayTTS);
    this.options.audioElement.addEventListener('pause', this.onPauseTTS);
    this.options.audioElement.addEventListener('ended', this.onCloseTTS);
    this.options.audioElement.addEventListener('waiting', this.onWaitTTS);
  };
  private removeAudioEvent = () => {
    if (!this.options.audioElement) return;
    this.options.audioElement.pause();
    this.options.audioElement.removeEventListener('play', this.onPlayTTS);
    this.options.audioElement.removeEventListener('pause', this.onPauseTTS);
    this.options.audioElement.removeEventListener('ended', this.onCloseTTS);
    this.options.audioElement.removeEventListener('waiting', this.onWaitTTS);
  };
}
