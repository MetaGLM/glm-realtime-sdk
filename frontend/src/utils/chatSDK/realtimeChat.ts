/*
 * 协议层
 * 1.定义网络连接
 * 2.支持realtime协议
 * 3.基于协议定制逻辑和数据，不能直接让底层访问
 * */

import ChatBase, { ChatBaseOptions } from './lib/chatBase.ts';
import {
  ChatMode,
  ConversationItemInputAudioTranscriptionCompleted,
  FunctionCallQueueItem,
  FunctionCallQueueResponse,
  InputAudioBufferAppend,
  InputAudioBufferAppendVideoFrame,
  InputAudioBufferCommitted,
  RealtimeClientEvent,
  RealtimeClientEventStruct,
  RealtimeError,
  RealtimeEventStruct,
  RealtimeServerEvent,
  RealtimeServerEventStruct,
  ResponseAudioDelta,
  ResponseAudioTranscriptDelta,
  ResponseCreated,
  ResponseFunctionCallArgumentsDone,
  SessionCreated,
  SessionUpdate,
  SessionUpdated,
  TTSSource,
} from '@/types/realtime.ts';
import {
  blobToBase64,
  concatFloat32Array,
  createWavFile,
  FixedQueue,
  getBinarySizeFromString,
  mergeFloat32Arrays,
} from '../chatHelper.ts';
import { v4 } from 'uuid';

type MessageType = 'asr' | 'tts' | 'control';

export type RealtimeStatus =
  | 'READY'
  | 'USER_MEDIA_AUDIO_INIT'
  | 'USER_MEDIA_VIDEO_INIT'
  | 'USER_MEDIA_AUDIO_ERROR'
  | 'USER_MEDIA_VIDEO_ERROR'
  | 'VAD_INIT'
  | 'VAD_INIT_ERROR'
  | 'STREAM_PLAYER_INIT'
  | 'STREAM_PLAYER_INIT_ERROR'
  | 'WS_INIT'
  | 'WS_OPEN'
  | 'WS_CLOSE'
  | 'WS_ERROR'
  | 'SESSION_UPDATE'
  | 'APP_AVAILABLE';

export type ResponseMessageData = {
  type: MessageType;
  id: string;
  textContent: string;
  audioURL?: string;
  audioFormat?: 'mp3' | 'wav';
  textDelay?: number;
  audioDelay?: number;
  imgList?: string[];
};

export type LogType = 'info' | 'error' | 'warning' | 'success';

/**
 * 1.不能同步响应的配置，均从options读取
 * 2.能同步响应的配置，均配置setter方法
 */

export interface RealtimeOptions extends ChatBaseOptions {
  wsURL: string; // options
  inputMode?: 'localVAD' | 'serverVAD' | 'manual'; // setter
  chatMode?: ChatMode; // setter
  useHistory?: boolean;
  sessionConfig?: {
    tools?: string; // setter
    systemPrompt?: string;
    voice?: string;
    tts_source?: TTSSource;
  };
  onHistory?: (message: RealtimeChat['history']) => void;
  onActive?: (active: boolean) => void;
  onSpeeching?: (speeching: boolean) => void;
  onMessage?: (type: MessageType, data: RealtimeChat['messageData']) => void;
  onVADOpen?: (on: boolean) => void;
  onChatModeChange?: (chatMode: ChatMode) => void;
  onStatus?: (status: RealtimeStatus) => void;
  onSubmitCustomCallTools?: (
    queue: FunctionCallQueueItem[],
  ) => Promise<FunctionCallQueueResponse[]>;
  onLog?: (type: LogType, message: string) => void;
}

export default class RealtimeChat extends ChatBase {
  // 应用各模块正常启动，用户输入可以启用
  private _active: boolean = false;
  protected get active() {
    return this._active;
  }

  protected set active(value: boolean) {
    this._active = value;
    this.options.onActive?.(value);
  }

  // 用户是否在说话
  private _speeching: boolean = false;
  get speeching() {
    return this._speeching;
  }

  set speeching(value: boolean) {
    this._speeching = value;
    this.options.onSpeeching?.(value);
  }

  private _status: RealtimeStatus = 'READY';
  get status() {
    return this._status;
  }

  set status(v) {
    this._status = v;
    this.options.onStatus?.(v);
  }

  // 通话模式
  private chatMode: ChatMode = 'audio';
  // 切换通话模式，属于主动更新
  setChatMode = (value: ChatMode) => {
    if (this.chatMode === value) return;
    this.chatMode = value;
    this.updateSessionConfig();
  };

  // 会话ID
  sessionID: string = '';
  // 用户输入的ID，在用户输入完成后通过服务端event进行更新，所以用户输入时其实是上一次的itemID
  private itemID: string = '';
  // 模型当前消息的ID
  private responseID: string = '';
  // 上次结束发言的时间戳
  private lastSpeechTime = 0;

