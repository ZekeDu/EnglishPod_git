function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function scorePronunciation({ audioBase64 = '', referenceText = '' }: { audioBase64?: string; referenceText?: string }) {
  const refLen = (referenceText || '').trim().length || 1;
  const audioLen = audioBase64 ? audioBase64.length : 0;
  const durationEst = audioLen / 20000;
  const lengthRatio = clamp(durationEst / (refLen / 12), 0, 2);
  const ratioPenalty = Math.abs(1 - lengthRatio);
  const base = 60 + Math.min(20, Math.log2(refLen + 1) * 5);
  const noise = (hashString(referenceText || 'x') % 10) / 10;
  let score = base + 20 * (1 - ratioPenalty) + noise * 2;
  score = Math.round(clamp(score, 50, 98));
  // derive simple sub-scores
  const pron = Math.round(clamp(55 + (1 - Math.abs(1 - lengthRatio)) * 40 + noise, 50, 98));
  const stress = Math.round(clamp(50 + (durationEst > refLen / 15 ? 30 : 20) + noise * 3, 50, 95));
  const fluency = Math.round(clamp(50 + (durationEst > 0.4 ? 35 : 20) + (1 - ratioPenalty) * 10, 50, 97));
  let advice = 'Good job! Keep practicing for consistency.';
  if (pron < 70) advice = 'Focus on pronunciation clarity and articulation.';
  else if (fluency < 70) advice = 'Try speaking more smoothly without long pauses.';
  else if (stress < 70) advice = 'Pay attention to word stress and rhythm.';
  return {
    score,
    metrics: { refLen, audioChars: audioLen, durationEst: Number(durationEst.toFixed(2)), lengthRatio: Number(lengthRatio.toFixed(2)) },
    detail: { pron, stress, fluency, advice },
  };
}
