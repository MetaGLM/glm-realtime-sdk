export type ChatMode = 'video_passive' | 'audio' | 'video_proactive';
export type TTSSource = 'zhipu' | 'huoshan' | 'e2e';

// 事件类型
export type RealtimeEventType = RealtimeServerEvent | RealtimeClientEvent;
// 客户端发送的事件
export enum RealtimeClientEvent {
  SessionUpdate = 'session.update',
  ResponseCancel = 'response.cancel', // 取消回复
  InputAudioBufferPreCommit = 'input_audio_buffer.pre_commit',
  InputAudioBufferAppend = 'input_audio_buffer.append',
  InputAudioBufferCommit = 'input_audio_buffer.commit',
  ResponseCreate = 'response.create', // 开始回复
  ConversationItemCreate = 'conversation.item.create',
  InputAudioBufferAppendVideoFrame = 'input_audio_buffer.append_video_frame',
}
// 服务端发送的事件
export enum RealtimeServerEvent {
  SessionCreated = 'session.created', //
  SessionUpdated = 'session.updated', // 会话信息已设置
  InputAudioBufferSpeechStarted = 'input_audio_buffer.speech_started', // server vad 开始说话
  InputAudioBufferSpeechStopped = 'input_audio_buffer.speech_stopped', // server vad 结束说话
  InputAudioBufferCommitted = 'input_audio_buffer.committed', // 服务器收到了完整的用户音频
  ConversationItemCreated = 'conversation.item.created',
  ResponseCreated = 'response.created', // 服务器回复开始生成
  ConversationItemInputAudioTranscriptionCompleted = 'conversation.item.input_audio_transcription.completed', // asr
  ResponseAudioDelta = 'response.audio.delta', // tts 音频
  ResponseAudioTranscriptDelta = 'response.audio_transcript.delta', // tts 文字
  ResponseFunctionCallArgumentsDone = 'response.function_call_arguments.done', // 收到工具调用信息
  ResponseDone = 'response.done', // 最后一包，回复结束
  Error = 'error',
}

export type SessionConfig = {
  id: string;
  // 内部字段，这些不是openai的原生字段
  beta_fields: {
    chat_mode: ChatMode; // 音视频模式
    image_size_x?: number; // 截图尺寸
    image_size_y?: number;
    fps?: number; // 截图发送频率
    tts_source?: TTSSource; // tts来源
  };
  instructions: string; // system prompt
  // vad 类型
  turn_detection: {
    type: 'server_vad';
  } | null;
  tools: object[] | null; // function call tools
  input_audio_format: 'pcm' | 'wav' | string; // 输入音频格式，pcm16，pcm24表示采样率
  output_audio_format: 'pcm' | 'mp3'; // 输出tts音频格式
  voice: string; // 音色
};

// 客户端，需要用到的字段，每次发全量
export type SessionUpdateData = Partial<{
  [K in keyof SessionConfig]: SessionConfig[K] extends object
    ? Partial<SessionConfig[K]>
    : SessionConfig[K];
}>;
// 事件数据类型定义
export type RealtimeEventData =
  | RealtimeServerEventData
  | RealtimeClientEventData;
// 客户端事件数据类型定义
export type RealtimeClientEventData = {
  type: RealtimeClientEvent;
  event_id?: string;
  client_timestamp?: number;
};
// 服务端事件数据类型定义
export type RealtimeServerEventData = {
  type: RealtimeServerEvent;
  event_id: string;
};

// ******************************* 服务端事件数据类型定义
export interface SessionCreated extends RealtimeServerEventData {
  type: RealtimeServerEvent.SessionCreated;
  session: {
    id: string;
  };
}

export interface SessionUpdated extends RealtimeServerEventData {
  type: RealtimeServerEvent.SessionUpdated;
  session: {
    beta_fields: {
      chat_mode: ChatMode;
      image_size_x?: number;
      image_size_y?: number;
      fps?: number;
      tts_source?: TTSSource;
    };
    instructions: string; // system prompt
    turn_detection: {
      type: 'server_vad' | null;
    };
    tools: object[] | null;
    tts_config?: {
      tts_source: TTSSource;
      timbre: string;
    } | null;
    output_audio_format: 'pcm' | 'mp3';
    voice: string;
  };
}

export interface InputAudioBufferSpeechStarted extends RealtimeServerEventData {
  type: RealtimeServerEvent.InputAudioBufferSpeechStarted;
  item_id: string;
  audio_start_ms: number;
}

export interface InputAudioBufferSpeechStopped extends RealtimeServerEventData {
  type: RealtimeServerEvent.InputAudioBufferSpeechStopped;
  item_id: string;
  audio_end_ms: number;
}

