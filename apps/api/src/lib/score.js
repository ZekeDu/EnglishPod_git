function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// 占位评分器：基于参考文本长度与音频大小估计
function scorePronunciation({ audioBase64 = '', referenceText = '' } = {}) {
  const refLen = (referenceText || '').trim().length || 1;
  const audioLen = audioBase64 ? audioBase64.length : 0; // 近似代表数据量

  // 粗略指标
  const durationEst = audioLen / 20000; // 粗估“时长”
  const lengthRatio = clamp(durationEst / (refLen / 12), 0, 2); // 文本长度与时长比例

  // 目标：比例接近 1 最优，偏离越大扣分
  const ratioPenalty = Math.abs(1 - lengthRatio); // 0 最佳

  // 文本稳定加成：长句更稳定一点
  const base = 60 + Math.min(20, Math.log2(refLen + 1) * 5);

  // 轻度随机但可复现：基于文本 hash
  const noise = (hashString(referenceText || 'x') % 10) / 10; // 0.0–0.9

  let score = base + 20 * (1 - ratioPenalty) + noise * 2;
  score = Math.round(clamp(score, 50, 98));

  return {
    score,
    metrics: {
      refLen,
      audioChars: audioLen,
      durationEst: Number(durationEst.toFixed(2)),
      lengthRatio: Number(lengthRatio.toFixed(2)),
    },
  };
}

module.exports = { scorePronunciation };

