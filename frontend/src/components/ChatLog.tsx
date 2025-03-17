import { FC, memo, ReactNode, useEffect, useMemo, useRef } from 'react';
import { Flex, Collapse, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

import {
  InputAudioBufferAppend,
  InputAudioBufferAppendVideoFrame,
  RealtimeClientEvent,
  RealtimeHistoryItem,
  RealtimeServerEvent,
  ResponseAudioDelta,
} from '@/types/realtime';
import styles from './ChatLog.module.less';
import RealtimeChat from '@/utils/chatSDK/realtimeChat';

type Props = {
  historyList: RealtimeChat['history'];
};

type LabelProps = {
  item: RealtimeHistoryItem;
};

const Label: FC<LabelProps> = memo(({ item }) => {
  const extra = useMemo(() => {
    let extra: ReactNode = '';
    const data = item.data;
    if ((data as ResponseAudioDelta).delta) {
      extra = (
        <Tag color="green" bordered={false}>
          {(data as ResponseAudioDelta).delta?.split(',').length}
        </Tag>
      );
    } else if ((data as InputAudioBufferAppend).audio) {
      extra = (
        <Tag color="green" bordered={false}>
          {(data as InputAudioBufferAppend).audio?.split(',').length}
        </Tag>
      );
    } else if ((data as InputAudioBufferAppendVideoFrame).video_frame) {
      extra = (
        <Tag color="green" bordered={false}>
          {
            (data as InputAudioBufferAppendVideoFrame).video_frame?.split(',')
              .length
          }
        </Tag>
      );
    } else if (
      data.type === RealtimeServerEvent.ResponseFunctionCallArgumentsDone
    ) {
      extra = (
        <Tag color="processing" bordered={false}>
          工具调用：{data.name}
        </Tag>
      );
    } else if (data.type === RealtimeClientEvent.ConversationItemCreate) {
      extra = (
        <Tag color="processing" bordered={false}>
          上报FC调用结果
        </Tag>
      );
    } else if (data.type === RealtimeServerEvent.SessionUpdated) {
      extra = (
        <Tag color="warning" bordered={false}>
          会话配置更新
        </Tag>
      );
    } else if (data.type === RealtimeClientEvent.ResponseCancel) {
      extra = (
        <Tag color="red" bordered={false}>
          打断
        </Tag>
      );
    } else if (data.type === RealtimeServerEvent.InputAudioBufferCommitted) {
      extra = <Tag>{data.item_id}</Tag>;
    } else if (data.type === RealtimeServerEvent.SessionCreated) {
      extra = <Tag>{data.session.id}</Tag>;
    } else if (data.type === RealtimeServerEvent.ResponseCreated) {
      extra = <Tag>{data.response.id}</Tag>;
    } else if (data.type === RealtimeServerEvent.ResponseDone) {
      extra = (
        <>
          <Tag color="purple" bordered={false}>
            input: {data.response.usage?.input_tokens ?? '--'}
          </Tag>
          <Tag color="purple" bordered={false}>
            output: {data.response.usage?.output_tokens ?? '--'}
          </Tag>
        </>
      );
    } else if (
      data.type ===
      RealtimeServerEvent.ConversationItemInputAudioTranscriptionCompleted
    ) {
      extra = (
        <Tag color="purple" bordered={false}>
          ASR
        </Tag>
      );
    }
    return extra;
  }, [item]);

  return (
    <Flex justify="space-between" align="center">
      <div>
        {item.role === 'user' ? (
          <ArrowUpOutlined className={styles.client} />
        ) : (
          <ArrowDownOutlined className={styles.server} />
        )}{' '}
        <span className={styles.eventName}>{item.data.type}</span>
      </div>
      <div>
        <span>{extra}</span>
      </div>
    </Flex>
  );
});

const ChatLog: FC<Props> = memo(({ historyList = [] }) => {
  const historyListContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      historyListContainer.current &&
      historyList.at(-1)?.data.type !==
      RealtimeClientEvent.InputAudioBufferAppendVideoFrame &&
      historyList.at(-1)?.data.type !==
      RealtimeClientEvent.InputAudioBufferAppend
    ) {
      (historyListContainer.current as unknown as HTMLDivElement)?.scrollTo({
        top: (historyListContainer.current as unknown as HTMLDivElement)
          .scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [historyList]);

  return (
    <Flex flex={1} vertical>
      <Collapse
        destroyInactivePanel
        ref={historyListContainer}
        className={styles.history}
        expandIcon={() => null}
        bordered={false}
        items={historyList.map(item => {
          return {
            key: item.data.event_id,
            label: <Label item={item} />,
            children: <pre>{JSON.stringify(item.data, null, 2)}</pre>,
          };
        })}
      />
    </Flex>
  );
});

export default ChatLog;
