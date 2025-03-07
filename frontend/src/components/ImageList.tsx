import React, { useState } from 'react';
import { Button, Empty, Flex, Image } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import styles from './ImageList.module.less';
import classNames from 'classnames';

type Props = {
  imgURLs: string[];
};

const ImageList: React.FC<Props> = ({ imgURLs }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrevious = () => {
    setCurrentIndex(prevIndex =>
      prevIndex === 0 ? imgURLs.length - 1 : prevIndex - 1,
    );
  };

  const handleNext = () => {
    setCurrentIndex(prevIndex =>
      prevIndex === imgURLs.length - 1 ? 0 : prevIndex + 1,
    );
  };

  if (!imgURLs.length) return <Empty />;

  return (
    <Flex gap={8} vertical align="center" className={styles.galleryContainer}>
      <Flex
        align="center"
        justify="center"
        className={styles.mainImageContainer}
      >
        <Button
          shape="circle"
          onClick={handlePrevious}
          className={styles.navButton}
          icon={<LeftOutlined />}
        />
        <Image
          src={imgURLs[currentIndex]}
          alt="Displayed"
          className={styles.mainImage}
        />
        <Button
          shape="circle"
          onClick={handleNext}
          className={styles.navButton}
          icon={<RightOutlined />}
        />
      </Flex>
      <Flex>
        <div>
          {currentIndex + 1} / {imgURLs.length}
        </div>
      </Flex>
      <div className={styles.thumbnailContainer}>
        {imgURLs.map((url, index) => (
          <img
            key={url}
            src={url}
            alt={`Thumbnail ${index}`}
            className={classNames([
              styles.thumbnail,
              { [styles.active]: currentIndex === index },
            ])}
            onClick={() => setCurrentIndex(index)}
          />
        ))}
      </div>
    </Flex>
  );
};

export default ImageList;
