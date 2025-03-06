import { FC, memo, ReactNode, useEffect, useMemo, useRef } from 'react';
import { Flex, Collapse, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

import {
  InputAudioBufferAppend,
  InputAudioBufferAppendVideoFrame,
  RealtimeClientEvent,
  RealtimeClientEventStruct,
  RealtimeEventStruct,
  RealtimeServerEvent,
  ResponseAudioDelta,
} from '@/types/realtime';
import styles from './ChatLog.module.less';
import RealtimeChat from '@/utils/chatSDK/realtimeChat';

type Props = {
  historyList: RealtimeChat['history'];
};

type LabelProps = {
  item: RealtimeEventStruct;
};

const Label: FC<LabelProps> = memo(({ item }) => {
  const extra = useMemo(() => {
    let extra: ReactNode = '';
    if ((item as ResponseAudioDelta).delta) {
      extra = (
        <Tag color="green" bordered={false}>
          {(item as ResponseAudioDelta).delta?.split(',').length}
        </Tag>
      );
    } else if ((item as InputAudioBufferAppend).audio) {
      extra = (
        <Tag color="green" bordered={false}>
          {(item as InputAudioBufferAppend).audio?.split(',').length}
        </Tag>
      );
    } else if ((item as InputAudioBufferAppendVideoFrame).video_frame) {
      extra = (
        <Tag color="green" bordered={false}>
          {
            (item as InputAudioBufferAppendVideoFrame).video_frame?.split(',')
              .length
          }
        </Tag>
      );
    } else if (
      item.type === RealtimeServerEvent.ResponseFunctionCallArgumentsDone
    ) {
      extra = (
        <Tag color="processing" bordered={false}>
          工具调用：{item.name}
        </Tag>
      );
    } else if (item.type === RealtimeClientEvent.ConversationItemCreate) {
      extra = (
        <Tag color="processing" bordered={false}>
          上报FC调用结果
        </Tag>
      );
    } else if (item.type === RealtimeServerEvent.SessionUpdated) {
      extra = (
        <Tag color="warning" bordered={false}>
          会话配置更新
        </Tag>
      );
    } else if (item.type === RealtimeClientEvent.ResponseCancel) {
      extra = (
        <Tag color="red" bordered={false}>
          打断
        </Tag>
      );
    } else if (item.type === RealtimeServerEvent.InputAudioBufferCommitted) {
      extra = <Tag>{item.item_id}</Tag>;
    } else if (item.type === RealtimeServerEvent.SessionCreated) {
      extra = <Tag>{item.session.id}</Tag>;
    } else if (item.type === RealtimeServerEvent.ResponseCreated) {
      extra = <Tag>{item.response.id}</Tag>;
    } else if (item.type === RealtimeServerEvent.ResponseDone) {
      extra = (
        <>
          <Tag color="purple" bordered={false}>
            input: {item.response.usage?.input_tokens ?? '--'}
          </Tag>
          <Tag color="purple" bordered={false}>
            output: {item.response.usage?.output_tokens ?? '--'}
          </Tag>
        </>
      );
    } else if (
      item.type ===
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
        {(item as RealtimeClientEventStruct).client_timestamp ? (
          <ArrowUpOutlined className={styles.client} />
        ) : (
          <ArrowDownOutlined className={styles.server} />
        )}{' '}
        <span className={styles.eventName}>{item.type}</span>
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
      historyList.length &&
      historyList[historyList.length - 1].type !==
        RealtimeClientEvent.InputAudioBufferAppendVideoFrame &&
      historyList[historyList.length - 1].type !==
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
            key: item.event_id,
            label: <Label item={item} />,
            children: <pre>{JSON.stringify(item, null, 2)}</pre>,
          };
        })}
      />
    </Flex>
  );
});

export default ChatLog;
