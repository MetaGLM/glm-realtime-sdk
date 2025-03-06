import PCMPlayer from 'pcm-player';
import { Player } from '@/types/chat.ts';

export default class PCMPlayerManager extends Player {
  private pcmPlayer: PCMPlayer | undefined;

  playing = false;

  constructor() {
    super();
  }

  init = async () => {
    this.pcmPlayer?.destroy();
    this.pcmPlayer = new PCMPlayer({
      inputCodec: 'Float32',
      channels: 1,
      sampleRate: 24000,
      flushTime: 500,
      fftSize: 2048,
    });
    this.pcmPlayer.volume(2); // 音量调高
  };

  // 添加PCM数据
  append = (audioParts: Float32Array) => {
    this.pcmPlayer?.feed(audioParts);
  };

  // 重置PCM数据
  reset = () => {
    this.init();
  };

  destroy = () => {
    this.pcmPlayer?.destroy();
    this.pcmPlayer = undefined;
  };

  pause = () => {
    this.pcmPlayer?.pause();
  };
}
