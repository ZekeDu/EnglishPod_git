import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import styles from './practice.module.css';
import { Button, Card, Badge } from '../../components/ui';
import { track } from '../../utils/track';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type ClozePkg = { passage: string; items: { index: number; options: string[] }[] } | null;
type EssayPkg = { prompt: string; min_words: number; max_words: number; rubric: any } | null;

type LatestState = {
  cloze?: {
    answers: { index: number; value: string }[];
    perItem?: { index: number; correct: boolean; answer: string; analysis: string }[];
    score?: number;
    submitted_at?: string;
  } | null;
  essay?: {
    content?: string;
    feedback?: any;
    provider?: string;
    model?: string;
    latency_ms?: number;
    submitted_at?: string;
  } | null;
};

export default function PracticePage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const [cloze, setCloze] = useState<ClozePkg>(null);
  const [essay, setEssay] = useState<EssayPkg>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [clozeResult, setClozeResult] = useState<any>(null);
  const [clozeError, setClozeError] = useState<string | null>(null);
  const [essayText, setEssayText] = useState('');
  const [essayResult, setEssayResult] = useState<any>(null);
  const [essayLoading, setEssayLoading] = useState(false);
  const [essayError, setEssayError] = useState<string | null>(null);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cloze' | 'essay'>('cloze');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const resp = await fetch(`${API}/practice/lessons/${id}`, { credentials: 'include' });
      const json = await resp.json();
      setCloze(json.data.cloze || null);
      setEssay(json.data.essay || null);
      if (json.data.cloze) setActiveTab('cloze');
      else if (json.data.essay) setActiveTab('essay');
      if (json.data.latest) applyLatestState(json.data.latest);
      else setLastSubmittedAt(null);
      track('practice_open', { lessonId: id });
    })().catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const resp = await fetch(`${API}/practice/${id}/state`, { credentials: 'include' });
        if (!resp.ok) return;
        const json = await resp.json();
        if (json?.data) applyLatestState(json.data);
      } catch {}
    })();
  }, [id]);

  useEffect(() => {
    const handler = (e: Event) => {
      const target = e.target as HTMLSelectElement;
      if (target && target.tagName === 'SELECT' && target.dataset.idx) {
        const idx = Number(target.dataset.idx);
        setAnswers((prev) => ({ ...prev, [idx]: target.value }));
      }
    };
    document.addEventListener('change', handler);
    return () => document.removeEventListener('change', handler);
  }, []);

  const collectCurrentAnswers = () => {
    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('.cloze-select'));
    return selects
      .map((select) => ({
        index: Number(select.dataset.idx),
        value: select.value,
      }))
      .filter((entry) => Number.isFinite(entry.index));
  };

  const applyLatestState = (latest: LatestState) => {
    if (latest?.cloze) {
      const mapped: Record<number, string> = {};
      (latest.cloze.answers || []).forEach((entry) => {
        if (typeof entry.index === 'number' && typeof entry.value === 'string') {
          mapped[entry.index] = entry.value;
        }
      });
      setAnswers(mapped);
      setClozeResult({
        score: latest.cloze.score ?? null,
        perItem: Array.isArray(latest.cloze.perItem) ? latest.cloze.perItem : [],
      });
      if (latest.cloze.submitted_at) setLastSubmittedAt(latest.cloze.submitted_at);
    }
    if (latest?.essay) {
      if (typeof latest.essay.content === 'string') setEssayText(latest.essay.content);
      if (latest.essay.feedback) {
        setEssayResult({
          feedback: latest.essay.feedback,
          provider: latest.essay.provider,
          model: latest.essay.model,
          latency_ms: latest.essay.latency_ms,
        });
      }
      if (latest.essay.submitted_at) {
        const prev = latest?.cloze?.submitted_at || lastSubmittedAt;
        const ts = latestTimestamp([prev, latest.essay.submitted_at]);
        setLastSubmittedAt(ts);
      }
    }
    if (!latest?.cloze && !latest?.essay) setLastSubmittedAt(null);
  };

  const latestTimestamp = (timestamps: (string | null | undefined)[]) => {
    const valid = timestamps.filter(Boolean) as string[];
    if (valid.length === 0) return null;
    return valid.reduce((latest, current) => (
      new Date(current).getTime() > new Date(latest).getTime() ? current : latest
    ), valid[0]);
  };

  const renderedPassage = useMemo(() => {
    if (!cloze) return '';
    let text = cloze.passage;
    (cloze.items || []).forEach((item) => {
      const selected = answers[item.index] || '';
      const options = item.options
        .map((opt) => `<option value="${opt}" ${opt === selected ? 'selected' : ''}>${opt}</option>`)
        .join('');
      const selectHtml = `<select data-idx="${item.index}" class="cloze-select">${options}</select>`;
      text = text.replace(new RegExp(`\\{${item.index}\\}`, 'g'), selectHtml);
    });
    return text;
  }, [cloze, answers]);

  const submitCloze = async () => {
    setClozeError(null);
    const current = collectCurrentAnswers();
    const mapped: Record<number, string> = {};
    current.forEach((entry) => {
      mapped[entry.index] = entry.value;
    });
    if (current.length > 0) setAnswers(mapped);
    const payload = { answers: current };
    try {
      const resp = await fetch(`${API}/practice/${id}/cloze/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const result = await resp.json().catch(() => null);
      if (!resp.ok || !result || result.code !== 200) {
        const message = result?.data?.error || '提交失败，请稍后再试';
        if (resp.status === 401 || message === 'unauthorized') {
          router.push(`/login?redirect=/practice/${id}`);
          return;
        }
        setClozeError(message);
        setClozeResult(null);
        return;
      }
      setClozeResult({ score: result.data.score, perItem: result.data.perItem, answers: result.data.answers });
      setClozeError(null);
      const mapped: Record<number, string> = {};
      (result.data.answers || []).forEach((entry: any) => {
        if (typeof entry?.index === 'number') mapped[entry.index] = entry.value || '';
      });
      if (Object.keys(mapped).length > 0) setAnswers(mapped);
      if (result.data.submitted_at) setLastSubmittedAt(result.data.submitted_at);
    } catch {
      setClozeError('网络异常，请稍后再试');
      setClozeResult(null);
    }
  };

  const submitEssay = async () => {
    setEssayError(null);
    setEssayLoading(true);
    try {
      const resp = await fetch(`${API}/practice/${id}/essay/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: essayText }),
      });
      if (!resp.ok) {
        const result = await resp.json().catch(() => ({}));
        const message = result?.data?.error || '当前作文反馈暂不可用，请稍后再试';
        if (resp.status === 401 || message === 'unauthorized') {
          router.push(`/login?redirect=/practice/${id}`);
          return;
        }
        setEssayError(message);
        setEssayResult(null);
        return;
      }
      const res = await resp.json();
      setEssayResult(res.data);
      if (res.data?.submitted_at) {
        const next = latestTimestamp([res.data.submitted_at, lastSubmittedAt]);
        setLastSubmittedAt(next);
      }
    } catch {
      setEssayError('网络异常，稍后再试试');
      setEssayResult(null);
    } finally {
      setEssayLoading(false);
    }
  };

  const resetPractice = async () => {
    if (!id) return;
    if (!window.confirm('确定要清空当前课程的练习记录并重新作答吗？')) return;
    try {
      const resp = await fetch(`${API}/practice/${id}/state`, { method: 'DELETE', credentials: 'include' });
      if (resp.status === 401) {
        router.push(`/login?redirect=/practice/${id}`);
        return;
      }
      if (!resp.ok) throw new Error('reset_failed');
      setAnswers({});
      setClozeResult(null);
      setClozeError(null);
      setEssayText('');
      setEssayResult(null);
      setEssayError(null);
      setLastSubmittedAt(null);
    } catch {
      alert('清空练习记录失败，请稍后重试');
    }
  };

  const wc = useMemo(() => essayText.trim().split(/\s+/).filter(Boolean).length, [essayText]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/lesson/${id}`)}>
          返回课程
        </Button>
        <div>
          <h1 className={styles.heading}>课后练习</h1>
          <p className={styles.subtitle}>完形填空 + 作文点评，巩固本课</p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetPractice}>
          重新练习
        </Button>
      </header>

      {lastSubmittedAt && (
        <Card className={styles.notice}>
          上次提交：{new Date(lastSubmittedAt).toLocaleString()}
        </Card>
      )}

      <div className={styles.tabRow}>
        {cloze && (
          <button
            type="button"
            className={activeTab === 'cloze' ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab('cloze')}
          >
            完形填空
          </button>
        )}
        {essay && (
          <button
            type="button"
            className={activeTab === 'essay' ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab('essay')}
          >
            小作文
          </button>
        )}
      </div>

      {activeTab === 'cloze' && cloze && (
        <>
          <Card>
            <h3 className={styles.subtitle}>请选择合适的答案补全文章</h3>
            <div
              className={styles.clozePassage}
              dangerouslySetInnerHTML={{ __html: renderedPassage }}
            />
          </Card>
          {clozeError && (
            <Card className={styles.notice}>
              <span style={{ color: 'var(--color-error)' }}>{clozeError}</span>
            </Card>
          )}
          {clozeResult && (
            <Card className={styles.resultCard}>
              <h3 className={styles.subtitle}>得分：{clozeResult.score ?? '--'}</h3>
              <ul className={styles.historyList}>
                {(clozeResult.perItem || []).map((item: any) => (
                  <li key={item.index} className={styles.historyItem}>
                    <span>第 {item.index} 题</span>
                    <span className={styles.historyMuted}>
                      {item.correct ? '✅ 正确' : `❌ 答案：${item.answer}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className={styles.actionBar}>
            <Button onClick={submitCloze} block>
              提交完形填空
            </Button>
          </div>
        </>
      )}

      {activeTab === 'essay' && essay && (
        <>
          <Card>
            <h3 className={styles.subtitle}>题目</h3>
            <p>{essay.prompt}</p>
            <Badge variant="muted">要求：{essay.min_words}-{essay.max_words} 词</Badge>
          </Card>
          <Card>
            <textarea
              className={styles.essayField}
              value={essayText}
              placeholder="Please write your essay in English..."
              onChange={(e) => setEssayText(e.currentTarget.value)}
            />
            <p className={styles.wordCount}>当前 {wc} 词</p>
          </Card>
          {essayError && (
            <Card className={styles.notice}>
              <span style={{ color: 'var(--color-error)' }}>{essayError}</span>
            </Card>
          )}
          {essayResult && essayResult.feedback && (
            <Card className={styles.feedbackCard}>
              <div>
                <h4 className={styles.feedbackTitle}>总体点评</h4>
                <p className={styles.feedbackText}>{essayResult.feedback.summary || '—'}</p>
              </div>
              <div>
                <h4 className={styles.feedbackTitle}>问题讲解</h4>
                <p className={styles.feedbackText}>{essayResult.feedback.issues || '—'}</p>
              </div>
              <div>
                <h4 className={styles.feedbackTitle}>修正范文</h4>
                <p className={styles.feedbackText}>{essayResult.feedback.rewrite || '—'}</p>
              </div>
              {(essayResult.provider || essayResult.model) && (
                <Badge variant="muted">
                  反馈：{essayResult.provider || 'AI'} · {essayResult.model || 'N/A'}
                </Badge>
              )}
            </Card>
          )}
          <div className={styles.actionBar}>
            <Button
              onClick={submitEssay}
              disabled={wc < (essay?.min_words || 0) || wc > (essay?.max_words || Infinity) || essayLoading}
              block
            >
              {essayLoading ? '正在提交…' : '提交作文'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
