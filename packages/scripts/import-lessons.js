const fs = require('fs');
const path = require('path');

function validateTranscript(transcript) {
  const errs = [];
  if (!Array.isArray(transcript.segments)) errs.push('segments must be array');
  let prev = -Infinity;
  (transcript.segments || []).forEach((s, i) => {
    if (typeof s.start_sec !== 'number') {
      errs.push(`segment[${i}] missing start_sec`);
    }
    if (s.end_sec != null && typeof s.end_sec !== 'number') {
      errs.push(`segment[${i}] end_sec invalid`);
    }
    if (typeof s.start_sec === 'number' && typeof s.end_sec === 'number' && s.start_sec >= s.end_sec) {
      errs.push(`segment[${i}] start>=end`);
    }
    if (s.start_sec < prev) errs.push(`segment[${i}] start not monotonic`);
    prev = s.start_sec;
    if (typeof s.text_en !== 'string' || !s.text_en.trim()) errs.push(`segment[${i}] text_en empty`);
  });
  return errs;
}

function validateLessonDir(dir) {
  const metaPath = path.join(dir, 'meta.json');
  const tranPath = path.join(dir, 'transcript.json');
  const errors = [];
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (!meta.title) errors.push('meta.title missing');
    if (!meta.audio_url) errors.push('meta.audio_url missing');
  } catch (e) {
    errors.push('invalid meta.json');
  }
  try {
    const transcript = JSON.parse(fs.readFileSync(tranPath, 'utf-8'));
    errors.push(...validateTranscript(transcript));
  } catch (e) {
    errors.push('invalid transcript.json');
  }
  return errors;
}

function run(root = path.join(process.cwd(), 'data', 'lessons')) {
  const entries = fs.readdirSync(root).filter(f => /\d+/.test(f));
  const report = {};
  for (const id of entries) {
    const dir = path.join(root, id);
    const errs = validateLessonDir(dir);
    report[id] = errs;
  }
  const hasErr = Object.values(report).some(arr => arr.length);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ hasErr, report }, null, 2));
  if (hasErr) process.exitCode = 1;
}

if (require.main === module) run();

module.exports = { validateTranscript, validateLessonDir };
