import classNames from 'classnames';
import styles from './SpeechIndicator.module.less';
import { FC } from 'react';

const SpeechIndicator: FC<{ speeching: boolean }> = ({ speeching }) => {
  return (
    <div className={styles.indicator}>
      <div
        className={classNames(styles.dots, {
          [styles.speeching]: speeching,
        })}
      >
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
    </div>
  );
};

export default SpeechIndicator;
