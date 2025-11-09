import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type Seg = { idx: number; start_sec: number; end_sec: number; text_en: string };

export default function AlignPage(){
  const router = useRouter();
  const { id } = router.query as { id: string };
  const audioRef = useRef<HTMLAudioElement>(null);
  const [meta, setMeta] = useState<any>(null);
  const [segs, setSegs] = useState<Seg[]>([]);
  const [cur, setCur] = useState<number>(0);
  const [msg, setMsg] = useState<string>('');
  const [dirty, setDirty] = useState<boolean>(false);

  useEffect(() => { if (!id) return; (async()=>{
    const m = await fetch(`${API}/lessons/${id}`).then(r=>r.json()); setMeta(m.data);
    const t = await fetch(`${API}/lessons/${id}/transcript`).then(r=>r.json()); setSegs(t.data.segments||[]);
  })(); }, [id]);

  const keyHandler = (e: KeyboardEvent) => {
    const a = audioRef.current; if (!a) return;
    if (e.key === 's' || e.key === 'S') {
      const copy = [...segs]; copy[cur].start_sec = Number(a.currentTime.toFixed(2)); setSegs(copy); setMsg(`Set start of #${cur} -> ${copy[cur].start_sec}s`);
      setDirty(true);
    }
    if (e.key === 'e' || e.key === 'E') {
      const copy = [...segs]; copy[cur].end_sec = Number(a.currentTime.toFixed(2)); setSegs(copy); setMsg(`Set end of #${cur} -> ${copy[cur].end_sec}s`);
      setDirty(true);
    }
    if (e.key === 'ArrowDown') { setCur(Math.min(cur+1, segs.length-1)); }
    if (e.key === 'ArrowUp') { setCur(Math.max(cur-1, 0)); }
  };

  useEffect(() => { window.addEventListener('keydown', keyHandler as any); return () => window.removeEventListener('keydown', keyHandler as any); });

  const save = async () => {
    await fetch(`${API}/lessons/${id}/transcript`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ segments: segs })});
    setDirty(false);
    alert('已保存全部更改');
  };

  return (
    <main className="container">
      <header className="app-header">
        <h1 className="app-title" style={{fontSize:28}}>对齐工具 Alignment</h1>
      </header>
      {meta && (
        <audio
          ref={audioRef}
          controls
          src={id ? `${API}/media/lesson/${id}/main` : ''}
          style={{width:'100%'}}
        />
      )}
      <p className="muted">说明：选中句子后，S=设置起点，E=设置终点，↑/↓ 切换句子，完成后点击保存。</p>
      {msg && <p className="muted">{msg}</p>}
      <div className="layout">
        <div className="panel">
          <div className="panel-hd">句子列表</div>
          <div className="panel-bd">
            <ul className="segments">
              {segs.map(s => (
                <li key={s.idx} className={s.idx===cur? 'active':''}
                    onClick={() => { setCur(s.idx); if (audioRef.current) { audioRef.current.currentTime = s.start_sec; } }}>
                  <span className="seg-time">{s.start_sec.toFixed(2)}–{s.end_sec.toFixed(2)}s</span>
                  {s.text_en}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="panel">
          <div className="panel-hd">操作</div>
          <div className="panel-bd">
            <p>当前句：#{cur}</p>
            <div className="toolbar">
              <button className="button" onClick={() => { const a=audioRef.current; if (a) { a.currentTime = segs[cur].start_sec; a.play(); } }}>从起点播放</button>
              <button className="button ghost" onClick={() => { const a=audioRef.current; if (a) { a.currentTime = segs[cur].end_sec-0.2; a.play(); } }}>预听终点</button>
              <button className="button" onClick={save} disabled={!dirty}>保存全部更改</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