export interface InputAudioBufferCommitted extends RealtimeServerEventData {
  type: RealtimeServerEvent.InputAudioBufferCommitted;
  previous_item_id: string;
  item_id: string;
}

export interface ConversationItemCreated extends RealtimeServerEventData {
  type: RealtimeServerEvent.ConversationItemCreated;
  item: {
    id: string;
  };
}

export interface ResponseCreated extends RealtimeServerEventData {
  type: RealtimeServerEvent.ResponseCreated;
  response: {
    id: string;
  };
}

export interface ConversationItemInputAudioTranscriptionCompleted
  extends RealtimeServerEventData {
  type: RealtimeServerEvent.ConversationItemInputAudioTranscriptionCompleted;
  response_id: string;
  item_id: string;
  transcript: string;
}

export interface ResponseAudioTranscriptDelta extends RealtimeServerEventData {
  type: RealtimeServerEvent.ResponseAudioTranscriptDelta;
  delta: string;
}

export interface ResponseAudioDelta extends RealtimeServerEventData {
  type: RealtimeServerEvent.ResponseAudioDelta;
  response_id: string;
  item_id: string;
  delta: string; // base64 mp3
}

export interface ResponseFunctionCallArgumentsDone
  extends RealtimeServerEventData {
  type: RealtimeServerEvent.ResponseFunctionCallArgumentsDone;
  name: string;
  arguments: string;
}

export interface ResponseDone extends RealtimeServerEventData {
  type: RealtimeServerEvent.ResponseDone;
  response: {
    usage?: {
      total_tokens: number;
      input_tokens: number;
      output_tokens: number;
      input_token_details: {
        text_tokens: number;
        audio_tokens: number;
      };
      output_token_details: {
        text_tokens: number;
        audio_tokens: number;
      };
    };
  };
}

export interface RealtimeError extends RealtimeServerEventData {
  type: RealtimeServerEvent.Error;
  error: {
    type: string;
    code: string;
    message: string;
  };
}

// ******************************* 客户端事件数据类型定义
export interface SessionUpdate extends RealtimeClientEventData {
  type: RealtimeClientEvent.SessionUpdate;
  event_id: string;
  session: SessionUpdateData;
}

export interface ResponseCancel extends RealtimeClientEventData {
  type: RealtimeClientEvent.ResponseCancel;
}

export interface InputAudioBufferPreCommit extends RealtimeClientEventData {
  type: RealtimeClientEvent.InputAudioBufferPreCommit;
}

export interface InputAudioBufferAppend extends RealtimeClientEventData {
  type: RealtimeClientEvent.InputAudioBufferAppend;
  audio: string; // base64 audio data
}

export interface InputAudioBufferCommit extends RealtimeClientEventData {
  type: RealtimeClientEvent.InputAudioBufferCommit;
}

export interface ResponseCreate extends RealtimeClientEventData {
  type: RealtimeClientEvent.ResponseCreate;
}

export interface ConversationItemCreate extends RealtimeClientEventData {
  type: RealtimeClientEvent.ConversationItemCreate;
  event_id: string;
  item: {
    type: 'function_call_output';
    output: string;
  };
}

export interface InputAudioBufferAppendVideoFrame
  extends RealtimeClientEventData {
  type: RealtimeClientEvent.InputAudioBufferAppendVideoFrame;
  video_frame: string; // base64 image data
}

// ******************************** 合并所有事件数据类型定义
export type RealtimeServerEventStruct =
  | ConversationItemCreated
  | SessionCreated
  | SessionUpdated
  | InputAudioBufferSpeechStarted
  | InputAudioBufferSpeechStopped
  | InputAudioBufferCommitted
  | ResponseCreated
  | ConversationItemInputAudioTranscriptionCompleted
  | ResponseAudioTranscriptDelta
  | ResponseAudioDelta
  | ResponseFunctionCallArgumentsDone
  | ResponseDone
  | RealtimeError;

export type RealtimeClientEventStruct =
  | SessionUpdate
  | ResponseCancel
  | ResponseCreate
  | InputAudioBufferPreCommit
  | InputAudioBufferAppend
  | InputAudioBufferCommit
  | ConversationItemCreate
  | InputAudioBufferAppendVideoFrame;

export type RealtimeEventStruct =
  | RealtimeServerEventStruct
  | RealtimeClientEventStruct;

// *************************** function call相关
export interface FunctionCallQueueItem {
  name: string;
  arguments: string;
  id: string;
}
export interface FunctionCallQueueResponse extends FunctionCallQueueItem {
  response: string;
}

export type MessageType = 'asr' | 'tts' | 'control';

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
