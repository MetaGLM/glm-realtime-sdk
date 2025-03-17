# Realtime Web Demo

## 介绍

拆分自与 GLM-Realtime API 同步开发的web demo，提供实时的音视频通话功能。

本仓库包含了一个基于 GLM-Realtime 协议和 WebSocket 的实时对话 SDK 和一个示例应用。

## 页面功能及特性

- 支持多种输入模式：手动模式、本地 VAD、服务端 VAD
- 支持音频和视频对话模式
- 切换视频源
- 支持自定义Function call调用或手动上报调用结果
- 支持切换TTS音频格式
- 支持 TTS 来源和音色
- 支持用户录音回放
- 支持实时音频流播放
- 理论上支持openai realtime协议

## 快速体验GLM-Realtime

```bash
pnpm i
pnpm run dev
```

## 目录结构

```
.src
├── components/                   # web demo用到的组件
├── consts/realtime.ts            # 用到的常量和测试触发用的tools
├── hooks/useRealtimeChat.ts      # 基于react使用风格封装realtimeSDK的hooks
├── pages/RealtimeVideo           # 示例Demo页
├── styles/                       # 样式文件
├── types/realtime.ts             # Realtime 协议的类型定义
├── utils/chatHelper.ts           # 包含各种音频、图像格式转换的工具类
├────────/chatSDK/realtimeChat.ts # Realtime协议实现，核心代码
└────────/chatSDK/lib/            # 基础功能模块
```

## Realtime Client SDK

基于 WebSocket 的实时对话 SDK，支持语音输入、语音合成(TTS)、视频输入等功能。理论上也兼容 openai realtime
协议。你可以根据自己的需求进行修改和扩展，替换相应模块。

### 结构

#### 基础功能模块：

- 用户音视频媒体流
  - 为用户输入提供统一的音视频流
- 流式音频播放器
  - PCM流式播放器（Web Audio API）
  - MP3流式播放器（Media Source Extensions API）
- VAD 检测
  - onnxruntime-web + Silero VAD v4

#### chatBase：

- 基础功能模块之间可以通过chatBase互相访问，隔绝与应用层的联系
- 通过继承chatBase支持协议、实现具体的应用层代码、访问基础功能模块

#### RealtimeChat：

- 实现realtime协议
- 实现网络连接
- 维护会话状态、通话配置、生命周期、事件日志
- 支持多种输入方式

### 快速开始

```js
const realtime = new RealtimeChat({
  wsURL:
    'wss://open.bigmodel.cn/api/paas/v4/realtime?Authorization=your_api_key',
  inputMode: 'localVAD',
  onActive: () => {
    console.log('可以开始对话了');
    realtime.destroy(); // 关闭对话，销毁实例
  },
});
realtime.start();
```

### 设计思路和使用风格

- 每个可配置的属性都有默认值
- 用于开关某一功能的方法均可重复执行
- 每次通话生成一个新的实例
- 更新 sessionConfig 需每次提交完整的配置，所以很多配置项都设为了非主动上报更新，而是统一上报更新

### 配置项

| 属性名        | 类型                                            | 描述               |
| ------------- | ----------------------------------------------- | ------------------ |
| wsURL         | string                                          | WebSocket连接地址  |
| inputMode     | 'manual' \| 'localVAD' \|'serverVAD'            | 输入模式           |
| chatMode      | 'video_passive' \| 'audio' \| 'video_proactive' | 对话模式           |
| useHistory    | boolean                                         | 是否记录ws事件日志 |
| ttsFormat     | 'mp3' \| 'pcm'                                  | TTS音频格式        |
| audioElement  | HTMLAudioElement                                | 音频元素           |
| userStream    | UserStream                                      | 用户音视频媒体流   |
| sessionConfig | SessionConfig                                   | 会话配置           |
| vadOptions    | VADOptions                                      | VAD配置            |

#### UserStream

