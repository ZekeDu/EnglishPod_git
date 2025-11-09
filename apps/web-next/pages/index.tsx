import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './index.module.css';
import { Badge, Button, Card } from '../components/ui';
import { isLessonCached } from '../utils/offline';

type Lesson = {
  id: string;
  lessonNo: number;
  title: string;
  level: string;
  duration: number;
  tags: string[];
};

type PracticeSummary = {
  streak: number;
  week: { date: string; completed: boolean }[];
  lessons?: { total: number; completed: number; inProgress: number };
  reviews?: { total: number; due: number; learning: number; mastered: number; clearedToday?: boolean };
  recentLesson?: { id: string; lessonNo?: number | null; title?: string | null };
} | null;

type ReviewStats = { total: number; due: number } | null;
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function Home() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [cachedMap, setCachedMap] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<PracticeSummary>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats>(null);
  const [profileName, setProfileName] = useState<string>('学习者');

  useEffect(() => {
    fetch(`${API}/me`, { credentials: 'include', cache: 'no-store' as RequestCache })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => {
        const data = j?.data || j;
        if (data?.nickname) setProfileName(data.nickname);
        else if (data?.username) setProfileName(data.username);
      })
      .catch(() => setProfileName('学习者'));
  }, []);

  useEffect(() => {
    const loadLessons = async () => {
      try {
        const r = await fetch(`${API}/lessons`, { credentials: 'include', cache: 'no-store' as RequestCache });
        if (r.ok) {
          const j = await r.json();
          const list = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : [];
          setLessons(list);
          return;
        }
        const fallback = await fetch(`${API}/lessons`, { cache: 'no-store' as RequestCache });
        if (fallback.ok) {
          const j2 = await fallback.json();
          const list2 = Array.isArray(j2) ? j2 : Array.isArray(j2.data) ? j2.data : [];
          setLessons(list2);
          return;
        }
        setLessons([]);
      } catch {
        setLessons([]);
      }
    };
    loadLessons();
  }, []);

  useEffect(() => {
    fetch(`${API}/me/progress/summary`, { credentials: 'include', cache: 'no-store' as RequestCache })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => setSummary(j.data))
      .catch(() => setSummary(null));

    fetch(`${API}/reviews/stats`, { credentials: 'include', cache: 'no-store' as RequestCache })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => setReviewStats(j.data))
      .catch(() => setReviewStats(null));

  }, []);

  useEffect(() => {
    if (lessons.length === 0) return;
    (async () => {
      const map: Record<string, boolean> = {};
      for (const lesson of lessons.slice(0, 12)) {
        const audioUrl = `${API}/media/lesson/${lesson.id}/main`;
        try {
          map[lesson.id] = await isLessonCached(lesson.id, audioUrl);
        } catch {
          map[lesson.id] = false;
        }
      }
      setCachedMap(map);
    })();
  }, [lessons]);

  const primaryLesson = useMemo(() => {
    if (summary?.recentLesson?.id) {
      return {
        id: summary.recentLesson.id,
        lessonNo: summary.recentLesson.lessonNo ?? null,
        title: summary.recentLesson.title ?? '',
      };
    }
    const fallback = lessons[0];
    if (fallback) return { id: fallback.id, lessonNo: fallback.lessonNo, title: fallback.title };
    return null;
  }, [lessons, summary]);

  const continueHref = primaryLesson ? `/lesson/${primaryLesson.id}` : '/lesson/1';
  const continueDesc = primaryLesson
    ? primaryLesson.lessonNo
      ? `继续学习 Lesson ${primaryLesson.lessonNo}`
      : `继续学习 ${primaryLesson.title || primaryLesson.id}`
    : '挑选一节课程开始';
  const continueCta = primaryLesson ? '继续学习' : '去选课';

  const taskCards = useMemo(() => {
    return [
      {
        title: '今日课程',
        desc: continueDesc,
        href: continueHref,
        cta: continueCta,
      },
      {
        title: '复习任务',
        desc: reviewStats ? `到期 ${reviewStats.due} / 总计 ${reviewStats.total}` : '加载中…',
        href: '/review',
        cta: '开始复习',
      },
    ];
  }, [continueCta, continueDesc, continueHref, reviewStats]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.brand}>EnglishPod 365</p>
          <h1 className={styles.heading}>你好，{profileName}</h1>
        </div>
        <Link href="/account" className={styles.avatar} aria-label="查看我的账户">
          {profileName.slice(0, 1).toUpperCase()}
        </Link>
      </header>

      <section className={styles.banner}>
        <div className={styles.bannerContent}>
          <h2 className={styles.bannerTitle}>每日 20 分钟，练就地道表达</h2>
          <p className={styles.bannerSubtitle}>
            课程、练习、复习一站式搞定。现在就继续上一节课吧！
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button as="a" href={continueHref}>{continueCta}</Button>
            <Button as="a" href="/lesson" variant="ghost">浏览课程</Button>
          </div>
        </div>
        <div className={styles.bannerStats}>
          <span>连续学习：{summary ? `${summary.streak} 天` : '—'}</span>
          <span>待复习：{reviewStats ? reviewStats.due : '—'} 项</span>
          <span>已缓存课程：{Object.values(cachedMap).filter(Boolean).length}</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>今日任务</div>
        <div className={styles.horizontal}>
          {taskCards.map((card) => (
            <Card key={card.title} className={styles.sliderCard}>
              <div>
                <h3 className={styles.lessonTitle}>{card.title}</h3>
                <p style={{ margin: '6px 0 16px', color: 'var(--color-text-muted)', fontSize: 14 }}>{card.desc}</p>
              </div>
              <Button as="a" href={card.href} size="sm">{card.cta}</Button>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          推荐课程
          <Button as="a" href="/lesson" variant="link">查看全部</Button>
        </div>
        <div className={styles.courseGrid}>
          {lessons.length === 0 && (
            <div className={styles.emptyState}>暂无课程数据，请确认 API 是否已启动在 {API}</div>
          )}
          {lessons.slice(0, 9).map((lesson) => {
            const minutes = Math.max(1, Math.round(lesson.duration / 60));
            return (
              <Card key={lesson.id} href={`/lesson/${lesson.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge variant="muted">#{lesson.lessonNo}</Badge>
                  {cachedMap[lesson.id] && <Badge variant="success">已缓存</Badge>}
                </div>
                <h3 className={styles.lessonTitle}>{lesson.title}</h3>
                <div className={styles.tagRow}>
                  <Badge>{lesson.level || 'All'}</Badge>
                  <Badge variant="muted">约 {minutes} 分钟</Badge>
                  {(lesson.tags || []).slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="muted">#{tag}</Badge>
                  ))}
                </div>
                <div className={styles.cardFooter}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>点击查看详情</span>
                  <Button as="a" href={`/lesson/${lesson.id}`} size="sm" variant="ghost">进入</Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>高级会员（预留）</div>
        <Card>
          <h3 className={styles.lessonTitle}>EnglishPod 365 高级体验</h3>
          <p style={{ margin: '6px 0 16px', color: 'var(--color-text-muted)', fontSize: 14 }}>
            更丰富的课程包、AI 深度批改、离线课程缓存等权益即将上线，敬请期待。
          </p>
          <Button as="a" href="/account" variant="ghost">了解更多</Button>
        </Card>
      </section>
    </div>
  );
}
