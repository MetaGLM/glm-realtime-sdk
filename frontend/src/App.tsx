import React from 'react';
import { ConfigProvider } from 'antd';
import RealtimeVideo from '@/pages/RealtimeVideo';

const App: React.FC = () => {
  return (
    <ConfigProvider theme={{ cssVar: true }}>
      <RealtimeVideo />
    </ConfigProvider>
  );
};

export default App;