| 属性名        | 类型                    | 描述         |
| ------------- | ----------------------- | ------------ |
| videoElement  | HTMLVideoElement        | 视频元素     |
| facingMode    | 'user' \| 'environment' | 摄像头朝向   |
| videoDevice   | 'screen \| 'camera'     | 摄像头or屏幕 |
| videoDeviceID | string                  | 视频源设备ID |

#### SessionConfig

| 属性名             | 类型           | 描述                                            |
| ------------------ | -------------- | ----------------------------------------------- |
| tools              | Array          | 工具列表                                        |
| instructions       | string         | 系统提示词                                      |
| voice              | string         | 音色                                            |
| tts_source         | TTSSource      | TTS来源                                         |
| input_audio_format | 'wav' \| 'pcm' | pcm后可追加采样率比如\"pcm16\"表示16khz，默认16 |

#### VADOptions

| 属性名            | 类型                         | 描述                   |
| ----------------- | ---------------------------- | ---------------------- |
| threshold         | number                       | VAD阈值                |
| vadFrame          | number                       | VAD用于检测的帧数      |
| onSpeech          | (speeching: boolean) => void | 语音状态回调           |
| onSpeechStart     | () => void                   | 语音开始回调           |
| revokeSpeechStart | () => boolean                | 撤销语音开始回调的条件 |
| onSpeechEnd       | () => void                   | 语音结束回调           |
| revokeSpeechEnd   | () => boolean                | 撤销语音结束回调的条件 |
| onFrameProcess    | (pcm: Float32Array) => void  | 用户音频帧处理回调     |
| onVADOpen         | (on: boolean) => void        | VAD开关状态回调        |

### 事件(public)

| 事件名                  | 类型                                                                     | 描述                       |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------- |
| onHistory               | (message: RealtimeChat['history']) => void                               | 协议消息事件记录           |
| onActive                | (active: boolean) => void                                                | 环境准备完毕，允许用户输入 |
| onSpeeching             | (speeching: boolean) => void                                             | 判定用户正在发言           |
| onMessage               | (type: MessageType, data: RealtimeChat['messageData']) => void           | 对话消息记录               |
| onVADOpen               | (on: boolean) => void                                                    | VAD开关状态回调            |
| onChatModeChange        | (chatMode: ChatMode) => void                                             | 对话模式变更完毕           |
| onStatus                | (status: RealtimeStatus) => void                                         | 环境准备状态               |
| onSubmitCustomCallTools | (queue: FunctionCallQueueItem[]) => Promise<FunctionCallQueueResponse[]> | 自定义工具调用回调         |
| onLog                   | (type: LogType, message: string) => void                                 | realtime SDK传出的消息     |

### 方法(public)

#### SDK实例

| 方法名              | 参数                                                                             | 描述                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| start               | () => Promise<void>                                                              | 实例创建后调用，依次初始化用户音频流，本地VAD，流式播放器，建立ws连接，连接打开后结束                                                              |
| destroy             | () => void                                                                       | 关闭或销毁所有功能模块，消息历史等保留                                                                                                             |
| updateSessionConfig | () => void                                                                       | 更新会话配置，会从实例各属性中收集相关字段，每次更新都会上报完整的集合（你用到的部分）                                                             |
| setInstructions     | (instructions: string) => this                                                   | 设置SystemPrompt，不主动更新sessionConfig                                                                                                          |
| setToolsConfig      | (tools: string) => this                                                          | 设置自定义的function call tools，方法自行转换，最外层要求是个数组，不主动更新sessionConfig                                                         |
| setTTSVoice         | (voice: string) => void                                                          | 切换音色                                                                                                                                           |
| setTTSSource        | (source: TTSSource) => this                                                      | 切换tts来源，下次response生效                                                                                                                      |
| setInputMode        | (mode: 'manual' \| 'localVAD' \|'serverVAD' ) => void                            | 切换输入模式，先卸载当前模式，再装载新的模式，对于本地模式与远程模式之间的转换，需要等到session.updated之后再装载，期间无法输入                    |
| manualTalk          | () => void                                                                       | 手动发言开始，结束前会不停发送音频，无VAD检测                                                                                                      |
| releaseManualTalk   | () => void                                                                       | 释放手动发言，会执行speechEnd的行为                                                                                                                |
| setInputAudioFormat | (format?: 'wav' \| 'pcm' \| string) => void                                      | 输入音频格式，默认wav，pcm后可追加采样率，比如\"pcm16\"表示16khz，默认16khz                                                                        |
| setTTSFormat        | (format: 'mp3' \| 'pcm') => void                                                 | 切换tts音频格式，被动更新，在session.updated之后注册任务到下一次input_audio_buffer.committed再正式切换播放器，因为模型可能连续发消息(主动发言或fc) |
| appendEventTask     | (eventType: RealtimeServerEvent, eventTask: () => Promise<void> \| void) => void | 在realtime的事件循环中注册任务                                                                                                                     |

