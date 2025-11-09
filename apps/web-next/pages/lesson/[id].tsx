import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Badge, Button, Card } from '../../components/ui';
import { TTSButton } from '../../components/TTSButton';
import { cacheLesson, clearLessonCache, isLessonCached } from '../../utils/offline';
import { track } from '../../utils/track';
import { markLessonProgress } from '../../utils/progress';
import styles from './lesson.module.css';

type Segment = { idx: number; start_sec: number; end_sec: number; text_en: string; text_zh?: string };
type VocabCard = { id?: string; word: string; pos?: string; meaning?: string; examples?: string[] };
type PracticeSummary = { score?: number; submitted_at?: string } | null;

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const mainMedia = (id: string | number) => `${API}/media/lesson/${id}/main`;
const podcastMedia = (id: string | number) => `${API}/media/lesson/${id}/podcast`;

const TABS = ['transcript', 'podcast', 'vocab', 'practice'] as const;

export default function LessonDetail() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastListenMarkRef = useRef<number>(0);
  const [meta, setMeta] = useState<any>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSeg, setActiveSeg] = useState<number>(-1);
  const [vocab, setVocab] = useState<VocabCard[]>([]);
  const [podcast, setPodcast] = useState<{ dialogue: any[] } | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string>('');
  const [tab, setTab] = useState<typeof TABS[number]>('transcript');
  const [practiceSummary, setPracticeSummary] = useState<PracticeSummary>(null);
  const [srsSet, setSrsSet] = useState<Set<string>>(new Set());
  const [loadingCard, setLoadingCard] = useState<string | null>(null);

  useEffect(() => {
    lastListenMarkRef.current = 0;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const resp = await fetch(`${API}/lessons/${id}/aggregate?include=meta,transcript,vocab,practice,podcast`, { credentials: 'include' });
        if (resp.status === 401) {
          router.push(`/login?redirect=/lesson/${id}`);
          return;
        }
        if (!resp.ok) throw new Error('failed');
        const json = await resp.json();
        const data = json.data || {};
        setMeta(data.meta || null);
        setSegments(Array.isArray(data.transcript?.segments) ? data.transcript.segments : []);
        setVocab(Array.isArray(data.vocab?.cards) ? data.vocab.cards : []);
        if (data.practice?.latest) setPracticeSummary(data.practice.latest);
        setPodcast(
          data.podcast && (data.podcast.meta || data.podcast.transcript)
            ? { dialogue: data.podcast.transcript?.dialogue || [] }
            : null,
        );
      } catch {
        setError('加载课程数据失败，请稍后再试');
      }
      try {
        setCached(await isLessonCached(String(id), mainMedia(id)));
      } catch {}
      try {
        const sResp = await fetch(`${API}/reviews/collection`, { credentials: 'include' });
        if (sResp.ok) {
          const sj = await sResp.json();
          const ids: string[] = Array.isArray(sj?.data?.card_ids) ? sj.data.card_ids : [];
          setSrsSet(new Set(ids.map((x: string) => x.toLowerCase())));
        }
      } catch {}
    })();
  }, [id]);

  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    const seg = segments.find((s) => t >= s.start_sec - 0.05 && t <= s.end_sec + 0.05);
    if (seg && seg.idx !== activeSeg) setActiveSeg(seg.idx);
    if (!id) return;
    const lastMarked = lastListenMarkRef.current;
    if (t < lastMarked) {
      lastListenMarkRef.current = t;
      return;
    }
    if (t - lastMarked >= 30) {
      markLessonProgress(String(id), 'listen', Math.round(t - lastMarked));
      lastListenMarkRef.current = t;
    }
  };

  const handleAudioPlay = () => {
    if (!audioRef.current || !id) return;
    const current = audioRef.current.currentTime;
    if (current < lastListenMarkRef.current) {
      lastListenMarkRef.current = current;
    }
    markLessonProgress(String(id), 'listen', 5);
  };

  const handlePlaySegment = (seg: Segment) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seg.start_sec + 0.05;
    audioRef.current.play().catch(() => {});
    setActiveSeg(seg.idx);
    if (id) {
      const duration = Math.max(1, Math.round(seg.end_sec - seg.start_sec));
      markLessonProgress(String(id), 'listen', duration);
    }
  };

  const transcriptList = useMemo(
    () => (
      <ul className={styles.segmentList}>
        {segments.map((seg) => (
          <li
            key={seg.idx}
            className={seg.idx === activeSeg ? styles.segmentActive : styles.segmentItem}
            onClick={() => handlePlaySegment(seg)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePlaySegment(seg);
              }
            }}
          >
            <div className={styles.segmentTime}>{formatTime(seg.start_sec)}</div>
            <div>
              <p className={styles.segmentText}>{seg.text_en}</p>
              {seg.text_zh && <p className={styles.segmentSub}>{seg.text_zh}</p>}
            </div>
          </li>
        ))}
      </ul>
    ),
    [segments, activeSeg],
  );

  const normalizeCardId = (item: VocabCard, index: number) => {
    const lessonKey = meta?.id ? String(meta.id) : String(id || '');
    const base = item.id ? String(item.id) : `${lessonKey}-${index}`;
    return base.trim().toLowerCase();
  };

  const toggleReview = async (item: VocabCard, index: number) => {
    const cardId = normalizeCardId(item, index);
    const inReview = srsSet.has(cardId);
    try {
      setLoadingCard(cardId);
      const resp = await fetch(`${API}/reviews/${inReview ? 'remove' : 'add'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ card_id: cardId }),
      });
      if (resp.status === 401) {
        router.push(`/login?redirect=/lesson/${id}`);
        return;
      }
      if (!resp.ok) throw new Error('request_failed');
      setSrsSet((prev) => {
        const next = new Set(prev);
        if (inReview) next.delete(cardId);
        else next.add(cardId);
        return next;
      });
    } catch (err) {
      alert(inReview ? '移除失败，请稍后再试' : '加入复习失败，请稍后再试');
    } finally {
      setLoadingCard(null);
    }
  };

  const practiceBlock = useMemo(() => {
    if (!id) return null;
    const href = `/practice/${id}`;
    return (
      <Card>
        <h3 className={styles.sectionHeading}>课后练习</h3>
        <p className={styles.muted}>完形填空 + 作文点评，巩固本课要点。</p>
        {practiceSummary ? (
          <div className={styles.practiceSummary}>
            <Badge variant="success">最近得分 {practiceSummary.score ?? '--'}</Badge>
            <span className={styles.muted}>
              上次提交：{practiceSummary.submitted_at ? new Date(practiceSummary.submitted_at).toLocaleString() : '—'}
            </span>
          </div>
        ) : (
          <p className={styles.muted}>还没有提交记录，试试看吧～</p>
        )}
        <Button as="a" href={href} block>
          开始练习
        </Button>
      </Card>
    );
  }, [id, practiceSummary]);

  return (
    <>
      <Head>
        <title>{meta?.title ? `${meta.title} - EnglishPod 365` : '课程详情 - EnglishPod 365'}</title>
      </Head>
      <div className={styles.page}>
        <header className={styles.header}>
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            返回
          </Button>
          <div className={styles.headerInfo}>
            <Badge variant="muted">{meta?.level || '未分类'}</Badge>
            <h1 className={styles.title}>{meta?.title || '加载中…'}</h1>
            <p className={styles.metaLine}>
              {meta?.lesson_no ? `Lesson ${meta.lesson_no}` : ''}
              {meta?.duration ? ` · ${Math.round(meta.duration / 60)} 分钟` : ''}
            </p>
          </div>
          <div className={styles.headerAction}>
            <Button variant="ghost" size="sm">
              收藏
            </Button>
          </div>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.hero}>
          <div className={styles.audioCard}>
            <audio
              ref={audioRef}
              controls
              src={id ? mainMedia(id) : ''}
              onPlay={handleAudioPlay}
              onTimeUpdate={onTimeUpdate}
              preload="metadata"
            >
              <track kind="captions" />
            </audio>
            <div className={styles.audioActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  if (!id) return;
                  await cacheLesson(String(id), [mainMedia(id)]);
                  setCached(true);
                  track('offline_download', { lessonId: id });
                }}
                disabled={cached}
              >
                {cached ? '已缓存本课' : '缓存用于离线'}
              </Button>
              {cached && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!id) return;
                    await clearLessonCache(String(id));
                    setCached(false);
                  }}
                >
                  清除缓存
                </Button>
              )}
            </div>
          </div>
          {((meta?.description && meta.description.trim()) || (meta?.tags || []).length > 0) && (
            <div className={styles.heroSummary}>
              <h2 className={styles.sectionHeading}>课程概览</h2>
              {meta?.description && meta.description.trim() && <p className={styles.muted}>{meta.description.trim()}</p>}
              {(meta?.tags || []).length > 0 && (
                <div className={styles.tagRow}>
                  {(meta?.tags || []).map((tag: string) => (
                    <Badge key={tag} variant="muted">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <nav className={styles.tabs} aria-label="课程内容导航">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              className={tab === name ? styles.tabActive : styles.tab}
              onClick={() => setTab(name)}
            >
              {tabLabel(name)}
            </button>
          ))}
        </nav>

        <section className={styles.tabPanel}>
          {tab === 'transcript' && (
            <Card>
              <h3 className={styles.sectionHeading}>逐句字幕</h3>
              {segments.length === 0 ? <p className={styles.muted}>暂无字幕数据</p> : transcriptList}
            </Card>
          )}
          {tab === 'podcast' && (
            <div className={styles.stack}>
              <Card>
                <h3 className={styles.sectionHeading}>主持人播客</h3>
                <audio controls src={id ? podcastMedia(id) : ''} preload="metadata" className={styles.podcastAudio} />
              </Card>
              {podcast?.dialogue?.length ? (
                <Card>
                  <ul className={styles.dialogueList}>
                    {podcast.dialogue.map((line: any) => (
                      <li key={line.idx}>
                        <strong>{line.speaker || 'Host'}：</strong>
                        {line.text}
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : (
                <Card>
                  <p className={styles.muted}>暂无播客文稿</p>
                </Card>
              )}
            </div>
          )}
          {tab === 'vocab' && (
            <div className={styles.stack}>
              {vocab.length === 0 ? (
                <Card>
                  <p className={styles.muted}>暂无词汇</p>
                </Card>
              ) : (
                vocab.map((item, index) => {
                  const cardId = normalizeCardId(item, index);
                  const inReview = srsSet.has(cardId);
                  const speakText = item.word || (item as any).phrase || '';
                  return (
                    <Card key={cardId}>
                      <div className={styles.vocabHeader}>
                        <div>
                          <h4 className={styles.vocabWord}>
                            {item.word}
                            {item.pos && <span className={styles.vocabPos}>{item.pos}</span>}
                          </h4>
                          {item.meaning && <p className={styles.vocabMeaning}>{item.meaning}</p>}
                        </div>
                        <div className={styles.vocabActions}>
                          {speakText && (
                            <TTSButton text={speakText} showLabel={false} iconOnly compact size={18} />
                          )}
                          {inReview && <Badge variant="success">已加入复习</Badge>}
                        </div>
                      </div>
                      {item.examples && item.examples.length > 0 && (
                        <ul className={styles.exampleList}>
                          {item.examples.map((ex, idx) => (
                            <li key={idx}>{ex}</li>
                          ))}
                        </ul>
                      )}
                      <Button
                        variant={inReview ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => toggleReview(item, index)}
                        disabled={loadingCard === cardId}
                      >
                        {inReview ? '移出复习' : '加入复习'}
                      </Button>
                    </Card>
                  );
                })
              )}
            </div>
          )}
          {tab === 'practice' && <div className={styles.stack}>{practiceBlock}</div>}
        </section>

        <footer className={styles.footerBar}>
          <div className={styles.footerInfo}>
            <div className={styles.footerTitle}>{meta?.title || '课程详情'}</div>
            <div className={styles.footerMeta}>{meta?.lesson_no ? `Lesson ${meta.lesson_no}` : ''}</div>
          </div>
          <div className={styles.footerActions}>
            <Button as="a" href={`/practice/${id}`}>
              做练习
            </Button>
            <Button variant="ghost" as="a" href="/review" size="sm">
              去复习
            </Button>
          </div>
        </footer>
      </div>
    </>
  );
}

function tabLabel(name: typeof TABS[number]) {
  switch (name) {
    case 'transcript':
      return '字幕';
    case 'vocab':
      return '词汇';
    case 'podcast':
      return '播客';
    case 'practice':
      return '练习';
    default:
      return name;
  }
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
