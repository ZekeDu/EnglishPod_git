import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import styles from './align.module.css';
import { Button, Card } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type Seg = { idx: number; start_sec: number; end_sec: number; text_en: string };

export default function AlignPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const audioRef = useRef<HTMLAudioElement>(null);
  const [meta, setMeta] = useState<any>(null);
  const [segs, setSegs] = useState<Seg[]>([]);
  const [cur, setCur] = useState<number>(0);
  const [msg, setMsg] = useState<string>('');
  const [dirty, setDirty] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const fetchJson = async (url: string) => {
        const resp = await fetch(url, { credentials: 'include' });
        if (resp.status === 401) {
          router.push(`/login?redirect=${encodeURIComponent(`/align/${id}`)}`);
          throw new Error('unauthorized');
        }
        if (!resp.ok) throw new Error('request_failed');
        return resp.json();
      };
      const m = await fetchJson(`${API}/lessons/${id}`);
      setMeta(m.data);
      const t = await fetchJson(`${API}/lessons/${id}/transcript`);
      setSegs(Array.isArray(t?.data?.segments) ? t.data.segments : []);
    })();
  }, [id, router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const a = audioRef.current;
      if (!a || segs.length === 0) return;
      if (e.key === 's' || e.key === 'S') {
        const copy = [...segs];
        copy[cur].start_sec = Number(a.currentTime.toFixed(2));
        setSegs(copy);
        setMsg(`设置 #${cur} 起点 → ${copy[cur].start_sec}s`);
        setDirty(true);
      } else if (e.key === 'e' || e.key === 'E') {
        const copy = [...segs];
        copy[cur].end_sec = Number(a.currentTime.toFixed(2));
        setSegs(copy);
        setMsg(`设置 #${cur} 终点 → ${copy[cur].end_sec}s`);
        setDirty(true);
      } else if (e.key === 'ArrowDown') {
        setCur((prev) => Math.min(prev + 1, segs.length - 1));
      } else if (e.key === 'ArrowUp') {
        setCur((prev) => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [segs, cur]);

  const save = async () => {
    await fetch(`${API}/lessons/${id}/transcript`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ segments: segs }),
    });
    setDirty(false);
    setMsg('已保存全部更改');
  };

  const currentSeg = segs[cur];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.subtitle}>Alignment Tool</p>
          <h1 className={styles.title}>对齐工具</h1>
        </div>
        <p className={styles.hint}>S=设置起点 · E=设置终点 · ↑/↓ 切换句子 · 完成后点击保存</p>
      </header>
      <Card className={styles.audioCard}>
        {meta ? (
          <audio
            ref={audioRef}
            controls
            src={id ? `${API}/media/lesson/${id}/main` : ''}
            className={styles.audio}
          />
        ) : (
          <p className="muted">正在加载音频…</p>
        )}
      </Card>
      {msg && <div className={styles.status}>{msg}</div>}
      <div className={styles.layout}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>句子列表</div>
          <div className={styles.panelBody}>
            <ul className={styles.segmentList}>
              {segs.map((s) => (
                <li
                  key={s.idx}
                  className={`${styles.segmentItem} ${s.idx === cur ? styles.segmentActive : ''}`}
                  onClick={() => {
                    setCur(s.idx);
                    if (audioRef.current) audioRef.current.currentTime = s.start_sec;
                  }}
                >
                  <span className={styles.segmentTime}>
                    {s.start_sec.toFixed(2)}–{s.end_sec.toFixed(2)}s
                  </span>
                  <span>{s.text_en}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>操作</div>
          <div className={styles.panelBody}>
            <p className={styles.current}>当前句：#{cur}</p>
            <div className={styles.toolbar}>
              <Button
                onClick={() => {
                  if (!currentSeg || !audioRef.current) return;
                  audioRef.current.currentTime = currentSeg.start_sec;
                  audioRef.current.play().catch(() => {});
                }}
                block
              >
                从起点播放
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (!currentSeg || !audioRef.current) return;
                  audioRef.current.currentTime = Math.max(currentSeg.end_sec - 0.2, currentSeg.start_sec);
                  audioRef.current.play().catch(() => {});
                }}
                block
              >
                预听终点
              </Button>
              <Button onClick={save} disabled={!dirty || segs.length === 0} block>
                保存全部更改
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