#### vad模块

| 方法名       | 参数                | 描述                           |
| ------------ | ------------------- | ------------------------------ |
| init         | () => Promise<void> | 创建vad实例，加载相关资源      |
| start        | () => void          | 开启VAD检测用户发言            |
| pause        | () => void          | 暂停VAD检测用户发言            |
| destroy      | () => void          | 关闭vad的运行状态并销毁vad实例 |
| concatRecord | () => void          | 拼接用户每个分句的录音片段     |
| clearRecord  | () => void          | 置空用户录音                   |

#### userStream模块

| 方法名          | 参数                                                                 | 描述                                                            |
| --------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| init            | () => Promise<void>                                                  | 同时初始化音视频流，realtime 协议默认以音频启动，所以没用到这个 |
| initVideoStream | () => Promise<void>                                                  | 初始化用户视频流，直到播放器加载到了视频                        |
| stopVideoStream | () => void                                                           | 卸载视频流                                                      |
| captureVideo    | () => Promise<{base64: string; url: string}>                         | 捕获视频流截图                                                  |
| setFacingMode   | (mode: 'user' \| 'environment') => void                              | 切换前后摄像头并重新初始化视频流                                |
| setResolution   | (constraints: MediaTrackConstraints) => void                         | 设置视频分辨率                                                  |
| setVideoDevice  | (device: 'screen' \| 'camera', deviceID: string = 'default') => void | 设置视频流设备ID并重新初始化视频流                              |
| initAudioStream | () => Promise<void>                                                  | 初始化用于用户输入的音频流，过程中可以对音频流进行预处理        |
| destroy         | () => void                                                           | 卸载所有音视频流，销毁相关实例                                  |

#### streamPlayer模块

| 方法名                  | 参数                   | 返回值            | 描述                                                                   |
| ----------------------- | ---------------------- | ----------------- | ---------------------------------------------------------------------- |
| setFormat               | format: 'mp3' \| 'pcm' | Promise<void>     | 设置音频格式，切换播放器类型。如果有任务进行中，新格式将在下轮对话生效 |
| createMediaStreamPlayer | 无                     | MediaStreamPlayer | 创建MediaStreamPlayer实例                                              |
| createPcmPlayer         | 无                     | PCMPlayer         | 创建PCMPlayer实例                                                      |
| get playing             | 无                     | boolean           | 获取当前播放状态                                                       |
| init                    | 无                     | Promise<void>     | 初始化播放器                                                           |
| append                  | audioParts: string     | void              | 添加音频数据，根据format类型进行不同的处理                             |
| reset                   | 无                     | void              | 重置播放器状态                                                         |
| pause                   | 无                     | void              | 暂停播放                                                               |
| destroy                 | 无                     | void              | 销毁播放器实例并清空ttsChunks                                          |
| endOfStream             | 无                     | void              | 结束MediaSource的流管理（仅mp3格式可用）                               |
| adaptBuffer             | data: BufferSource     | void              | 调度音频切片的追加或排队（仅mp3格式可用）                              |
| checkBufferUpdating     | 无                     | boolean           | 检查buffer是否处理完成（仅mp3格式可用）                                |

