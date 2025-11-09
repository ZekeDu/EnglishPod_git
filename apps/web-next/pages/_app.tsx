import type { AppProps } from 'next/app';
import '../styles/tokens.css';
import '../styles/global.css';
import { useEffect } from 'react';
import { flushQueue, initOfflineSync } from '../utils/sync';
import { BottomNav, Button } from '../components/ui';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // 注册 Service Worker（PWA）
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    }
    // 初始化离线队列同步（进度/录音元数据）
    initOfflineSync();
    flushQueue();
  }, []);
  return (
    <div className="page">
      <div className="page-inner">
        <Component {...pageProps} />
      </div>
      <BottomNav />
    </div>
  );
}
