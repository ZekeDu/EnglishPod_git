import { useState, useRef } from 'react';
import { track } from '../utils/track';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export function TTSButton({ text, size = 20, label = '朗读', showLabel = true, compact = false, iconOnly = false }: { text: string; size?: number; label?: string; showLabel?: boolean; compact?: boolean; iconOnly?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Silent wav to unlock audio context on mobile
  const SILENT_AUDIO = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  const onClick = async () => {
    if (!text || loading) return;

    // 1. Initialize audio instance if needed
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => setPlaying(false));
      audioRef.current.addEventListener('error', () => setPlaying(false));
    }

    const audio = audioRef.current;

    // 2. Synchronously unlock audio context (Critical for mobile)
    // We play a tiny silent buffer immediately in the click handler
    audio.src = SILENT_AUDIO;
    audio.play().catch(() => {
      // Ignore initial play errors (e.g. if user spams click)
    });

    setLoading(true);
    try {
      // 3. Fetch the real audio URL
      const r = await fetch(`${API}/tts?text=${encodeURIComponent(text)}&lang=en&rate=1.0`).then(res => res.json());
      const url = r?.data?.url as string;
      if (!url) throw new Error('no url');
      const abs = /^https?:/i.test(url) ? url : `${API}${url}`;

      // 4. Switch source and play real audio
      // Since we already "played" the element in this interaction, the context is unlocked
      audio.src = abs;
      await audio.play();
      setPlaying(true);
      track('tts_play', { text: text.slice(0, 64) });
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const padding = compact || iconOnly ? '2px 6px' : '4px 8px';
  const fontSize = compact || iconOnly ? 12 : 12;
  const icon = <span style={{ fontSize: size * 0.8 }}>{playing ? '🔈' : '🔊'}</span>;
  const content = iconOnly ? icon : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      {showLabel ? (loading ? '加载中…' : label) : null}
    </span>
  );
  return (
    <button className="button ghost" aria-label="播放参考读音" onClick={onClick} title={label} style={{ padding, fontSize }}>
      {content}
    </button>
  );
}
