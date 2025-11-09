import { useState } from 'react';
import { track } from '../utils/track';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export function TTSButton({ text, size = 20, label = '朗读', showLabel = true, compact = false, iconOnly = false }: { text: string; size?: number; label?: string; showLabel?: boolean; compact?: boolean; iconOnly?: boolean }){
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);

  const onClick = async () => {
    if (!text || loading) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/tts?text=${encodeURIComponent(text)}&lang=en&rate=1.0`).then(res=>res.json());
      const url = r?.data?.url as string;
      if (!url) throw new Error('no url');
      const abs = /^https?:/i.test(url) ? url : `${API}${url}`;
      const audio = new Audio(abs);
      setPlaying(true);
      audio.addEventListener('ended', () => setPlaying(false));
      audio.addEventListener('error', () => setPlaying(false));
      await audio.play();
      track('tts_play', { text: text.slice(0,64) });
    } catch {
      // noop，UI 保持简洁
    } finally {
      setLoading(false);
    }
  };

  const padding = compact || iconOnly ? '2px 6px' : '4px 8px';
  const fontSize = compact || iconOnly ? 12 : 12;
  const icon = <span style={{fontSize: size * 0.8}}>{playing ? '🔈' : '🔊'}</span>;
  const content = iconOnly ? icon : (
    <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
      {icon}
      {showLabel ? (loading ? '加载中…' : label) : null}
    </span>
  );
  return (
    <button className="button ghost" aria-label="播放参考读音" onClick={onClick} title={label} style={{padding, fontSize}}>
      {content}
    </button>
  );
}