  // vad 用户开始说话的回调，在多次pre_commit间重复触发
  private handleSpeechStart = () => {
    this.firstAudioPart = true;
    clearTimeout(this.finishTimer);

    // 如果发生打断，则停掉上次的流式tts
    if (this.streamPlayer.format === 'mp3') {
      this.streamPlayer.endOfStream();
    }

    // 打断时向服务端发送消息，这会中断后端上一个正在进行的链路，所以只允许打断一次，否则会打断本次的链路(产生自前面的pre_commit)
    if (!this.ttsFinished) {
      this.sendMessage({
        type: RealtimeClientEvent.ResponseCancel,
        client_timestamp: Date.now(),
      });
      // 相当于客户端强行认为上次的任务完成了(response.done)
      this.ttsFinished = true;
    }

    // 打断时将上次的tts音频封存
    this.sealTTSAudioChunk();
    // 暂停tts播放
    this.streamPlayer.pause();
  };
  // vad 用户结束说话的回调，多次触发表示用户本次完整发言中的分句或停顿
  private handleSpeechEnd = () => {
    // 拼接每个分句的音频片段
    this.vad.concatRecord();
    // 如果之前手动暂停了tts播放，那么暂停后收到的tts也不会播放
    // 当新的发言结束后，用户又进入了等待回复的状态，所以允许自动播放tts
    this.playBufferedTTS = true;
    // 重置播放器的状态，准备播放新的tts
    this.streamPlayer.reset();
    this.lastSpeechTime = Date.now();

    this.sendMessage({
      type: RealtimeClientEvent.InputAudioBufferPreCommit,
      client_timestamp: this.lastSpeechTime,
    });

    this.finishTimer = window.setTimeout(() => {
      this.finishTimer = NaN;
      this.sendMessage({
        type: RealtimeClientEvent.InputAudioBufferCommit,
        client_timestamp: Date.now(),
      });

      this.sendMessage({
        type: RealtimeClientEvent.ResponseCreate,
        client_timestamp: Date.now(),
      });
    }, this.preFinishOffset);
  };
  // vad 处理音频帧
  private handleFrameProcess = async (inputBuffer: Float32Array) => {
    const wavBlob = createWavFile(inputBuffer, this.userStream.sampleRate);
    const wav64 = await blobToBase64(wavBlob);
    if (!this.speeching) {
      return;
    }
    this.sendMessage({
      type: RealtimeClientEvent.InputAudioBufferAppend,
      audio: wav64.split(',')[1],
      client_timestamp: Date.now(),
    });
  };

  constructor(protected options: RealtimeOptions) {
    super({
      audioElement: options.audioElement,
      ttsFormat: options.ttsFormat ?? 'pcm',
      userStream: options.userStream,
      vadOptions: {
        onFrameProcess: inputBuffer => {
          this.handleFrameProcess(inputBuffer);
        },
        onSpeechStart: () => {
          this.handleSpeechStart();
          this.options.vadOptions?.onSpeechStart?.();
        },
        revokeSpeechStart: () => {
          return !this.userInterrupt && (!this.ttsFinished || this.ttsPlaying);
        },
        onSpeechEnd: () => {
          this.handleSpeechEnd();
          this.options.vadOptions?.onSpeechEnd?.();
        },
        revokeSpeechEnd: () => {
          return !this.speeching;
        },
        onVADOpen: options.onVADOpen,
      },
    });
    this.inputMode = options.inputMode ?? 'manual';
    this.chatMode = options.chatMode ?? 'audio';
    this.toolsConfig = options.sessionConfig?.tools ?? '';
    this.instructions = options.sessionConfig?.systemPrompt ?? '';
    this.voice = options.sessionConfig?.voice ?? 'default';
    this.ttsSource = options.sessionConfig?.tts_source ?? 'e2e';
    this.ttsFormat = options.ttsFormat ?? 'pcm';
    this.useHistory = options.useHistory ?? false;
  }

  // 启动！
  start = async () => {
    // realtime api默认以音频模式进行初始化，在建立连接后，通过session.update来切换到目标模式
    try {
      this.status = 'USER_MEDIA_AUDIO_INIT';
      await this.userStream.initAudioStream();
    } catch (e) {
      this.log(
        'error',
        '[Realtime Err]: 用户音频流请求失败，请刷新重试或重启浏览器',
      );
      this.status = 'USER_MEDIA_AUDIO_ERROR';
      this.destroy();
      return;
    }
    try {
      this.status = 'VAD_INIT';
      await this.vad.init();
    } catch (e) {
      this.status = 'VAD_INIT_ERROR';
      this.log(
        'error',
        '[Realtime Err]: VAD初始化失败，请尝试清空全部缓存并刷新',
      );
      this.destroy();
      return;
    }
    try {
      this.status = 'STREAM_PLAYER_INIT';
      await this.streamPlayer.init();
    } catch (e) {
      this.status = 'STREAM_PLAYER_INIT_ERROR';
      this.log(
        'error',
        '[Realtime Err]: 流媒体播放器初始化失败，请刷新重试或重启浏览器',
      );
      this.destroy();
      return;
    }
    this.status = 'WS_INIT';
    try {
      await this.initWebsocket();
    } catch (e) {
      return;
    }
  };
  // 销毁！
  destroy = () => {
    try {
      this.active = false;
      this.speeching = false;
      this.stopCaptureVideo();
      this.sealTTSAudioChunk();
      this.vad.destroy();
      this.userStream.destroy();
      this.streamPlayer.destroy();
    } catch (e) {
      console.error(e);
    } finally {
      this.socket?.close();
      this.socket = null;
      this.status = 'READY';
    }
  };
  // 输出提示信息
  log = (type: LogType, message: string) => {
    this.options.onLog?.(type, message);
  };