#### mediaStreamPlayer模块

| 方法名              | 参数               | 返回值        | 描述                                                                                    |
| ------------------- | ------------------ | ------------- | --------------------------------------------------------------------------------------- |
| append              | data: BufferSource | void          | 将音频片段追加到 sourceBuffer，并设置 updateend 事件监听器，形成串行事件流              |
| init                | 无                 | Promise<void> | 初始化媒体源，创建新的 MediaSource 实例并设置相关配置                                   |
| reset               | 无                 | Promise<void> | 重置 MediaSource，用于在每轮对话结束后释放资源并创建新的媒体源                          |
| destroy             | 无                 | void          | 结束媒体流并中止正在进行的 sourceBuffer 更新，移除音频事件监听                          |
| pause               | 无                 | void          | 暂停音频播放并更新播放状态                                                              |
| endOfStream         | 无                 | void          | 当 MediaSource 处于 open 状态时，结束媒体流                                             |
| adaptBuffer         | data: BufferSource | void          | 调度音频切片，根据当前状态决定直接追加还是加入队列                                      |
| checkBufferUpdating | 无                 | boolean       | 检查 buffer 是否正在更新，包括检查 bufferUpdating 状态、sourceBuffer 更新状态和队列长度 |

#### pcmPlayer模块

根据 <mcfile name="pcmPlayer.ts" path="/Users/zhangzichen/WebstormProjects/glm-realtime-sdk/frontend/src/utils/chatSDK/lib/pcmPlayer.ts"></mcfile> 文件，我为您总结了所有公开的实例方法：

| 方法名  | 参数                     | 返回值        | 描述                                                   |
| ------- | ------------------------ | ------------- | ------------------------------------------------------ |
| init    | 无                       | Promise<void> | 初始化PCM播放器，销毁已有实例并创建新实例，设置音量为2 |
| append  | audioParts: Float32Array | void          | 添加PCM音频数据到播放器进行播放                        |
| reset   | 无                       | void          | 重置PCM播放器，实际上是重新初始化                      |
| destroy | 无                       | void          | 销毁PCM播放器实例并清空引用                            |
| pause   | 无                       | void          | 暂停PCM音频播放                                        |

### 客户端事件

#### session.update

- 更新会话配置
- 用到的字段，每次都要上传完整的集合

#### response.cancel

- 打断发言，会取消服务端包括当前正在进行的所有任务
- 允许在response.created和response.done之间发送
- 打断后也会收到response.done，可能会存在一定延迟，比如在你新的提交之后，所以要注意自己对response.done行为的定义

#### input_audio_buffer.pre_commit

- 预提交，也可以理解为分句提交，主要是为了让模型尽早的开始工作
- 不发送预提交也可以，但要注意vadFrame的设置不能太短，太短的音频片段也会影响交互和ASR的效果

#### input_audio_buffer.append

- 音频切片，通常是100ms左右，50~200ms最佳，不然可能影响延迟和ASR效果

#### input_audio_buffer.commit

- 表示音频切片提交完毕

#### response.create

- 告诉服务端开始生成回复，通常和提交同时发送

#### conversation.item.create

- response.done前如果有收到模型的function call指令时发送
- 用于上报function call tools的调用结果，顺序和数量要和response.function_call_arguments.done一致

#### input_audio_buffer.append_video_frame

- 从视频流捕获的图像，要求等效分辨率转换到1120 \* 1120或者更大的尺寸，能被28整除即可
- 尽量清晰，压缩不要太失真
- 按照session.updated中指定的频率来发送，无论实际发送频率多少，模型也只会按照指定的间隔理解图像

### 服务端事件

#### session.created

- 会话创建完成，此时会收到默认的sessionConfig
- 通常建议这里发送session.update来初始化自己的使用场景配置

#### session.updated

