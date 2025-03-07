import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import WaveSurfer from 'wavesurfer.js';
import styles from './WavePlayer.module.less';
import WavesurferPlayer from '@wavesurfer/react';
import Timeline from 'wavesurfer.js/dist/plugins/timeline.esm.js';

type Props = {
  url: string;
  height?: number;
  onPlaying?: (playing: boolean) => void;
  onReady?: (player: WaveSurfer) => void;
};

const WavePlayer: React.ForwardRefRenderFunction<
  WaveSurfer | undefined,
  Props
> = ({ url, onPlaying, height = 28, onReady }, ref) => {
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer>();
  const [, setPlaying] = useState(false);

  const handleReady = (ws: WaveSurfer) => {
    setWavesurfer(ws);
    setPlaying(false);
    onReady?.(ws);
    onPlaying?.(false);
  };

  const onPlayPause = () => {
    wavesurfer?.playPause();
  };

  const playerPlugins = useMemo(
    () => [
      Timeline.create({
        primaryLabelSpacing: 2,
        timeInterval: 0.5,
      }),
    ],
    [],
  );

  useImperativeHandle(ref, () => wavesurfer, [wavesurfer]);

  return (
    <div className={styles.wave}>
      <WavesurferPlayer
        height={height}
        waveColor="rgb(134, 134, 134)"
        url={url}
        onReady={handleReady}
        onClick={onPlayPause}
        onPlay={() => {
          setPlaying(true);
          onPlaying?.(true);
        }}
        onPause={() => {
          setPlaying(false);
          onPlaying?.(false);
        }}
        plugins={playerPlugins}
      />
    </div>
  );
};

const WavePlayerWithRef = forwardRef(WavePlayer);

export default WavePlayerWithRef;
