import { FC, useRef, useState } from 'react';
import { Button, Drawer, Form, Input, message, Select } from 'antd';
import { Editor } from '@monaco-editor/react';
import {
  AudioFilled,
  InteractionFilled,
  MessageFilled,
  PhoneFilled,
  SettingFilled,
  VideoCameraFilled,
} from '@ant-design/icons';
import classNames from 'classnames';

import RealtimeChat from '@/utils/chatSDK/realtimeChat';
import { ChatMode, ResponseMessageData } from '@/types/realtime';
import BubbleList from '@/components/BubbleList';
import useRealtimeChat from '@/hooks/useRealtimeChat';
import SpeechIndicator from './SpeechIndicator';
import styles from './index.module.less';

const initValues = {
  tools: '',
  wsURL:
    new URLSearchParams(window.location.search).get('realtimeServer') ||
    'wss://open.bigmodel.cn/api/paas/v4/realtime?Authorization=your_api_key', // 输入你的默认地址
  audioFormat: 'pcm' as const,
  voice: 'default',
  tts_source: 'e2e',
  inputAudioFormat: 'wav',
  instructions: '',
  inputMode: 'localVAD' as RealtimeChat['inputMode'],
};

const { useForm } = Form;

const MobileUI: FC = () => {
  const videoElement = useRef<HTMLVideoElement>(null);
  const subTitleRef = useRef<HTMLDivElement>(null);
  const autoScrollTimer = useRef<number>(0);

  const [open, setOpen] = useState(false);
  const [formValues, setFormValues] = useState(initValues);
  const [chatMode, setChatMode] = useState<ChatMode>('audio');
  const [flipShot, setFlipShot] = useState<'user' | 'environment'>(
    'environment',
  );
  const [messageList, setMessageList] = useState<ResponseMessageData[]>([]);

  const {
    start,
    close,
    init,
    active,
    speeching,
    vadOpen,
    chatInstance,
  } = useRealtimeChat({
    wsURL: formValues.wsURL,
    videoElement,
    chatMode,
    inputMode: formValues.inputMode,
    userStream: {
      videoDevice: 'camera',
      facingMode: flipShot,
    },
    onLog: (type, data) => {
      message[type](data);
    },
    onMessage: (_, data) => {
      setMessageList(data);
      if (!autoScrollTimer.current) {
        autoScrollTimer.current = window.setInterval(() => {
          if (subTitleRef.current) {
            // 每次向下滚动1像素
            subTitleRef.current.scrollTop += 1;

            // 如果已经滚动到底部，清除定时器
            if (
              subTitleRef.current.scrollHeight -
                subTitleRef.current.scrollTop <=
              subTitleRef.current.clientHeight
            ) {
              window.clearInterval(autoScrollTimer.current);
              autoScrollTimer.current = 0;
            }
          }
        }, 50); // 每50ms执行一次，实现平滑滚动效果
      }
    },
    sessionConfig: {
      tools: formValues.tools,
      instructions: formValues.instructions,
    },
    ttsFormat: formValues.audioFormat,
  });

  const [showDrawer, setShowDrawer] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [form] = useForm();

  return (
    <div className={styles.container}>
      <div className={styles.topContainer}>
        <video
          className={styles.backgroundVideo}
          autoPlay
          muted
          playsInline
          ref={videoElement}
          onClick={() => {
            chatInstance.current?.streamPlayer.pause();
          }}
        />
        <div className={styles.subTitleContainer} ref={subTitleRef}>
          <div className={styles.subTitle}>
            {messageList.at(-1)?.textContent || '...'}
          </div>
        </div>
        <div className={styles.sideAcionsContainer}>
          <div className={styles.left}>
            <Button type="text">
              <SpeechIndicator speeching={speeching} />
            </Button>
          </div>
          <div className={styles.right}>
            <Button
              className={styles.actions}
              shape="circle"
              type="text"
              icon={<InteractionFilled className={styles.icons} />}
              onClick={() => {
                setFlipShot(prev =>
                  prev === 'environment' ? 'user' : 'environment',
                );
                if (!active) return;
                chatInstance.current?.userStream.setFacingMode(
                  flipShot === 'user' ? 'environment' : 'user',
                );
              }}
            />
            <Button
              className={styles.actions}
              shape="circle"
              type="text"
              icon={<MessageFilled className={styles.icons} />}
              onClick={() => {
                setShowLog(true);
              }}
            />
          </div>
        </div>
      </div>
      <div className={styles.bottomContainer}>
        <div className={styles.bottomControls}>
          <Button
            className={classNames({
              [styles.buttons]: true,
              [styles.call]: true,
              [styles.hangUp]: open,
            })}
            shape="circle"
            icon={<PhoneFilled className={styles.buttonIcons} />}
            onClick={() => {
              setOpen(false);
              if (open) {
                close();
              } else {
                init();
                start().then(() => {
                  setOpen(true);
                });
              }
            }}
          />
          <Button
            className={classNames({
              [styles.buttons]: true,
              [styles.video]: chatMode !== 'audio',
            })}
            shape="circle"
            icon={<VideoCameraFilled className={styles.buttonIcons} />}
            onClick={() => {
              setChatMode(prev =>
                prev === 'audio' ? 'video_passive' : 'audio',
              );
            }}
          />
          <Button
            className={styles.buttons}
            shape="circle"
            icon={<SettingFilled className={styles.buttonIcons} />}
            onClick={() => {
              setShowDrawer(true);
            }}
          />
          <Button
            className={classNames({
              [styles.buttons]: true,
              [styles.speeching]: speeching || vadOpen,
            })}
            shape="circle"
            icon={<AudioFilled className={styles.buttonIcons} />}
            onClick={() => {
              if (!active) return;
              switch (formValues.inputMode) {
                case 'localVAD':
                  vadOpen
                    ? chatInstance.current?.vad.pause()
                    : chatInstance.current?.vad.start();
                  break;
                case 'manual':
                  speeching
                    ? chatInstance.current?.releaseManualTalk()
                    : chatInstance.current?.manualTalk();
                  break;
                default:
                  break;
              }
            }}
          />
        </div>
      </div>
      <Drawer
        destroyOnClose={false}
        maskClosable
        open={showDrawer}
        onClose={() => {
          setShowDrawer(false);
        }}
        placement="bottom"
        height="80%"
        styles={{
          header: { display: 'none' },
          content: {
            background: 'rgb(255,255,255, 0.8)',
          },
          body: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px 16px 16px 16px',
          },
        }}
      >
        <Form
          form={form}
          initialValues={formValues}
          onValuesChange={(changedValue, values) => {
            setFormValues(values);
            if (changedValue.inputMode) {
              chatInstance.current?.setInputMode(values.inputMode);
            }
          }}
        >
          <Form.Item label="调试地址" name="wsURL">
            <Input />
          </Form.Item>
          <Form.Item label="输入方式" name="inputMode">
            <Select
              options={[
                { label: '本地VAD', value: 'localVAD' },
                { label: '远程VAD', value: 'serverVAD' },
                { label: '长按输入', value: 'manual' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label={
              <div>
                <span>系统提示词 </span>
              </div>
            }
            name="instructions"
          >
            <Input.TextArea
              allowClear
              rows={3}
              placeholder="格式参考物料文档"
            />
          </Form.Item>
          <Form.Item label="音频格式" name="audioFormat">
            <Select
              options={[
                { label: 'pcm', value: 'pcm' },
                { label: 'mp3', value: 'mp3' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label={
              <div>
                <span>Tools </span>
              </div>
            }
            name="tools"
          >
            <Editor
              className={styles.jsonEditor}
              height={300}
              defaultLanguage="json"
              options={{
                placeholder: '格式参考物料文档',
                lineDecorationsWidth: 0,
                tabSize: 2,
                formatOnPaste: true,
                trimAutoWhitespace: true,
                minimap: { enabled: false },
              }}
            />
          </Form.Item>
        </Form>
      </Drawer>
      <Drawer
        destroyOnClose={false}
        maskClosable
        open={showLog}
        onClose={() => {
          setShowLog(false);
        }}
        placement="bottom"
        height="80%"
        className={styles.setting}
        styles={{
          header: { display: 'none' },
          content: {
            background: 'rgb(255,255,255, 0.8)',
          },
          body: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px 16px 16px 16px',
          },
        }}
      >
        <BubbleList data={messageList} />
      </Drawer>
    </div>
  );
};

export default MobileUI;
