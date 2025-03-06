import { useCallback, useEffect, useRef, FC } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record';
import styles from './ScrollingWaveForm.module.less';
import classNames from 'classnames';
interface ScrollingWaveFormProps {
  recording: boolean;
  speeching: boolean;
}

const ScrollingWaveForm: FC<ScrollingWaveFormProps> = ({
  recording,
  speeching = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const recordPluginRef = useRef<RecordPlugin | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 初始化 WaveSurfer
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      height: 32,
      waveColor: '#9a9a9a',
      progressColor: '#646464',
      barWidth: 1,
      barGap: 1,
      barRadius: 1,
      autoScroll: true,
      interact: false,
      hideScrollbar: true,
      normalize: false,
    });

    // 初始化录音插件
    const recordPlugin = wavesurfer.registerPlugin(
      RecordPlugin.create({
        scrollingWaveform: true,
        renderRecordedAudio: false,
      }),
    );

    wavesurferRef.current = wavesurfer;
    recordPluginRef.current = recordPlugin;

    return () => {
      wavesurfer.destroy();
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      await recordPluginRef.current?.startRecording();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    recordPluginRef.current?.stopRecording();
  }, []);

  useEffect(() => {
    if (recording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [recording, startRecording, stopRecording]);

  useEffect(() => {
    if (speeching) {
      console.log('speeching');
      wavesurferRef.current?.setOptions({
        waveColor: '#2454ff',
      });
    } else {
      wavesurferRef.current?.setOptions({
        waveColor: '#9a9a9a',
      });
    }
  }, [speeching]);

  return (
    <div className={classNames([styles.wave, speeching && styles.speeching])}>
      <div ref={containerRef} />
    </div>
  );
};

export default ScrollingWaveForm;