  // * websocket
  private socket: WebSocket | null = null;
  // tts是否完成
  ttsFinished: boolean = true;
  // 是否是第一次音频片段
  firstAudioPart: boolean = true;
  // 预提交偏移量
  preFinishOffset: number = 200;
  // 完成计时器
  finishTimer: number = NaN;
  // 消息数据
  protected messageData: ResponseMessageData[] = [];
  // 初始化websocket
  private initWebsocket = () => {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        this.socket.close();
      }
      this.socket = new WebSocket(this.options.wsURL);

      const handler: Record<
        RealtimeServerEvent,
        (ev: RealtimeServerEventStruct) => void
      > = {
        // 会话创建完成，此时会收到默认的session_config
        // 此时不建议立即开始交互，而是先主动更新用户的session_config，比如用户想以视频模式开启通话
        [RealtimeServerEvent.SessionCreated]: ev => {
          const data = ev as SessionCreated;
          this.sessionID = data.session.id;
          // 会话建立后，主动更新一次会话配置
          this.updateSessionConfig();
          this.status = 'SESSION_UPDATE';
          // 放到window中用于调试
          window.realtime = this;
        },
        // 会话配置更新，很多异步生效的配置可以在这里处理或分发到其他阶段
        [RealtimeServerEvent.SessionUpdated]: async ev => {
          const data = ev as SessionUpdated;
          // 在新配置生效前先停用交互(用于UI层)
          this.active = false;

          // 处理tts格式变更，为了不影响播放，等到下次提交完用户音频后再更新播放器的状态
          if (data.session.output_audio_format !== this.streamPlayer.format) {
            this.appendEventTask(
              RealtimeServerEvent.InputAudioBufferCommitted, // 放在response.created也可以
              async () => {
                this.ttsFormat = data.session.output_audio_format ?? 'pcm';
                await this.streamPlayer.setFormat(this.ttsFormat);
                this.log(
                  'success',
                  `[Realtime]: 音频格式已更新为${this.ttsFormat}`,
                );
              },
            );
          }

          // 处理聊天模式变更
          if (data.session.beta_fields?.chat_mode) {
            const chatMode = data.session.beta_fields.chat_mode;
            // 主被动视频都含有video
            if (chatMode.includes('video')) {
              const { image_size_x, image_size_y, fps } =
                data.session.beta_fields!;
              // 截图间隔
              this.setPicInterval(fps ?? 2);
              // 截图分辨率
              this.userStream.setResolution({
                width: { ideal: image_size_x ?? 2560 },
                height: { ideal: image_size_y ?? 1440 },
              });
              try {
                // 重新初始化视频流
                await this.userStream.initVideoStream();
                // 启动视频捕获
                await this.startCaptureVideo();
              } catch (e) {
                this.log(
                  'error',
                  '[Realtime Err]: 捕获视频流失败，请刷新重试或重启浏览器',
                );
                this.status = 'USER_MEDIA_VIDEO_ERROR';
                this.destroy();
              }
            } else {
              // 到这里表示音频模式，关闭视频流，关闭的方法应该是允许重复调用的
              this.userStream.stopVideoStream();
              this.stopCaptureVideo();
            }
            // 向外响应一下
            this.options.onChatModeChange?.(chatMode);
          }

          // 启用新的输入模式，这里处理远程与本地模式切换的情况
          if (data.session.turn_detection?.type === 'server_vad') {
            // 本地切远程
            this.enableServerVAD();
          } else if (this.inputMode === 'localVAD') {
            // 远程切本地VAD
            this.vad.start();
          } else {
            // 远程切本地手动
            this.enableManualTalk();
          }
          // 配置都处理完了，此时允许用户输入
          this.active = true;
          this.status = 'APP_AVAILABLE';
        },
        // server vad 模式下，表示服务端判定vad speeching start
        [RealtimeServerEvent.InputAudioBufferSpeechStarted]: () => {
          // ! server vad模式下，打断的消息是托管的，客户端不用考虑，只需要处理本地音频的状态
          if (this.inputMode === 'serverVAD') {
            this.speeching = true;
            this.firstAudioPart = true;
            if (this.streamPlayer.format === 'mp3') {
              this.streamPlayer.endOfStream();
            }
            this.sealTTSAudioChunk();
            this.streamPlayer.pause();
          }
        },
        // serverVAD 模式下，表示服务端判定vad speeching stop
        [RealtimeServerEvent.InputAudioBufferSpeechStopped]: () => {
          // ! server vad模式下，也不需要考虑pre_commit
          if (this.inputMode === 'serverVAD') {
            this.speeching = false;
            this.playBufferedTTS = true;
            this.vad.concatRecord();
            this.streamPlayer.reset();
            this.lastSpeechTime = Date.now();
          }
        },
        // 表示用户完成了音频的提交，此时可以初始化一个user消息历史，更新item_id
        // 你可以在这里重置播放器的状态
        [RealtimeServerEvent.InputAudioBufferCommitted]: ev => {
          const data = ev as InputAudioBufferCommitted;
          this.itemID = data.item_id;
          this.appendASRMessageData();
        },
        [RealtimeServerEvent.ConversationItemCreated]: () => {},
        // 表示回复开始生成，客户端准备接受并播放音频
        // 更新response_id
        // 主动说话模式下，你可能收到多个response.created，但是收到时很可能正在播放前面的tts
        // 为了播放连续的效果，这里不建议进行中断播放的操作(比如重置播放器)
        [RealtimeServerEvent.ResponseCreated]: ev => {
          const data = ev as ResponseCreated;
          // 模型当前消息的ID
          this.responseID = data.response.id;
          this.messageData.push({
            type: 'tts',
            id: this.responseID,
            textContent: '',
          });
        },
        // asr的结果，更新user的对话历史，计算延迟
        [RealtimeServerEvent.ConversationItemInputAudioTranscriptionCompleted]:
          ev => {
            // asr的逻辑
            const data = ev as ConversationItemInputAudioTranscriptionCompleted;
            const index = this.messageData.findIndex(
              item => item.id === this.itemID,
            );
            const now = Date.now();
            const delay =
              now -
              this.lastSpeechTime +
              this.vad.vadFrame * 100 * Number(this.inputMode === 'localVAD');
            if (index !== -1) {
              const target = this.messageData[index];
              target.textContent += data.transcript;
              if (!target.textDelay) {
                target.textDelay = delay;
              }
              this.messageData.splice(index, 1, { ...target });
            } else {
              this.messageData.push({
                type: 'asr',
                id: this.itemID,
                textContent: data.transcript,
                audioFormat: 'wav',
                textDelay: delay,
              });
            }
            this.submitMessageData('asr');
          },
        // tts的文本，更新tts的对话历史，计算延迟
        [RealtimeServerEvent.ResponseAudioTranscriptDelta]: ev => {
          // text的逻辑
          const data = ev as ResponseAudioTranscriptDelta;
          const index = this.messageData.findIndex(
            item => item.id === this.responseID,
          );
          const now = Date.now();
          const delay =
            now -
            this.lastSpeechTime +
            this.vad.vadFrame * 100 * Number(this.inputMode === 'localVAD');
          if (index !== -1) {
            const target = this.messageData[index];
            target.textContent += data.delta ?? '';
            if (!target.textDelay) {
              target.textDelay = delay;
            }
            this.messageData.splice(index, 1, { ...target });
          } else {
            this.messageData.push({
              type: 'tts',
              id: this.responseID,
              textContent: data.delta ?? '',
              textDelay: delay,
            });
          }
          this.submitMessageData('tts');
        },
        // 收到tts音频切片
        [RealtimeServerEvent.ResponseAudioDelta]: ev => {
          // tts audio chunk
          const data = ev as ResponseAudioDelta;
          // 在用户发言时不处理音频，至少不播放
          if (!this.speeching) {
            // 收到音频则表示tts_finished为false，这个标识用来阻止一些行为
            this.ttsFinished = false;
            // 把base64格式的音频喂给播放器，播放器自行转换并播放
            this.streamPlayer.append(data.delta);
            // 用首包音频计算延迟
            if (this.firstAudioPart) {
              this.firstAudioPart = false;
              const now = Date.now();
              const delay =
                now -
                this.lastSpeechTime +
                this.vad.vadFrame * 100 * Number(this.inputMode === 'localVAD');
              const index = this.messageData.findIndex(
                i => i.type === 'tts' && i.id === this.responseID,
              );
              if (index !== -1) {
                const target = this.messageData[index];
                target.audioDelay = delay;
                this.messageData.splice(index, 1, { ...target });
              } else {
                this.messageData.push({
                  type: 'tts',
                  id: this.responseID,
                  textContent: '',
                  textDelay: delay,
                });
              }
              this.submitMessageData('tts');
            }
          }
        },
        // 收到模型调用工具的命令
        // 每个工具的每次调用都会单独收到一次消息，在这里将其按顺序排入队列，等response.done时一并处理
        // 工具都是客户端通过接口调用结果的，后面统一上报
        [RealtimeServerEvent.ResponseFunctionCallArgumentsDone]: ev => {
          const data = ev as ResponseFunctionCallArgumentsDone;
          this.callToolsQueue.push({
            name: data.name,
            arguments: data.arguments,
            id: data.event_id,
          });
        },
        // 本轮对话结束的远程表示，此时理论上已经收到了所有的音频片段
        [RealtimeServerEvent.ResponseDone]: async () => {
          this.ttsFinished = true;
          this.firstAudioPart = true;
          this.sealTTSAudioChunk();
          this.submitMessageData('control');
          try {
            // 依次调用所有的tools接口
            const responseQueue = await this.callTools();
            if (!responseQueue.length) return;
            // 按顺序上报
            for (const res of responseQueue) {
              this.sendMessage({
                event_id: v4(),
                type: RealtimeClientEvent.ConversationItemCreate,
                item: {
                  type: 'function_call_output',
                  output: res.response,
                },
              });
            }

            // 上报结束，告诉服务端生成回复，再次生成的回复是进入了新一轮对话
            this.sendMessage({
              type: RealtimeClientEvent.ResponseCreate,
              client_timestamp: Date.now(),
            });
          } catch (error) {
            console.error('call tools error', error);
          } finally {
            this.callToolsQueue = [];
          }
        },
        // 处理各种错误，按照文档来吧
        [RealtimeServerEvent.Error]: ev => {
          const data = ev as RealtimeError;
          this.log(
            'error',
            `[Realtime Err]: ${data.error.code}, ${data.error.message}`,
          );
        },
      };

