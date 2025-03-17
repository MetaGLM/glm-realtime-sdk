import React from 'react';
import { ConfigProvider } from 'antd';
import { isMobile } from 'react-device-detect'

import RealtimeVideo from '@/pages/RealtimeVideo';
import MobileUI from '@/pages/MobileUI';

const App: React.FC = () => {
  return (
    <ConfigProvider theme={{ cssVar: true }}>
      {
        isMobile ? <MobileUI /> : <RealtimeVideo />
      }
    </ConfigProvider>
  );
};

export default App;
