import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import styles from './lessonList.module.css';
import { Badge, Button, Card } from '../../components/ui';

type Lesson = {
  id: string;
  lessonNo?: number;
  title: string;
  level?: string;
  duration?: number;
  tags?: string[];
};

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const PAGE_SIZE = 10;

export default function LessonCatalog() {
  const router = useRouter();
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rawPage = useMemo(() => {
    if (!router.isReady) return 1;
    const qp = router.query.page;
    const parsed = Array.isArray(qp) ? Number.parseInt(qp[0], 10) : qp ? Number.parseInt(String(qp), 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [router.isReady, router.query.page]);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`${API}/lessons`, { credentials: 'include', cache: 'no-store' as RequestCache })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('加载课程失败');
        const json = await resp.json();
        const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        setAllLessons(list);
      })
      .catch(() => setError('课程列表加载失败，请稍后重试。'))
      .finally(() => setLoading(false));
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(allLessons.length / PAGE_SIZE)), [allLessons.length]);
  const page = useMemo(() => Math.min(Math.max(1, rawPage), totalPages), [rawPage, totalPages]);

  useEffect(() => {
    if (!router.isReady) return;
    const asPath = router.asPath || '';
    if (asPath.startsWith('/lesson/')) return;
    const current = router.query.page ? String(Array.isArray(router.query.page) ? router.query.page[0] : router.query.page) : undefined;
    const desiredQuery = page === 1 ? undefined : String(page);
    if (desiredQuery === undefined && current === undefined) return;
    if (desiredQuery !== undefined && current === desiredQuery) return;
    const query = desiredQuery ? { page: desiredQuery } : {};
    router.replace({ pathname: '/lesson', query }, undefined, { shallow: true });
  }, [page, router.asPath, router.isReady, router.query.page]);

  const pagedLessons = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return allLessons.slice(start, start + PAGE_SIZE);
  }, [allLessons, page]);

  const goToPage = (target: number) => {
    if (!router.isReady) return;
    const maxPage = Math.max(1, totalPages);
    const clamped = Math.min(Math.max(1, target), maxPage);
    const desiredQuery = clamped === 1 ? undefined : String(clamped);
    const current = router.query.page ? String(Array.isArray(router.query.page) ? router.query.page[0] : router.query.page) : undefined;
    if (desiredQuery === undefined && current === undefined) return;
    if (desiredQuery !== undefined && current === desiredQuery) return;
    const query = desiredQuery ? { page: desiredQuery } : {};
    router.replace({ pathname: '/lesson', query }, undefined, { shallow: true });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>全部课程</h1>
          <p className={styles.subtitle}>共 {allLessons.length} 节课程，每页显示 {PAGE_SIZE} 节</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          返回首页
        </Button>
      </header>

      {error && <Card className={styles.emptyState}>{error}</Card>}
      {!error && loading && <Card className={styles.emptyState}>加载课程中…</Card>}

      {!loading && !error && pagedLessons.length === 0 && (
        <Card className={styles.emptyState}>
          暂无课程数据，请确认 API 是否已启动：{API}
        </Card>
      )}

      {!loading && !error && pagedLessons.length > 0 && (
        <div className={styles.grid}>
          {pagedLessons.map((lesson) => (
            <Card key={lesson.id}>
              <div className={styles.cardTop}>
                <h2 className={styles.lessonId}>Lesson {lesson.lessonNo ?? lesson.id}</h2>
                <Badge variant="muted">{lesson.level || '未设级别'}</Badge>
              </div>
              <h3 className={styles.lessonTitle}>{lesson.title}</h3>
              <div className={styles.cardMeta}>
                {lesson.duration ? <span>时长 {Math.round(lesson.duration)} 秒</span> : null}
                <span>ID: {lesson.id}</span>
              </div>
              {Array.isArray(lesson.tags) && lesson.tags.length > 0 && (
                <div className={styles.tagRow}>
                  {lesson.tags.slice(0, 6).map((tag) => (
                    <Badge key={tag} variant="muted">
                      #{tag}
                    </Badge>
                  ))}
                  {lesson.tags.length > 6 && (
                    <span className={styles.tagMore}>+{lesson.tags.length - 6}</span>
                  )}
                </div>
              )}
              <Button
                size="sm"
                style={{ marginTop: 12 }}
                onClick={() => router.push(`/lesson/${lesson.id}`)}
              >
                进入课程
              </Button>
            </Card>
          ))}
        </div>
      )}

      <div className={styles.pagination}>
        <Button size="sm" variant="ghost" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
          上一页
        </Button>
        <span className={styles.pageInfo}>
          第 {page} / {totalPages} 页
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
