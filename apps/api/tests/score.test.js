const assert = require('assert');
const { scorePronunciation } = require('../src/lib/score');

function testBasic() {
  const r = scorePronunciation({ referenceText: 'Hello world' });
  assert(r.score >= 50 && r.score <= 98, 'score in range');
  assert(typeof r.metrics.lengthRatio === 'number');
}

function testAudioImpact() {
  const r1 = scorePronunciation({ referenceText: 'a'.repeat(20), audioBase64: 'x'.repeat(2000) });
  const r2 = scorePronunciation({ referenceText: 'a'.repeat(20), audioBase64: 'x'.repeat(40000) });
  // 更长“音频”更可能接近比例 → 分数不应明显更差
  assert(r2.score >= r1.score - 10, 'longer audio not drastically worse');
}

function run() {
  testBasic();
  testAudioImpact();
  // eslint-disable-next-line no-console
  console.log('score.test.js OK');
}

run();