      this.socket.onopen = async () => {
        console.log('websocket open');
        this.status = 'WS_OPEN';
        resolve(true);
      };

      this.socket.onmessage = async ev => {
        let res: RealtimeServerEventStruct;
        try {
          res = JSON.parse(ev.data as string) as RealtimeServerEventStruct;
          this.appendHistory(res);
          await handler[res.type]?.(res);
          await this.runEventTask(res.type);
        } catch (e) {
          return;
        }
      };

      this.socket.onerror = () => {
        this.status = 'WS_ERROR';
        this.destroy();
        reject();
      };

      this.socket.onclose = () => {
        console.log('ws disconnected');
        this.status = 'WS_CLOSE';
        this.destroy();
        reject();
      };
    });
  };
  // 向服务端发送消息
  private sendMessage = (data: RealtimeClientEventStruct) => {
    this.socket?.send(JSON.stringify(data));
    this.socket && this.appendHistory(data);
  };
  // * sessionConfig
  // 每次都计算出完整的session配置
  private getSessionConfig = () => {
    const localVAD = null;
    const serverVAD = { type: 'server_vad' };
    let tools = null;

    // 目前仅audio支持自定义tools
    if (this.chatMode === 'audio' && this.toolsConfig) {
      try {
        tools = JSON.parse(this.toolsConfig);
      } catch (e) {
        tools = null;
        this.log('warning', '[Realtime Warning]: tools 配置解析出错，请检查');
      }
    }

    const defaultConfig: SessionUpdate = {
      type: RealtimeClientEvent.SessionUpdate,
      event_id: v4(),
      client_timestamp: Date.now(),
      session: {
        turn_detection: this.inputMode === 'serverVAD' ? serverVAD : localVAD,
        instructions: this.instructions,
        output_audio_format: this.ttsFormat === 'pcm' ? 'pcm' : 'mp3',
        tools,
        beta_fields: {
          chat_mode: this.chatMode,
          tts_source: this.ttsSource,
        },
        voice: this.voice,
      },
    };

    return defaultConfig;
  };
  // 更新session配置
  updateSessionConfig = () => {
    this.sendMessage(this.getSessionConfig());
  };
  // 封存tts音频
  private sealTTSAudioChunk = () => {
    if (!this.streamPlayer.ttsChunks.length) return;

    if (this.streamPlayer.format === 'mp3') {
      const blob = new Blob(this.streamPlayer.ttsChunks, { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const item = this.messageData.find(item => item.id === this.responseID);
      if (item) {
        item.audioURL = url;
        item.audioFormat = 'mp3';
      }
    } else if (this.streamPlayer.format === 'pcm') {
      const f32Array = mergeFloat32Arrays(
        this.streamPlayer.ttsChunks as Float32Array[],
      );
      const wav = createWavFile(f32Array, 24000);
      const blobUrl = URL.createObjectURL(wav);
      const item = this.messageData.find(item => item.id === this.responseID);
      if (item) {
        item.audioURL = blobUrl;
        item.audioFormat = 'wav';
      }
    }
    this.streamPlayer.ttsChunks = [];
  };
  // 插入第一条asr消息，因为有不同的输入方式，所以单独抽出
  private appendASRMessageData = () => {
    const recordBlob = createWavFile(
      this.vad.recordPCM,
      this.userStream.sampleRate,
    );
    const recordBlobURL = URL.createObjectURL(recordBlob);
    this.messageData.push({
      type: 'asr',
      id: this.itemID,
      textContent: '',
      audioURL: recordBlobURL,
      audioFormat: 'wav',
      imgList: [...this.imageCache],
    });
    this.options.onMessage?.('asr', this.messageData);
    this.vad.clearRecord();
    this.imageCache = [];
  };
  // 提交消息和历史数据，这里简单点每次都把消息历史扔出去
  private submitMessageData = (type: MessageType) => {
    this.options.onMessage?.(type, [...this.messageData]);
  };

  // * systemPrompt，手动更新
  private instructions = '';
  setInstructions = (instructions: string) => {
    this.instructions = instructions;
    return this;
  };

  // * call tools，工具调用，由用户输入JSON转换而来，手动更新
  private toolsConfig = '';
  setToolsConfig = (tools: string) => {
    // 用于某种一次提交的交互方式
    this.toolsConfig = tools;
    return this;
  };

  // * 工具调用队列，可能有多个任务，在response.done时，处理每个工具调用，并上报结果
  private callToolsQueue: FunctionCallQueueItem[] = [];
  private callTools = async () => {
    if (!this.callToolsQueue.length) return [];
    const responseQueue: FunctionCallQueueResponse[] = [];
    const customQueue: FunctionCallQueueItem[] = [];
    for (const task of this.callToolsQueue) {
      // 自定义tools交给外部处理
      customQueue.push(task);
      // 内置tools在这里处理
      // if (task.name === 'search_engine') {
      //   const { q } = JSON.parse(task.arguments);
      //   const res = await callRealtimeSearchTool(q);
      //   responseQueue.push({
      //     ...task,
      //     name: task.name,
      //     arguments: task.arguments,
      //     response: JSON.stringify(res),
      //   });
      // } else {
      //   // 自定义工具
      // }
    }

    if (customQueue.length) {
      // 自定义工具的回调，通过用户输入手动回传调用结果并上报
      const res = await this.options.onSubmitCustomCallTools?.(customQueue);
      responseQueue.push(...(res ? res : []));
    }

    return responseQueue;
  };

  // * 用户输入管理，切换时，先关闭全部，再根据远程或本地模式判断是否经过session.update异步切换
  private inputMode: RealtimeOptions['inputMode'] = 'manual';
  // 音频处理节点，手动模式和远程VAD共用一个属性，但不共用一个节点实例和事件处理
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  // 设置用户输入模式，先卸载，再考虑同步或异步装载
  setInputMode = (mode: RealtimeOptions['inputMode']) => {
    if (this.inputMode === mode) return;
    const oldMode = this.inputMode;
    this.inputMode = mode;

    // 先将旧的输入模式关闭
    switch (oldMode) {
      case 'manual':
        this.disableManualTalk();
        break;
      case 'serverVAD':
        this.disableServerVAD();
        break;
      case 'localVAD':
        this.vad.pause();
        break;
      default:
        break;
    }

    // 再加载新的输入配置
    switch (mode) {
      case 'manual':
        // 本地模式切本地模式，直接启动
        if (oldMode !== 'serverVAD') {
          this.enableManualTalk();
        }
        // 远程切本地，异步启动
        break;
      case 'serverVAD':
        // 本地切远程模式，发session.update，目前仅有一种远程，所以直接切
        this.updateSessionConfig();
        break;
      case 'localVAD':
        // 本地模式切本地模式，直接启动
        if (oldMode !== 'serverVAD') {
          this.vad.start();
        }
        // 远程切本地，异步启动
        break;
      default:
        break;
    }
  };

  // * 装载手动输入模式
  private enableManualTalk = () => {
    if (this.scriptProcessorNode) return;
    this.scriptProcessorNode =
      this.userStream.recorderContext!.createScriptProcessor(4096, 1, 1);
    this.scriptProcessorNode?.addEventListener(
      'audioprocess',
      this.handleManualProcess,
    );
    this.userStream.gainNode
      ?.connect(this.scriptProcessorNode!)
      .connect(this.userStream.destAudioNode!);
  };
  // 卸载手动输入模式
  private disableManualTalk = () => {
    this.scriptProcessorNode?.removeEventListener(
      'audioprocess',
      this.handleManualProcess,
    );
    this.scriptProcessorNode?.disconnect(this.userStream.destAudioNode!);
    this.userStream.gainNode?.connect(this.userStream.destAudioNode!);
    this.scriptProcessorNode = null;
  };
  private handleManualProcess = async (ev: AudioProcessingEvent) => {
    if (!this.speeching) return;
    const inputBuffer = ev.inputBuffer.getChannelData(0);
    this.vad.recordPCMPart = concatFloat32Array(
      this.vad.recordPCMPart,
      inputBuffer,
    );
    const wavBlob = createWavFile(inputBuffer, this.userStream.sampleRate);
    const wav64 = await blobToBase64(wavBlob);
    if (!this.speeching) return;
    this.sendMessage({
      type: RealtimeClientEvent.InputAudioBufferAppend,
      audio: wav64.split(',')[1],
      client_timestamp: Date.now(),
    });
  };
  // 进行手动输入模式，手动提交消息，并开始语音识别
  manualTalk = () => {
    this.speeching = true;
    this.firstAudioPart = true;
    if (this.streamPlayer.format === 'mp3') {
      this.streamPlayer.endOfStream();
    }
    if (!this.ttsFinished) {
      this.sendMessage({
        type: RealtimeClientEvent.ResponseCancel,
        client_timestamp: Date.now(),
      });
      this.ttsFinished = true;
    }
    this.sealTTSAudioChunk();
    this.submitMessageData('tts');
    this.streamPlayer.pause();
  };
  // 释放手动模式，处理录音，提交消息
  releaseManualTalk = () => {
    this.speeching = false;
    // 允许自动播放
    this.playBufferedTTS = true;
    // 合并用户录音
    this.vad.recordPCM = concatFloat32Array(
      this.vad.recordPCM,
      this.vad.recordPCMPart,
    );
    // 重置播放器
    this.streamPlayer.reset();
    this.lastSpeechTime = Date.now();
    this.sendMessage({
      type: RealtimeClientEvent.InputAudioBufferCommit,
      client_timestamp: Date.now(),
    });
    this.sendMessage({
      type: RealtimeClientEvent.ResponseCreate,
      client_timestamp: Date.now(),
    });
  };

  // * 服务端VAD模式，切换时先发送session.update，从回调中确认，再装载processor
  private enableServerVAD = () => {
    // 如果已经存在processor，表示重复开启或上个输入模式未卸载
    if (this.scriptProcessorNode) return;
    console.log('-=-=-=-=');
    this.scriptProcessorNode =
      this.userStream.recorderContext!.createScriptProcessor(2048, 1, 1);
    this.scriptProcessorNode.addEventListener(
      'audioprocess',
      this.handleServerVADProcess,
    );
    this.userStream.gainNode
      ?.connect(this.scriptProcessorNode!)
      .connect(this.userStream.destAudioNode!);
  };
  // 关闭服务端VAD模式，注销processor事件，去掉Processor节点
  private disableServerVAD = () => {
    if (!this.scriptProcessorNode) return;
    this.updateSessionConfig();
    this.scriptProcessorNode.removeEventListener(
      'audioprocess',
      this.handleServerVADProcess,
    );
    // 先将ProcessorNode两端解链，再将gainNode和目标节点连接
    this.scriptProcessorNode.disconnect(this.userStream.destAudioNode!);
    this.userStream.gainNode?.disconnect(this.scriptProcessorNode!);
    this.userStream.gainNode?.connect(this.userStream.destAudioNode!);
    this.scriptProcessorNode = null;
  };
  // 服务端VAD模式下，用户说话时，先缓存6个chunk，再发送给服务端
  private serverVADAheadChunkQueue = new FixedQueue<Float32Array>(6);
  // server vad的processNode回调函数
  private handleServerVADProcess = async (ev: AudioProcessingEvent) => {
    const inputBuffer = ev.inputBuffer.getChannelData(0);
    if (this.speeching) {
      if (this.serverVADAheadChunkQueue.length) {
        const aheadChunk = mergeFloat32Arrays(
          this.serverVADAheadChunkQueue.getQueue(),
        );
        this.vad.recordPCMPart = concatFloat32Array(
          aheadChunk,
          this.vad.recordPCMPart,
        );
        this.serverVADAheadChunkQueue.clear();
      }
      this.vad.recordPCMPart = concatFloat32Array(
        this.vad.recordPCMPart,
        inputBuffer,
      );
    } else {
      this.serverVADAheadChunkQueue.append(new Float32Array(inputBuffer));
    }
    const wavBlob = createWavFile(inputBuffer, this.userStream.sampleRate);
    const wav64 = await blobToBase64(wavBlob);
    this.sendMessage({
      type: RealtimeClientEvent.InputAudioBufferAppend,
      audio: wav64.split(',')[1],
      client_timestamp: Date.now(),
    });
  };

  // * 视觉模式，截图是全程持续的
  private picInterval = 500; // 截图发送的频率，单位：毫秒，根据fps换算
  private picIntervalTimer: number = NaN;
  private setPicInterval = (fps: number) => {
    this.picInterval = 1000 / fps;
  };
  // 截图的缓存，仅在speeching期间缓存
  private imageCache: string[] = [];
  // 开启捕获视频截图，开启前先重置一下，允许连续调用
  private startCaptureVideo = async () => {
    this.stopCaptureVideo();
    const { base64 } = await this.userStream.captureVideo();
    this.sendMessage({
      type: RealtimeClientEvent.InputAudioBufferAppendVideoFrame,
      video_frame: base64,
      client_timestamp: Date.now(),
    });
    this.picIntervalTimer = window.setInterval(async () => {
      const { base64, url } = await this.userStream.captureVideo();
      if (this.speeching) {
        this.imageCache.push(url);
      }
      this.sendMessage({
        type: RealtimeClientEvent.InputAudioBufferAppendVideoFrame,
        video_frame: base64,
        client_timestamp: Date.now(),
      });
    }, this.picInterval);
  };
  // 停止捕获视频截图
  private stopCaptureVideo = () => {
    window.clearInterval(this.picIntervalTimer);
    this.picIntervalTimer = NaN;
    this.imageCache = [];
  };

  // tts音色
  private voice = 'default';
  setTTSVoice = (voice: string) => {
    this.voice = voice;
    return this;
  };
  // tts来源
  private ttsSource: TTSSource = 'e2e';
  setTTSVoiceSource = (source: TTSSource) => {
    this.ttsSource = source;
    return this;
  };

  // * tts格式
  // ! 此处代表sessionConfig状态，而运行时状态在streamPlayer模块内维护（重要）
  ttsFormat: 'pcm' | 'mp3' = 'pcm';
  setTTSFormat = (format?: 'pcm' | 'mp3') => {
    if (this.ttsFormat === format) return this;
    this.ttsFormat = format ?? 'pcm';
    return this;
  };

  // * realtime事件循环， 用于注册需要轮到指定事件时再运行的任务
  private eventQueues: Record<
    RealtimeServerEvent,
    (() => Promise<void> | void)[]
  > = {
    [RealtimeServerEvent.SessionCreated]: [],
    [RealtimeServerEvent.SessionUpdated]: [],
    [RealtimeServerEvent.InputAudioBufferSpeechStarted]: [],
    [RealtimeServerEvent.InputAudioBufferSpeechStopped]: [],
    [RealtimeServerEvent.InputAudioBufferCommitted]: [],
    [RealtimeServerEvent.ConversationItemCreated]: [],
    [RealtimeServerEvent.ResponseCreated]: [],
    [RealtimeServerEvent.ConversationItemInputAudioTranscriptionCompleted]: [],
    [RealtimeServerEvent.ResponseAudioTranscriptDelta]: [],
    [RealtimeServerEvent.ResponseAudioDelta]: [],
    [RealtimeServerEvent.ResponseFunctionCallArgumentsDone]: [],
    [RealtimeServerEvent.ResponseDone]: [],
    [RealtimeServerEvent.Error]: [],
  };
  appendEventTask = (
    eventType: RealtimeServerEvent,
    eventTask: () => Promise<void> | void,
  ) => {
    this.eventQueues[eventType].push(eventTask);
  };
  private runEventTask = async (eventType: RealtimeServerEvent) => {
    const eventTasks = this.eventQueues[eventType];
    for (const eventTask of eventTasks) {
      await eventTask();
    }
    this.eventQueues[eventType] = [];
  };

  // * 消息日志
  private useHistory = false; // 开关
  private history: RealtimeEventStruct[] = [];
  private appendHistory = (data: RealtimeEventStruct) => {
    if (!this.useHistory) return;
    if (!data.event_id) {
      data.event_id = v4();
    }
    switch (data.type) {
      case RealtimeServerEvent.SessionCreated:
      case RealtimeServerEvent.SessionUpdated:
      case RealtimeServerEvent.InputAudioBufferSpeechStarted:
      case RealtimeServerEvent.InputAudioBufferSpeechStopped:
      case RealtimeServerEvent.InputAudioBufferCommitted:
      case RealtimeServerEvent.ConversationItemCreated:
      case RealtimeServerEvent.ResponseCreated:
      case RealtimeServerEvent.ResponseFunctionCallArgumentsDone:
      case RealtimeServerEvent.ResponseDone:
      case RealtimeServerEvent.Error:
      case RealtimeClientEvent.InputAudioBufferPreCommit:
      case RealtimeClientEvent.InputAudioBufferCommit:
      case RealtimeClientEvent.ResponseCancel:
      case RealtimeClientEvent.ResponseCreate:
      case RealtimeClientEvent.ConversationItemCreate:
      case RealtimeServerEvent.ConversationItemInputAudioTranscriptionCompleted:
        this.history.push(data);
        break;
      // 以下的事件通常是大量连续的，所以尽量做合并处理
      case RealtimeServerEvent.ResponseAudioTranscriptDelta:
        if (this.history[this.history.length - 1]?.type === data.type) {
          this.history[this.history.length - 1] = {
            ...data,
            delta:
              (
                this.history[
                  this.history.length - 1
                ] as ResponseAudioTranscriptDelta
              ).delta +
              ', ' +
              `【Length: ${data.delta.length}】`,
          };
        } else {
          this.history.push({
            ...data,
            delta: `【Length: ${data.delta.length}】`,
          });
        }
        break;
      case RealtimeServerEvent.ResponseAudioDelta:
        if (this.history[this.history.length - 1]?.type === data.type) {
          this.history[this.history.length - 1] = {
            ...data,
            delta:
              (this.history[this.history.length - 1] as ResponseAudioDelta)
                .delta +
              ', ' +
              `【${getBinarySizeFromString(data.delta)} KB】`,
          };
        } else {
          this.history.push({
            ...data,
            delta: `【${getBinarySizeFromString(data.delta)} KB】`,
          });
        }
        break;
      case RealtimeClientEvent.InputAudioBufferAppend:
        if (this.history[this.history.length - 1]?.type === data.type) {
          this.history[this.history.length - 1] = {
            ...data,
            audio:
              (this.history[this.history.length - 1] as InputAudioBufferAppend)
                .audio +
              ', ' +
              `【${getBinarySizeFromString(data.audio)} KB】`,
          };
        } else {
          this.history.push({
            ...data,
            audio: `【${getBinarySizeFromString(data.audio)} KB】`,
          });
        }
        break;
      case RealtimeClientEvent.InputAudioBufferAppendVideoFrame:
        if (this.history[this.history.length - 1]?.type === data.type) {
          this.history[this.history.length - 1] = {
            ...data,
            video_frame:
              (
                this.history[
                  this.history.length - 1
                ] as InputAudioBufferAppendVideoFrame
              ).video_frame +
              ', ' +
              `【${getBinarySizeFromString(data.video_frame)} KB】`,
          };
        } else {
          this.history.push({
            ...data,
            video_frame: `【${getBinarySizeFromString(data.video_frame)} KB】`,
          });
        }
        break;
      default:
        this.history.push(data);
        return;
    }
    this.options.onHistory?.([...this.history]);
  };
  clearHistory = () => {
    this.history = [];
  };
}
