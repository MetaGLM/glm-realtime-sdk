import { FC, useEffect, useMemo, useState } from 'react';
import { Button, Divider, Flex, Spin, Tag } from 'antd';
import { Bubble, BubbleProps } from '@ant-design/x';
import { RolesType } from '@ant-design/x/es/bubble/BubbleList';
import {
  DownloadOutlined,
  FileImageOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import WaveSurfer from 'wavesurfer.js';

import { ModalButton } from '@/components/index.ts';
import ImageList from '@/components/ImageList.tsx';
import WavePlayer from '@/components/WavePlayer.tsx';
import { downloadBlobURL } from '@/utils/download.ts';
import { ResponseMessageData } from '@/types/realtime.ts';
import styles from './BubbleList.module.less';

type Props = {
  data: ResponseMessageData[];
};

const roles: RolesType = {
  ai: {
    placement: 'start',
    typing: { step: 5, interval: 20 },
    shape: 'corner',
    styles: {
      content: {
        maxWidth: '70%',
        minWidth: '40%',
        background: 'rgba(245, 245, 245, 0.9)',
      },
    },
  },
  user: {
    placement: 'end',
    shape: 'corner',
    styles: {
      content: {
        maxWidth: '70%',
        minWidth: '40%',
        background: '#D1E3FF',
      },
    },
  },
};

const BubbleList: FC<Props> = ({ data }) => {
  const [playerMap, setPlayerMap] = useState<Record<string, WaveSurfer>>({});

  useEffect(() => {
    if (!data.length) {
      setPlayerMap({});
    }
  }, [data]);

  const items = useMemo<BubbleProps[]>(() => {
    return data.map(item => {
      return {
        role: item.type === 'asr' ? 'user' : 'ai',
        content: item.textContent,
        // loading: item.textContent.length === 0,
        messageRender: content => (
          <Flex vertical gap={4} align="flex-start">
            {item.audioURL ? (
              <>
                <div className={styles.wave}>
                  <WavePlayer
                    url={item.audioURL}
                    onReady={player => {
                      setPlayerMap(map => {
                        return { ...map, [item.id]: player };
                      });
                    }}
                  />
                </div>
                <Divider className={styles.divider} />
              </>
            ) : null}
            {content ? (
              <div>{content}</div>
            ) : (
              <Spin indicator={<LoadingOutlined spin />} />
            )}
          </Flex>
        ),
        footer: (
          <Flex align="center" gap={8}>
            {item.type === 'asr' ? (
              <Tag color="purple" bordered={false}>
                <span>
                  text{' '}
                  {item.textDelay ? item.textDelay : <LoadingOutlined spin />}{' '}
                  ms
                </span>
              </Tag>
            ) : null}
            {item.type === 'tts' ? (
              <>
                <Tag color="purple" bordered={false}>
                  <span>
                    text{' '}
                    {item.textDelay ? item.textDelay : <LoadingOutlined spin />}{' '}
                    ms
                  </span>
                </Tag>
                <Tag color="blue" bordered={false}>
                  audio{' '}
                  {item.audioDelay ? item.audioDelay : <LoadingOutlined spin />}{' '}
                  ms
                </Tag>
              </>
            ) : null}
            {item.audioURL ? (
              <Button
                shape="circle"
                type="text"
                icon={<PlayCircleOutlined />}
                onClick={() => {
                  playerMap[item.id]?.playPause();
                }}
                size="small"
              />
            ) : null}
            {item.imgList?.length ? (
              <ModalButton
                shape="round"
                type="text"
                buttonText={`${item.imgList?.length} pics`}
                icon={<FileImageOutlined />}
                size="small"
                render={() => <ImageList imgURLs={item.imgList ?? []} />}
                modalProps={{
                  title: '截图列表',
                  width: '768px',
                  style: { top: '16px' },
                  closable: true,
                  footer: null,
                }}
              />
            ) : null}
            {item.audioURL ? (
              <>
                <Button
                  type="text"
                  shape="circle"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => {
                    downloadBlobURL(
                      item.audioURL!,
                      `${item.id}.${item.audioFormat}`,
                    );
                  }}
                />
              </>
            ) : null}
          </Flex>
        ),
      };
    });
  }, [data, playerMap]);

  return (
    <Bubble.List
      autoScroll
      roles={roles}
      items={items}
      className={styles.bubbleList}
    />
  );
};

export default BubbleList;
