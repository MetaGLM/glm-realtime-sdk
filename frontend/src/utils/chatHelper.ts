import Pica from 'pica';

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function createWavFile(audioData: Float32Array, sampleRate: number) {
  function float32ToPCM(input: Float32Array, output: Int16Array) {
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  function writeUTFBytes(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  const numOfChannels = 1; // 单声道
  const bitDepth = 16;
  const byteRate = (sampleRate * numOfChannels * bitDepth) / 8;
  const blockAlign = (numOfChannels * bitDepth) / 8;
  const wavHeaderSize = 44;

  const wavBuffer = new ArrayBuffer(wavHeaderSize + audioData.length * 2);
  const view = new DataView(wavBuffer);

  // RIFF chunk descriptor
  writeUTFBytes(view, 0, 'RIFF');
  view.setUint32(4, 36 + audioData.length * 2, true);
  writeUTFBytes(view, 8, 'WAVE');

  // fmt sub-chunk
  writeUTFBytes(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numOfChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample

  // data sub-chunk
  writeUTFBytes(view, 36, 'data');
  view.setUint32(40, audioData.length * 2, true); // Subchunk2Size

  // PCM data
  const pcmData = new Int16Array(audioData.length);
  float32ToPCM(audioData, pcmData);
  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(44 + i * 2, pcmData[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

export function base64ToUnit8Arr(data: string) {
  const byteCharacters = atob(data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Uint8Array(byteNumbers);
}

function base64ToArrayBuffer(base64: string) {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export function convertPCMBase64ToFloat32Array(base64: string) {
  // Decode Base64 to ArrayBuffer
  const arrayBuffer = base64ToArrayBuffer(base64);

  // Create DataView for reading PCM data
  const dataView = new DataView(arrayBuffer);

  // Calculate the number of samples
  const numSamples = dataView.byteLength / 2; // 16-bit PCM

  // Create Float32Array to hold the output
  const float32Array = new Float32Array(numSamples);

  // Iterate through the PCM data and convert to float
  for (let i = 0; i < numSamples; i++) {
    const int16Sample = dataView.getInt16(i * 2, true); // little-endian
    float32Array[i] = int16Sample / 32768; // Normalize to [-1, 1]
  }

  return float32Array;
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  // 创建一个 Uint8Array 视图，用于访问 ArrayBuffer 中的各个字节
  const bytes = new Uint8Array(buffer);
  let binary = '';

  // 将每个字节转换成对应的字符
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  // 使用 btoa 函数将二进制字符串转换为 Base64 编码
  return window.btoa(binary);
}

export const captureImage = async (videoElement: HTMLVideoElement) => {
  const canvas = document.createElement('canvas');
  // const dpr = window.devicePixelRatio || 1;

  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  canvas.style.width = `${videoElement.videoWidth}px`;
  canvas.style.height = `${videoElement.videoHeight}px`;

  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  })!;

  context.imageSmoothingEnabled = false;
  context.drawImage(
    videoElement,
    0,
    0,
    videoElement.videoWidth,
    videoElement.videoHeight,
  );
  // context.scale(dpr, dpr);

  const resizedCanvas = document.createElement('canvas');
  const [h, w] = smartResize(videoElement.videoHeight, videoElement.videoWidth);
  resizedCanvas.width = w;
  resizedCanvas.height = h;
  const pica = new Pica();
  const result = await pica.resize(canvas, resizedCanvas, {
    unsharpAmount: 160,
    unsharpRadius: 0.6,
    unsharpThreshold: 1,
  });

  const blob = await pica.toBlob(result, 'image/jpeg', 0.5);
  const url = URL.createObjectURL(blob);
  // blob —> base64
  const base64 = await blobToBase64(blob);
  return [base64.split(',')[1], url];
};

export function playWavBase64(pcmData: Float32Array, sampleRate: number) {
  // Decode Base64 string to binary data
  const blob = createWavFile(pcmData, sampleRate);
  // Create an object URL for the Blob and play the audio
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio
    .play()
    .then(() => {})
    .catch(error => {
      console.error('Error playing audio:', error);
    });
}

export async function getUserDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const audioInputs = devices
    .filter(device => device.kind === 'audioinput')
    .map(device => ({
      label: device.label,
      value: device.deviceId,
    }));

  const videoInputs = devices
    .filter(device => device.kind === 'videoinput')
    .map(device => ({
      label: device.label,
      value: device.deviceId,
    }));

  return { audioInputs, videoInputs };
}

export function concatFloat32Array(a: Float32Array, b: Float32Array) {
  const newArr = new Float32Array(a.length + b.length);
  newArr.set(a, 0);
  newArr.set(b, a.length);
  return newArr;
}

declare global {
  interface ManagedMediaSourceEventMap extends MediaSourceEventMap {
    startstreaming: Event;
    endstreaming: Event;
  }

  interface ManagedMediaSource extends MediaSource {
    readonly streaming: boolean;
    onstartstreaming: ((this: ManagedMediaSource, ev: Event) => void) | null;
    onendstreaming: ((this: ManagedMediaSource, ev: Event) => void) | null;

    addEventListener<K extends keyof ManagedMediaSourceEventMap>(
      type: K,
      listener: (this: MediaSource, ev: ManagedMediaSourceEventMap[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;

    removeEventListener<K extends keyof ManagedMediaSourceEventMap>(
      type: K,
      listener: (this: MediaSource, ev: ManagedMediaSourceEventMap[K]) => void,
      options?: boolean | EventListenerOptions,
    ): void;
  }

  interface Window {
    // WebKitMediaSource?: typeof MediaSource;
    ManagedMediaSource?: ManagedMediaSource & typeof MediaSource;
  }
}

export function getMediaSource(
  managedMediaSource?: 'prefer' | 'maybe' | undefined,
): MediaSource {
  if (
    (managedMediaSource === 'prefer' && !!window.ManagedMediaSource) ||
    (managedMediaSource === 'maybe' &&
      !!window.ManagedMediaSource &&
      !window.MediaSource)
  ) {
    return new window.ManagedMediaSource();
  }
  return new MediaSource(); // || window.WebKitMediaSource;
}

export function mergeFloat32Arrays(arrays: Float32Array[]) {
  // 计算总长度
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }

  // 创建新的 Float32Array
  const result = new Float32Array(totalLength);

  // 拷贝每个 Float32Array 到新的 Float32Array
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

export class FixedQueue<T> {
  private queue: T[];
  private maxSize: number;

  constructor(size: number) {
    this.maxSize = size;
    this.queue = [];
  }

  append(item: T): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
    }
    this.queue.push(item);
  }

  clear(): void {
    this.queue = [];
  }

  getQueue(): T[] {
    return this.queue;
  }

  get length(): number {
    return this.queue.length;
  }
}

// 等效像素
export function smartResize(
  h: number,
  w: number,
  t: number = 2,
  maxPixels: number = 2 * 1400 * 1400,
): [number, number] {
  const tFactor = 2;
  const hFactor = 28;
  const wFactor = 28;
  const minPixels = 112 * 112;

  if (t < tFactor) {
    throw new Error('temporal dimension must be greater than the factor');
  }

  let hBar = Math.round(h / hFactor) * hFactor;
  let wBar = Math.round(w / wFactor) * wFactor;
  const tBar = Math.round(t / tFactor) * tFactor;

  const pixels = tBar * hBar * wBar;

  let scaleFactor: number;

  if (pixels > maxPixels) {
    scaleFactor = Math.sqrt((t * h * w) / maxPixels);
    hBar = Math.floor(h / scaleFactor / hFactor) * hFactor;
    wBar = Math.floor(w / scaleFactor / wFactor) * wFactor;
  } else if (pixels < minPixels) {
    scaleFactor = Math.sqrt(minPixels / (t * h * w));
    hBar = Math.ceil((h * scaleFactor) / hFactor) * hFactor;
    wBar = Math.ceil((w * scaleFactor) / wFactor) * wFactor;
  }

  return [hBar, wBar];
}

// 计算字符串大小
export function getBinarySizeFromString(content: string) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(content);
  return (encoded.length / 1024).toFixed(3);
}

export function convertFloat32ArrayToPCMBase64(
  float32Array: Float32Array,
): string {
  // Create ArrayBuffer to hold PCM data
  const arrayBuffer = new ArrayBuffer(float32Array.length * 2); // 16-bit PCM = 2 bytes per sample
  const dataView = new DataView(arrayBuffer);

  // Convert Float32Array to PCM
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp values to [-1, 1]
    const sample = Math.max(-1, Math.min(1, float32Array[i]));

    // Convert to 16-bit PCM
    const int16Sample = Math.round(sample * 32767); // multiply by 32767 instead of 32768 to avoid potential overflow

    // Write to ArrayBuffer as little-endian
    dataView.setInt16(i * 2, int16Sample, true);
  }

  // Convert to Base64
  return arrayBufferToBase64(arrayBuffer);
}