- 会话配置更新完成，此时会收到更新后的sessionConfig
- 对于一些异步生效的配置，比如远程输入方式，视频模式切换，在这里处理最好
- tts格式切换由于涉及到音频格式切换，为了不打断播放的连续性和录音的完整性，建议通过注册事件循环实践到下次input_audio_buffer.committed再切换播放器

#### input_audio_buffer.speech_started

- serverVAD下当用户开始说话时，会触发此事件
- server vad模式下，打断的消息是托管的，客户端不用考虑，只需要处理本地音频的状态

#### input_audio_buffer.speech_stopped

- serverVAD下当用户停止说话时，会触发此事件
- server vad模式下，也不需要考虑pre_commit

#### input_audio_buffer.committed

- 服务端收到了用户提交音频的回调，在这里更新item_id

#### conversation.item.created

- 目前没啥用

#### response.created

- 表示回复开始生成，客户端准备接受并播放音频
- 更新response_id
- 主动说话模式下，你可能收到多个response.created，但是收到时很可能正在播放前面的tts
- 为了播放连续的效果，这里不建议进行中断播放的操作(比如重置播放器)

#### conversation.item.input_audio_transcription.completed

- ASR结果

#### response.audio.delta

- 通常在这里接受处理音频切片，如果切换了tts格式，会在下次response生效

#### response.audio_transcript.delta

- tts的文字片段，通常文字先于语音

#### response.function_call_arguments.done

- 收到模型调用工具的命令
- 每个工具的每次调用都会单独收到一次消息，在这里将其按顺序排入队列，等response.done时一并上报
- 工具都是客户端通过接口调用结果的，后面统一上报

#### response.done

- 无论是打断还是正常结束，都会收到response.done，表示模型已完成了本轮对话内容的生成
- 如果前面收到了工具调用任务，要在这里按顺序上报结果

### 问题汇总

当你需要自行实现GLM-Realtime协议时，你可以参考以下经验：

#### 如何初始化自己的会话配置

- 在确立连接并收到session.created事件后，再发送session.update来初始化自己的使用场景配置

#### 如何用视频模式开始通话

- 在收到session.created事件后，发送session.update来更新chat_mode字段为video_passive，等收到session.updated后，根据服务端要求的规格设定上传帧数，分辨率，请求用户视频流

#### 视频截图分辨率有什么要求

- 需要等效像素转换到1120 \* 1120或者更大的尺寸，能被28整除即可
- 如果不进行转换，服务端也会自行进行转换
- 上传频率如果不按要求传递，比如2fps，模型也会按每张图间隔500ms来理解

#### 移动设备可以用吗

- 可以，但是安卓设备间兼容性差异很大，有的能用，有的带不动，有的不支持onnxruntime所以本地vad不能用，有的请求到视频流之后会逐渐卡死
- ios < 17的不支持ManagedMediaSource所以不能流式管理mp3播放，pcm可以
- ios < 18对onnxruntime-web的支持很差，很有可能无法加载vad模型，所以本地vad不能用
- 所以server VAD + PCM tts是最简便最容易兼容的方案

#### VAD对音频参数的要求

- 采样率16000，背后用的是silero vad，16kHz是推荐值，其他值效果可能不理想
- 单声道
- 16位深度
- 这些参数最后会计算出音频的比特率，如果解码或播放时使用的参数不一致，会变调变速

#### 打断发言的规则是怎样的

- 非serverVAD模式下，response.cancel会打断之前所有的任务，所以不应该连续的发送打断事件，一次即可
- ServerVAD模式下，打断的消息是托管的，客户端不用考虑

#### 部署后遇到Failed to load module script

- 报错信息为Failed to load module script: Expected a JavaScript module script but the server responded with MIME type of
  application/octet-stream；Encountered an error while loading model file /sillero_vad_legacy.onnx
- 需要调整部署网页的服务器配置，将.mjs文件的Content-Type配置为text/javascript或application/javascript
