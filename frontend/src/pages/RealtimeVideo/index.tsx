import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Flex,
  Form,
  Input,
  Select,
  Typography,
  message,
  Modal,
  Segmented,
} from 'antd';
import {
  AudioFilled,
  AudioMutedOutlined,
  AudioOutlined,
  EditFilled,
  CameraOutlined,
  DesktopOutlined,
  CodeOutlined,
  CloseCircleOutlined,
  PlusCircleOutlined,
  SyncOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import classNames from 'classnames';
import copy from 'copy-to-clipboard';

import FunctionCallResponseEditor from './FunctionCallResponseEditor.tsx';
import useRealtimeChat, {
  RealtimeChatContext,
} from '@/hooks/useRealtimeChat.ts';
import { ResponseMessageData } from '@/types/realtime.ts';
import { IconLongPress } from '@/components/Icon';
import { ChatMode, FunctionCallQueueResponse } from '@/types/realtime.ts';
import styles from './index.module.less';
import BubbleList from '@/components/BubbleList.tsx';
import ScrollingWaveForm from '@/components/ScrollingWaveForm.tsx';
import Editor from '@monaco-editor/react';
import ChatLog from '@/components/ChatLog.tsx';
import RealtimeChat from '@/utils/chatSDK/realtimeChat.ts';

const { useForm, useWatch } = Form;

enum InputMode {
  LocalVAD = 'localVAD',
  Manual = 'manual',
  ServerVAD = 'serverVAD',
}

const inputModeOptions = [
  {
    label: (
      <span>
        <IconLongPress /> 长按
      </span>
    ),
    value: InputMode.Manual,
  },
  {
    label: (
      <span>
        <AudioFilled /> 语音
      </span>
    ),
    value: InputMode.LocalVAD,
  },
  {
    label: (
      <span>
        <EditFilled /> 服务端VAD
      </span>
    ),
    value: InputMode.ServerVAD,
  },
];

const initValues = {
  tools: '',
  wsURL:
    new URLSearchParams(window.location.search).get('realtimeServer') ||
    'wss://open.bigmodel.cn/api/paas/v4/realtime?Authorization=your_api_key', // 输入你的默认地址
  audioFormat: 'pcm',
  voice: 'default',
  tts_source: 'e2e',
};

const RealtimeVideo: React.FC = () => {
  const [form] = useForm();
  const [formChanged, setFormChanged] = useState(false);
  const realtimeTools = useWatch('tools', form);
  const wsURL = useWatch('wsURL', form);
  const instructions = useWatch('instructions', form);
  const audioFormat = useWatch('audioFormat', form);
  const voice = useWatch('voice', form);
  const ttsSource = useWatch('tts_source', form);
  const videoElement = useRef<HTMLVideoElement>(null);
  const audioElement = useRef<HTMLAudioElement>(null);
  const chatPanel = useRef<HTMLDivElement>(null);

  const [chatMode, setChatMode] = useState<ChatMode>('audio');
  const [messageList, setMessageList] = useState<ResponseMessageData[]>([]);
  const [historyList, setHistoryList] = useState<RealtimeChat['history']>([]);
  const [inputMode, setInputMode] = useState<InputMode>(InputMode.Manual);
  const [videoDevice, setVideoDevice] = useState<'screen' | 'camera'>('screen');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const {
    start,
    close,
    manualTalk,
    releaseManualTalk,
    active,
    speeching,
    init,
    vadOpen,
    status,
    chatInstance,
    updateSessionConfig,
  } = useRealtimeChat({
    wsURL,
    audioElement,
    videoElement,
    sessionConfig: {
      tools: realtimeTools,
      voice,
      tts_source: ttsSource,
      instructions,
    },
    ttsFormat: audioFormat,
    inputMode,
    userStream: {
      videoDevice,
    },
    chatMode,
    onMessage: (type, data) => {
      setMessageList(data);
      if (type === 'control') {
        chatPanel.current?.scrollTo({
          top: chatPanel.current.scrollHeight,
          behavior: 'smooth',
        });
      }
    },
    onLog: (type, text) => {
      message[type](text);
    },
    onHistory: setHistoryList,
    onSubmitCustomCallTools: async queue => {
      return await new Promise(resolve => {
        let result: Record<string, string> = {};
        Modal.confirm({
          width: '85%',
          centered: true,
          onCancel: () => resolve([]),
          onOk: () => {
            const responseQueue: FunctionCallQueueResponse[] = [];
            queue.forEach(item => {
              responseQueue.push({
                ...item,
                response: result[item.id] ?? '',
              });
            });
            resolve(responseQueue);
          },
          title: '有未支持的工具调用，请手动输入调用结果',
          content: (
            <FunctionCallResponseEditor
              queue={queue}
              onChange={(values: { responses: Record<string, string> }) => {
                result = values.responses;
              }}
            />
          ),
        });
      });
    },
  });

  const [sessionID, setSessionID] = useState<string>('');
  useEffect(() => {
    if (status === 'APP_AVAILABLE') {
      setSessionID(chatInstance.current?.sessionID ?? '');
    }
  }, [chatInstance, status]);

  const [pressing, setPressing] = useState(false);

  const userInput = useMemo(() => {
    switch (inputMode) {
      case InputMode.Manual: {
        return (
          <Flex gap={8} flex={1}>
            <Button
              block
              disabled={!active}
              icon={<IconLongPress />}
              className={classNames([
                styles.mic,
                pressing ? styles.on : styles.off,
              ])}
              onMouseDown={() => {
                if (pressing) return;
                setPressing(true);
                manualTalk();
              }}
              onMouseUp={() => {
                if (!pressing) return;
                setPressing(false);
                releaseManualTalk();
              }}
            >
              按住说话
            </Button>
          </Flex>
        );
      }
      case InputMode.LocalVAD: {
        return (
          <Button
            block
            disabled={!active}
            icon={vadOpen ? <AudioOutlined /> : <AudioMutedOutlined />}
            onClick={() => {
              vadOpen
                ? chatInstance.current?.vad.pause()
                : chatInstance.current?.vad.start();
            }}
            className={classNames([
              styles.mic,
              vadOpen ? styles.on : styles.off,
            ])}
          >
            Mic
          </Button>
        );
      }
      case InputMode.ServerVAD: {
        return (
          <Button
            block
            disabled={status !== 'WS_OPEN' || !active}
            icon={active ? <AudioOutlined /> : <AudioMutedOutlined />}
            className={classNames([
              styles.mic,
              active ? styles.on : styles.off,
            ])}
          >
            {active ? '正在发言' : '停止发言'}
          </Button>
        );
      }
    }
  }, [
    inputMode,
    active,
    pressing,
    manualTalk,
    releaseManualTalk,
    vadOpen,
    chatInstance,
    status,
  ]);

  return (
    <Flex className={styles.arChat} flex={1}>
      <Flex flex={1} className={styles.container}>
        <Flex flex={2} vertical>
          <RealtimeChatContext.Provider value={chatInstance}>
            <Flex
              className={styles.header}
              justify="space-between"
              align="center"
            >
              <Flex align="baseline" gap={8}>
                <div className={styles.title}>Realtime</div>
                <Typography.Text
                  ellipsis
                  type="secondary"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    copy(sessionID);
                    message.success('复制成功');
                  }}
                >
                  {sessionID}
                </Typography.Text>
              </Flex>
              <Flex>
                <Button
                  shape="round"
                  type="text"
                  size="small"
                  icon={<ShareAltOutlined />}
                  onClick={() => {
                    message.success('复制成功');
                    copy(
                      `${window.location.origin}${window.location.pathname}?realtimeServer=${wsURL}`,
                    );
                  }}
                >
                  分享
                </Button>
                <Button
                  icon={<CodeOutlined />}
                  shape="round"
                  type="text"
                  size="small"
                  onClick={() => {
                    setShowHistory(!showHistory);
                  }}
                >
                  {showHistory ? '日志模式' : '气泡模式'}
                </Button>
              </Flex>
            </Flex>
            <Flex
              flex={1}
              gap={8}
              align="center"
              vertical
              className={styles.chatPanel}
            >
              <Flex flex={1} className={styles.chatListContainer}>
                {showHistory ? (
                  <ChatLog historyList={historyList} />
                ) : (
                  <BubbleList data={messageList} />
                )}
              </Flex>
              <Flex justify="center" className={styles.controlPanel}>
                <Flex align="center" gap={4} className={styles.controls}>
                  {active ? (
                    <Button
                      icon={<CloseCircleOutlined />}
                      type="primary"
                      onClick={close}
                      danger
                    >
                      断开连接
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      loading={loading}
                      icon={<PlusCircleOutlined />}
                      onClick={async () => {
                        setMessageList([]);
                        setLoading(true);
                        init();
                        try {
                          await start();
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      开始通话
                    </Button>
                  )}

                  <audio controls={false} ref={audioElement} />
                  <Flex flex="0 0 128px">
                    <ScrollingWaveForm
                      recording={active}
                      speeching={speeching}
                    />
                  </Flex>
                  <Select
                    popupMatchSelectWidth={false}
                    value={inputMode}
                    onChange={value => {
                      setInputMode(value);
                      chatInstance.current?.setInputMode(value);
                    }}
                    disabled={speeching}
                    className={classNames([styles.mic])}
                    options={inputModeOptions}
                  />
                  {userInput}
                </Flex>
              </Flex>
            </Flex>
          </RealtimeChatContext.Provider>
        </Flex>
        <Flex vertical flex={1} gap={8} className={styles.config}>
          <Segmented
            defaultValue={chatMode}
            block
            options={[
              { label: '音频', value: 'audio' },
              { label: '视频', value: 'video_passive' },
            ]}
            onChange={value => {
              // 音频切视频，对话上下文继承
              // 视频切音频，对话上下文丢弃
              setChatMode(value as ChatMode);
              chatInstance.current?.setChatMode(value as ChatMode);
              // 因为setChatMode会主动updateSessionConfig,所以这里相当于把新配置也提交了
              setFormChanged(false);
            }}
          />
          <Flex hidden={chatMode === 'audio'} className={styles.videoPanel}>
            <video muted autoPlay ref={videoElement} height={600} width={480} />
            <Flex className={styles.videoMask} gap={8} align="flex-end">
              <Button
                ghost
                icon={
                  videoDevice === 'camera' ? (
                    <CameraOutlined />
                  ) : (
                    <DesktopOutlined />
                  )
                }
                onClick={() => {
                  setVideoDevice(
                    videoDevice === 'camera' ? 'screen' : 'camera',
                  );
                  chatInstance.current?.userStream.setVideoDevice(
                    videoDevice === 'camera' ? 'screen' : 'camera',
                  );
                }}
              />
            </Flex>
          </Flex>
          <Form
            labelAlign="left"
            initialValues={initValues}
            form={form}
            layout="vertical"
            className={styles.forms}
            onValuesChange={(_, values) => {
              if (active) {
                setFormChanged(true);
                chatInstance.current
                  ?.setTTSFormat(values.audioFormat)
                  .setInstructions(values.instructions)
                  .setTTSVoice(values.voice)
                  .setToolsConfig(values.tools)
                  .setTTSVoiceSource(values.tts_source);
              }
            }}
          >
            <Form.Item label="调试地址：" name="wsURL">
              <Input allowClear />
            </Form.Item>
            {chatMode === 'audio' ? (
              <Form.Item label="系统提示词：" name="instructions">
                <Input.TextArea allowClear rows={3} />
              </Form.Item>
            ) : null}
            <Form.Item label="音频格式：" name="audioFormat">
              <Select
                options={[
                  { label: 'pcm', value: 'pcm' },
                  { label: 'mp3', value: 'mp3' },
                ]}
              />
            </Form.Item>
            <Form.Item label="TTS 来源：" name="tts_source">
              <Select
                options={[
                  { label: '智谱', value: 'zhipu' },
                  { label: '火山', value: 'huoshan' },
                  { label: 'e2e', value: 'e2e' },
                ]}
              />
            </Form.Item>
            <Form.Item label="音色：" name="voice">
              <Select options={[{ label: '默认', value: 'default' }]} />
            </Form.Item>
            <Form.Item
              hidden={chatMode === 'video_passive'}
              label="Tools："
              name="tools"
            >
              <Editor
                className={styles.jsonEditor}
                height={300}
                defaultLanguage="json"
                options={{
                  placeholder: '[...tools]',
                  lineDecorationsWidth: 0,
                  tabSize: 2,
                  formatOnPaste: true,
                  minimap: { enabled: false },
                }}
              />
            </Form.Item>
          </Form>
          <Flex className={styles.updateConfig}>
            <Button
              block
              disabled={!formChanged}
              icon={<SyncOutlined />}
              onClick={() => {
                updateSessionConfig();
                setFormChanged(false);
              }}
            >
              更新配置
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default RealtimeVideo;
