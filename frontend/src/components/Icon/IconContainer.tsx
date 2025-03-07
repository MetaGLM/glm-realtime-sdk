import styles from './IconContainer.module.less';
import React from 'react';

type Props = {
  icon: string;
  style?: React.CSSProperties;
}

const IconContainer = ({ icon, style }: Props) => {
  return <img src={icon} alt="icon" className={styles.iconContainer} style={style} />;
};

export default IconContainer;
