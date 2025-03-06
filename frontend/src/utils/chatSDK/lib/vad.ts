import ChatBase from './chatBase.ts';
import { MicVAD } from '@ricky0123/vad-web';
import { concatFloat32Array, FixedQueue } from '@/utils/chatHelper.ts';

export interface VADOptions {
  threshold?: number;
  vadFrame?: number;
  onSpeech?: (speeching: boolean) => void;
  onSpeechStart?: () => void;
  revokeSpeechStart?: () => boolean;
  onSpeechEnd?: () => void;
  revokeSpeechEnd?: () => boolean;
  onFrameProcess?: (pcm: Float32Array) => void;
  onVADOpen?: (on: boolean) => void;
}

export default class ChatVAD {
  // 触发speechStart的音量阈值
  threshold = 0.85;
  // 帧，每帧4 * 1536 byte，约为100ms，用于VAD检测的有效片段
  vadFrame = 1;
  // 分句：在pre_finish模式下，用户的完整录音由多段组成，
  recordPCMPart = new Float32Array([]);
  // 用户完整录音
  recordPCM = new Float32Array([]);

  constructor(
    protected chatBase: ChatBase,
    public options: VADOptions = {},
  ) {
    this.threshold = options.threshold || this.threshold;
    this.vadFrame = options.vadFrame || this.vadFrame;
  }

  // MicVAD实例
  vadInstance: MicVAD | null = null;

  private aheadChunks = new FixedQueue<Float32Array>(4);

  private speechStart = false;

  init = async () => {
    if (!this.chatBase.userStream.audioSource) {
      throw new Error('audioSource is required');
    }

    this.vadInstance = await MicVAD.new({
      baseAssetPath: '/',
      onnxWASMBasePath: '/',
      stream: this.chatBase.userStream.audioSource,
      redemptionFrames: this.vadFrame,
      positiveSpeechThreshold: this.threshold,
      negativeSpeechThreshold: this.threshold - 0.25,
      preSpeechPadFrames: 4,
      onSpeechStart: this.handleSpeechStart,
      onSpeechEnd: this.handleSpeechEnd,
      onVADMisfire: this.handleSpeechEnd,
      onFrameProcessed: async (_, frame) => {
        let inputBuffer = frame;

        if (!this.chatBase.speeching) {
          this.aheadChunks.append(inputBuffer);
          return;
        }

        // 触发一次speechStart后，清空recordPCMPart，清空aheadChunks
        if (this.speechStart) {
          this.recordPCMPart = new Float32Array([]);
          this.speechStart = false;
          if (this.aheadChunks.length > 0) {
            const aheadChunks = this.aheadChunks.getQueue().reduce((a, b) => {
              return concatFloat32Array(a, b);
            }, new Float32Array([]));
            inputBuffer = concatFloat32Array(aheadChunks, inputBuffer);
          }
          this.aheadChunks.clear();
        }

        if (inputBuffer) {
          this.recordPCMPart = concatFloat32Array(
            this.recordPCMPart,
            inputBuffer,
          );
          this.options.onFrameProcess?.(inputBuffer);
        }
      },
    });
  };

  start = () => {
    if (!this.vadInstance) {
      return;
    }
    this.vadInstance.start();
    this.options.onVADOpen?.(true);
  };

  pause = () => {
    if (!this.vadInstance) {
      return;
    }
    this.vadInstance.pause();
    this.options.onVADOpen?.(false);
    if (this.chatBase.speeching) {
      this.handleSpeechEnd();
    }
  };

  destroy = () => {
    if (!this.vadInstance) {
      return;
    }
    this.pause();
    this.vadInstance.destroy();
    this.vadInstance = null;
  };

  // 将当前的录音片段追加到完整录音中
  concatRecord = () => {
    this.recordPCM = concatFloat32Array(this.recordPCM, this.recordPCMPart);
  };

  clearRecord = () => {
    this.recordPCM = new Float32Array([]);
    this.recordPCMPart = new Float32Array([]);
  };

  private handleSpeechEnd = () => {
    if (this.options.revokeSpeechEnd?.()) {
      return;
    }
    this.chatBase.speeching = false;
    this.options.onSpeechEnd?.();
    this.aheadChunks.clear();
  };

  private handleSpeechStart = () => {
    if (this.options.revokeSpeechStart?.()) {
      return;
    }
    this.speechStart = true;
    this.chatBase.speeching = true;
    this.options.onSpeechStart?.();
  };
}
