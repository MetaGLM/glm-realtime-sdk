import ChatBase from './chatBase.ts';
import { captureImage } from '@/utils/chatHelper.ts';

type UserStreamOptions = {
  videoElement?: HTMLVideoElement | null;
  videoDevice?: 'screen' | 'camera';
  videoDeviceID?: string;
  facingMode?: 'user' | 'environment';
  audioConstrains?: MediaTrackConstraints;
  resolution?: MediaTrackConstraints;
};

/*
 * 1. 获取用户媒体流
 * 2. 音频流注入VAD前预处理gain
 * 3. 视频流：切换视频源、视频设备ID、截图捕获
 * */
export default class UserStream {
  // 默认的采样率，此为推荐值，一般不建议修改
  sampleRate = 16000;

  // 音频流配置，可覆盖
  audioConstrains: MediaTrackConstraints = {
    sampleRate: this.sampleRate, // 设置采样率为 16kHz
    channelCount: 1,
    noiseSuppression: true, // 这俩影响音量
    echoCancellation: true,
    autoGainControl: true, // 开了会失真
  };

  constructor(
    public chatBase: ChatBase,
    public options: UserStreamOptions | undefined,
  ) {
    if (options) {
      this.videoElement = options.videoElement;
      this.facingMode = options.facingMode ?? 'user';
      this.videoDevice = options.videoDevice ?? 'screen';
      this.videoDeviceID = options.videoDeviceID ?? 'default';
      this.resolution = options.resolution ?? {};
      if (options.audioConstrains) {
        this.audioConstrains = {
          ...this.audioConstrains,
          ...options.audioConstrains,
        };
      }
    }
  }

  // 默认的初始化，初始化视频流和音频流，有需求时也可以分开处理
  init = async () => {
    await this.initVideoStream();
    await this.initAudioStream();
  };

  // 用于展示用户视频流
  videoElement?: HTMLVideoElement | null;
  // 捕捉屏幕｜摄像头
  videoDevice: 'screen' | 'camera' = 'screen';
  // 视频设备ID，比如用户有多个摄像头
  videoDeviceID: string = 'default';
  setVideoDevice = (
    device: 'screen' | 'camera',
    deviceID: string = 'default',
  ) => {
    if (this.videoDevice === device && device === 'camera') {
      if (this.videoDeviceID === deviceID) return;
      this.videoSource?.getTracks().forEach(track => track.stop());
      this.videoDevice = device;
      this.videoDeviceID = deviceID;
      this.initVideoStream().catch(() => {
        console.log('视频源切换失败');
      });
    } else {
      if (this.videoDevice === device) return;
      this.videoSource?.getTracks().forEach(track => track.stop());
      this.videoDevice = device;
      this.videoDeviceID = deviceID;
      this.initVideoStream().catch(() => {
        console.log('视频源切换失败');
      });
    }
  };
  // 摄像头方向，切换前后摄，可部分替代deviceID的用法
  facingMode: 'user' | 'environment' = 'user';
  setFacingMode = (mode: 'user' | 'environment') => {
    this.videoDevice = 'camera';
    this.facingMode = mode;
    this.initVideoStream().catch(() => {
      console.log('用户视频流获取失败');
    });
  };

  // 视频流
  videoSource: MediaStream | null = null;
  // 视频分辨率
  resolution: MediaTrackConstraints = {
    width: { ideal: 2560 },
    height: { ideal: 1440 },
  };
  setResolution = (constraints: MediaTrackConstraints) => {
    this.resolution = {
      width: constraints.width,
      height: constraints.height,
    };
  };
  initVideoStream = async () => {
    if (this.videoDevice === 'camera') {
      this.videoSource = await navigator.mediaDevices.getUserMedia({
        video: {
          ...this.resolution,
          deviceId: this.videoDeviceID,
          facingMode: this.facingMode,
        },
        audio: false,
      });
    } else if (this.videoDevice === 'screen') {
      this.videoSource = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });
    }
    if (this.videoElement) {
      this.videoElement.srcObject = this.videoSource;
      this.videoElement.muted = true;
      await new Promise(resolve => {
        // 等到播放器加载到了视频再继续，否则可能无法截图，reader会读到null
        this.videoElement!.onloadeddata = () => {
          resolve(true);
        };
      });
    }
  };

  // 用于预处理用户音频流的AudioContext
  recorderContext: AudioContext | null = null;
  // 预处理音频流的增益度后输入VAD
  gainNode: GainNode | null = null;
  // 本地音频流绑定到VAD前，最后一个目的地节点
  destAudioNode: AudioNode | null = null;
  // 本地音频流
  audioSource: MediaStream | null = null;
  initAudioStream = async () => {
    /*
     * 1.请求设备音频流
     * 2.gain节点预处理音频流，也可以添加其他节点
     * 3.绑定调整后的音频流，用于输入到VAD
     * */
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: this.audioConstrains,
    });
    const ctx = new AudioContext({
      sampleRate: this.sampleRate,
    });
    this.recorderContext = ctx;
    // 创建音频流的目的地节点
    const dest = ctx.createMediaStreamDestination();
    this.destAudioNode = dest;
    // 可设置初始化增益度，根据不同设备的收音灵敏度，设置不同的增益度
    const gainNode = ctx.createGain();
    this.gainNode = gainNode;
    // 创建音频流源节点
    const source = ctx.createMediaStreamSource(stream);
    // 将音频流源节点连接到增益节点
    const audioNode = source.connect(gainNode);
    // 将增益节点连接到音频流的目的地节点
    audioNode.connect(dest);
    // 作为新的源节点
    this.audioSource = dest.stream;
  };

  captureVideo = async () => {
    if (!this.videoElement) {
      throw new Error('videoElement is not initialized');
    }
    const [base64, url] = await captureImage(this.videoElement);
    return { base64, url };
  };

  stopVideoStream = () => {
    this.videoSource?.getTracks().forEach(track => track.stop());
    this.videoSource = null;
  };

  destroy = () => {
    this.audioSource?.getTracks().forEach(track => track.stop());
    this.videoSource?.getTracks().forEach(track => track.stop());
    this.audioSource = null;
    this.videoSource = null;
    this.gainNode = null;
    this.destAudioNode = null;
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.recorderContext?.close().catch(() => {
      console.log('关闭录音上下文');
    });
  };
}
