// Build lesson sample data from example PDFs and MP3
// - Parses the two PDFs under ./example/
// - Generates transcript segments (approximate timing)
// - Extracts 3–8 vocab phrases heuristically
// - Copies mp3 to apps/web-next/public/audio/1.mp3 and updates meta

const fs = require('fs');
const path = require('path');
// Using structured JSON sources instead of PDFs

const EX_DIR = path.join(process.cwd(), 'example');
const DATA_DIR = path.join(process.cwd(), 'data', 'lessons', '1');
const PUBLIC_AUDIO = path.join(process.cwd(), 'apps', 'web-next', 'public', 'audio');

function splitSentences(text) {
  // Simple split by punctuation; keep short lines together
  const rough = text.split(/(?<=[.!?。！？])\s+/);
  return rough
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 2 && /[a-zA-Z]/.test(s));
}

function toSegments(sentences) {
  const segs = [];
  let t = 0.5; // start offset to avoid 0
  const step = 2.8; // average seconds per sentence (approx)
  sentences.forEach((s, idx) => {
    const dur = Math.max(1.6, Math.min(5.0, s.length / 10));
    segs.push({ idx, start_sec: Number(t.toFixed(2)), end_sec: Number((t + dur).toFixed(2)), text_en: s });
    t += step;
  });
  return segs;
}

const STOP = new Set('a,an,the,and,or,but,for,nor,on,in,at,by,with,of,to,from,is,are,was,were,be,been,being,do,does,did,have,has,had,will,would,can,could,should,may,might,i,you,he,she,it,we,they,me,him,her,them,my,your,his,her,its,our,their,this,that,these,those,as,if,than,then,so,not,no,yes,just,very,too,also,there,here,what,which,who,whom,whose,when,where,why,how,up,down,out,over,under,again,once'.split(','));

