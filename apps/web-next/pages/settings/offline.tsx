import { useEffect, useState } from 'react';
import styles from './offline.module.css';
import { listLessonCaches, clearLessonCache, clearAllLessonCaches } from '../../utils/offline';
import { flushQueue } from '../../utils/sync';
import { Button, Card, Badge } from '../../components/ui';

type CacheEntry = { id: string; keys: string[] };
type Est = { quota?: number; usage?: number };

const formatBytes = (value?: number) => {
  if (value === undefined) return '—';
  const kb = value / 1024;
  const mb = kb / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
};

export default function OfflineSettingsPage() {
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [estimate, setEstimate] = useState<Est>({});
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      setEntries(await listLessonCaches());
    } catch {
      setEntries([]);
    }
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const e = await (navigator.storage as any).estimate();
        setEstimate({ quota: e.quota, usage: e.usage });
      }
    } catch {}
  };

  useEffect(() => {
    load();
  }, []);

  const ratio = estimate.usage && estimate.quota ? Math.min(1, estimate.usage / estimate.quota) : 0;

  const handleFlush = async () => {
    await flushQueue();
    setMessage('已尝试回传离线记录');
    setTimeout(() => setMessage(''), 2500);
  };

  const handleClearAll = async () => {
    const count = await clearAllLessonCaches();
    await load();
    setMessage(`已清空 ${count} 个课程缓存`);
    setTimeout(() => setMessage(''), 2500);
  };

  const cachedCount = entries.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button variant="ghost" size="sm" as="a" href="/account">
          返回我的
        </Button>
        <h1 className={styles.title}>离线缓存管理</h1>
        <Badge variant="muted">Beta</Badge>
      </header>

      {message && <Card className={styles.notice}>{message}</Card>}

      <Card className={styles.usageCard}>
        <div className={styles.usageMeta}>
          <span>已缓存课程：{cachedCount} 门</span>
          <span>占用：{formatBytes(estimate.usage)}</span>
          <span>配额：{formatBytes(estimate.quota)}</span>
        </div>
        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={handleFlush}>
            回传离线记录
          </Button>
          {cachedCount > 0 && (
            <Button size="sm" onClick={handleClearAll}>
              清空所有缓存
            </Button>
          )}
        </div>
      </Card>

      {cachedCount === 0 ? (
        <Card className={styles.notice}>暂无离线课程，前往课程页点击“缓存用于离线”试试。</Card>
      ) : (
        <section className={styles.list}>
          {entries.map((entry) => (
            <Card key={entry.id} className={styles.lessonCard}>
              <div className={styles.lessonHeader}>
                <div>
                  <h3 className={styles.lessonTitle}>课程 #{entry.id}</h3>
                  <p className={styles.subtitle}>资源 {entry.keys.length} 条</p>
                </div>
                <Button variant="ghost" size="sm" onClick={async () => { await clearLessonCache(entry.id); await load(); }}>
                  清除此课
                </Button>
              </div>
              <div className={styles.actions}>
                <Button as="a" href={`/lesson/${entry.id}`} size="sm">
                  打开课程
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
