import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import styles from './review.module.css';
import { Button, Card, Badge } from '../components/ui';
import { TTSButton } from '../components/TTSButton';
import { track } from '../utils/track';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => {
  if (r.status === 401) {
    if (typeof window !== 'undefined') window.location.href = `/login?redirect=/review`;
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error('request_failed');
  return r.json();
});

type ReviewItem = {
  card: { id: string; phrase: string; meaning?: string; examples?: string[] };
  schedule: any;
};

type Stats = { total: number; mastered: number; learning: number; due?: number } | null;
type History = { date: string; count: number }[] | null;

export default function ReviewPage() {
  const [index, setIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const { data: itemsResp, mutate: refetchItems } = useSWR<{ code: number; data: { items: ReviewItem[] } }>(`${API}/reviews/today`, fetcher);
  const { data: statsResp } = useSWR<{ data: { total: number; mastered: number; learning: number; due: number } }>(`${API}/reviews/stats`, fetcher);
  const { data: historyResp } = useSWR<{ data: { days: { date: string; count: number }[] } }>(`${API}/reviews/history`, fetcher);

  const items = itemsResp?.data?.items || [];
  const cur = items[index];
  const stats: Stats = statsResp?.data
    ? {
      total: statsResp.data.total,
      mastered: statsResp.data.mastered,
      learning: statsResp.data.learning,
      due: statsResp.data.due,
    }
    : null;
  const history: History = historyResp?.data?.days || null;

  const progress = useMemo(() => {
    if (!history) return null;
    const last14 = history.slice(-14);
    const max = last14.reduce((m, d) => Math.max(m, d.count), 0) || 1;
    return last14.map((d) => ({ ...d, height: Math.max(4, Math.round((d.count / max) * 48)) }));
  }, [history]);

  useEffect(() => {
    setShowDetails(false);
  }, [cur?.card?.id]);

  const EyeOpenIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M1.5 12s3.5-7 10.5-7 10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );

  const EyeClosedIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 3l18 18M4.53 6.35C2.88 7.85 1.5 10 1.5 10s3.5 7 10.5 7c1.4 0 2.67-.22 3.8-.6M19.47 17.65C21.12 16.15 22.5 14 22.5 14s-3.5-7-10.5-7c-1.4 0-2.67.22-3.8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );

  const handleRate = async (rating: 0 | 1 | 2 | 3 | 4) => {
    const item = items[index];
    if (!item) return;
    const resp = await fetch(`${API}/reviews/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ card_id: item.card.id, rating }),
    });
    if (resp.status === 401) {
      window.location.href = `/login?redirect=/review`;
      return;
    }
    track('review_answer', { cardId: item.card.id, rating });
    setShowDetails(false);
    if (index + 1 < items.length) {
      setIndex((prev) => prev + 1);
    } else {
      track('review_finish');
      setIndex(0);
      await refetchItems();
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>今日复习</h1>
          <p className={styles.subtitle}>保持节奏，每天一点点进步</p>
        </div>
        <Link href="/" passHref legacyBehavior>
          <Button as="a" href="/" variant="ghost" size="sm">返回课程</Button>
        </Link>
      </header>

      {stats && (
        <section className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>总卡片</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>已掌握</span>
            <span className={styles.statValue}>{stats.mastered}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>复习中</span>
            <span className={styles.statValue}>{stats.learning}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>今日到期</span>
            <span className={styles.statValue}>{stats.due ?? '--'}</span>
          </div>
        </section>
      )}

      {cur ? (
        <Card className={styles.flashCard}>
          <div>
            <p className={styles.muted}>进度 {index + 1}/{items.length}</p>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${((index + 1) / Math.max(1, items.length)) * 100}%` }} />
            </div>
          </div>
          <div className={styles.phraseRow}>
            <h2 className={styles.phraseText}>{cur.card.phrase || '(未设置短语)'}</h2>
            <div className={styles.phraseActions}>
              {cur.card.phrase && <TTSButton text={cur.card.phrase} label="朗读" showLabel={false} iconOnly compact size={16} />}
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setShowDetails((prev) => !prev)}
                aria-label={showDetails ? '隐藏释义' : '显示释义'}
                aria-pressed={showDetails}
              >
                {showDetails ? EyeClosedIcon : EyeOpenIcon}
              </button>
            </div>
          </div>
          {showDetails && cur.card.meaning && <p className={styles.meaning}>{cur.card.meaning}</p>}
          {showDetails && cur.card.examples && cur.card.examples.length > 0 && (
            <div>
              <Badge variant="muted">例句</Badge>
              <ul className={styles.exampleList}>
                {cur.card.examples.map((ex, idx) => (
                  <li key={idx}>{ex}</li>
                ))}
              </ul>
            </div>
          )}
          <div className={styles.actions}>
            <Button onClick={() => handleRate(0)} variant="secondary">Again</Button>
            <Button onClick={() => handleRate(1)} variant="secondary">Hard</Button>
            <Button onClick={() => handleRate(3)} variant="primary">Good</Button>
            <Button onClick={() => handleRate(4)} variant="primary">Easy</Button>
          </div>
        </Card>
      ) : (
        <Card className={styles.empty}>
          <p>今日暂无待复习卡片，继续保持~</p>
          <Button as="a" href="/lesson" variant="ghost">浏览课程</Button>
        </Card>
      )}

      {progress && (
        <Card className={styles.historyCard}>
          <h3 className={styles.sectionHeading}>近两周复习情况</h3>
          <div className={styles.historyGrid}>
            {progress.map((d) => (
              <div
                key={d.date}
                className={styles.historyBar}
                style={{ height: d.height, background: d.count ? 'linear-gradient(180deg, #0ea5e9, #14b8a6)' : 'rgba(15,23,42,0.08)' }}
                title={`${d.date}: ${d.count}`}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