function extractPhrases(sentences, max = 8) {
  const words = sentences.join(' ').toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean);
  const tokens = words.filter(w => !STOP.has(w) && w.length >= 3);
  const counts = new Map();
  for (let i = 0; i < tokens.length - 1; i++) {
    const bi = tokens[i] + ' ' + tokens[i + 1];
    counts.set(bi, (counts.get(bi) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max + 4).map(([phrase]) => phrase);
  const unique = [];
  for (const p of top) {
    if (!unique.some(u => u.includes(p) || p.includes(u))) unique.push(p);
    if (unique.length >= Math.min(max, 8)) break;
  }
  return unique.map(p => ({ phrase: p, definition: '', examples: [] }));
}

async function main() {
  // Build from structured JSON files
  const dgPath = path.join(EX_DIR, 'B0001dg_Difficult_Customer.json');
  const pbPath = path.join(EX_DIR, 'B0001pb_Difficult_Customer.json');
  const dg = JSON.parse(fs.readFileSync(dgPath, 'utf-8'));
  const pb = JSON.parse(fs.readFileSync(pbPath, 'utf-8'));

  // 1) Main transcript (课文) from dg.dialogue
  const sentences = (dg.dialogue || []).map(d => (d.speaker ? `${d.speaker}: ${d.line}` : d.line));
  const segments = sentences.map((s, idx) => ({ idx, start_sec: Number((0.5 + idx * 2.5).toFixed(2)), end_sec: Number((0.5 + idx * 2.5 + Math.max(1.5, Math.min(5, s.length/10))).toFixed(2)), text_en: s }));

  // 2) Vocabulary: prefer dg.key_vocabulary + dg.supplementary_vocabulary; fallbacks to pb; then to vocabulary_explanation
  const fromKV = (src) => ((src.key_vocabulary||[]).concat(src.supplementary_vocabulary||[]))
    .map(v => ({ word: String(v.word).toLowerCase(), pos: String(v.part_of_speech||'').trim(), meaning: String(v.meaning||'').trim() }));
  let cards = [];
  try { cards = fromKV(dg); } catch {}
  if (!cards || cards.length === 0) {
    try { cards = fromKV(pb); } catch {}
  }
  if (!cards || cards.length === 0) {
    // fallback to vocabulary_explanation
    cards = (dg.structure?.vocabulary_explanation || []).map(v => ({ word: String(v.phrase||'').toLowerCase(), pos: '', meaning: String(v.meaning||'').trim() }));
  }

  // Ensure data dirs
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_AUDIO, { recursive: true });

  // Copy main and podcast audios to public for local serving
  const mainAudio = 'englishpod_B0001dg.mp3';
  const podcastAudio = 'englishpod_B0001pb.mp3';
  if (fs.existsSync(path.join(EX_DIR, mainAudio))) fs.copyFileSync(path.join(EX_DIR, mainAudio), path.join(PUBLIC_AUDIO, '1_main.mp3'));
  if (fs.existsSync(path.join(EX_DIR, podcastAudio))) fs.copyFileSync(path.join(EX_DIR, podcastAudio), path.join(PUBLIC_AUDIO, '1_podcast.mp3'));

  // Write files
  const meta = {
    id: '1',
    lesson_no: 1,
    title: 'Difficult Customer',
    level: 'Elementary',
    tags: ['restaurant', 'dialogue'],
    audio_url: 'http://localhost:3000/audio/1_main.mp3',
    duration: 300,
    published: true,
  };
  fs.writeFileSync(path.join(DATA_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'transcript.json'), JSON.stringify({ lesson_no: 1, title: meta.title, level: meta.level, segments }, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'vocab.json'), JSON.stringify({ cards }, null, 2));

  // Podcast (host dialogue) meta + transcript
  const podcastMeta = { audio_url: 'http://localhost:3000/audio/1_podcast.mp3', title: pb.title, level: pb.level || 'Elementary' };
  let podcastSegments = [];
  if (Array.isArray(pb.dialogue) && pb.dialogue.length) {
    podcastSegments = pb.dialogue.map((d, idx) => ({ idx, speaker: d.speaker || 'HOST', text: d.line || d.text || '' }));
  } else if (pb.structure) {
    const partsPB = [];
    const pushPB = (arr) => arr && arr.forEach((x) => partsPB.push({ speaker: x.speaker || 'HOST', text: x.line || String(x) }));
    pushPB(pb.structure.introduction || []);
    if (pb.structure.dialogue_first_time) partsPB.push({ speaker: 'HOST', text: String(pb.structure.dialogue_first_time) });
    const ve = pb.structure.vocabulary_explanation || [];
    ve.forEach((entry) => {
      const phrase = entry.phrase || entry.word || '';
      const meaning = entry.meaning || '';
      if (phrase) partsPB.push({ speaker: 'HOST', text: `${phrase}${meaning ? ' — ' + meaning : ''}` });
      const exs = entry.examples || [];
      exs.forEach((ex) => {
        if (typeof ex === 'string') partsPB.push({ speaker: 'HOST', text: ex });
        else if (ex && (ex.line || ex.text)) partsPB.push({ speaker: ex.speaker || 'HOST', text: ex.line || ex.text });
      });
    });
    if (pb.structure.dialogue_second_time) partsPB.push({ speaker: 'HOST', text: String(pb.structure.dialogue_second_time) });
    pushPB(pb.structure.discussion || []);
    pushPB(pb.structure.closing || []);
    podcastSegments = partsPB.map((d, idx) => ({ idx, speaker: d.speaker, text: d.text }));
  }
  fs.writeFileSync(path.join(DATA_DIR, 'podcast_meta.json'), JSON.stringify(podcastMeta, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'podcast_transcript.json'), JSON.stringify({ dialogue: podcastSegments }, null, 2));

  // Update index
  const indexPath = path.join(process.cwd(), 'data', 'lessons', 'index.json');
  let index = [];
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); } catch {}
  const brief = { id: '1', lessonNo: 1, title: meta.title, level: meta.level, duration: meta.duration, tags: meta.tags };
  const i = index.findIndex(x => x.id === '1');
  if (i >= 0) index[i] = brief; else index.push(brief);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log('Sample built from example. Segments:', segments.length, 'Cards:', cards.length);
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { splitSentences, toSegments, extractPhrases };
