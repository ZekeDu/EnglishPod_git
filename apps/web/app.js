const API = location.origin.replace(/\/$/, '');
const audio = document.getElementById('audio');
const rateSel = document.getElementById('rate');
const segList = document.getElementById('segments');
const btnLoad = document.getElementById('btn-load');
const currentText = document.getElementById('current-text');
const btnRecStart = document.getElementById('rec-start');
const btnRecStop = document.getElementById('rec-stop');
const scoreBox = document.getElementById('score');

let lessonId = '1';
let segments = [];
let activeIdx = -1;
let mediaRecorder = null;
let chunks = [];

function fmt(t){ return t.toFixed(2) + 's'; }

async function loadLesson() {
  // meta
  const meta = await fetch(`${API}/lessons/${lessonId}`).then(r => r.json()).then(j=>j.data);
  audio.src = meta.audio_url || '';
  // transcript
  segments = await fetch(`${API}/lessons/${lessonId}/transcript`).then(r => r.json()).then(j=> {
    const data = Array.isArray(j.data?.segments) ? j.data.segments : [];
    return data.map((seg, idx) => {
      const start = Number(seg.start_sec) || 0;
      const next = data[idx + 1];
      const nextStart = next && Number(next.start_sec);
      let end = Number(seg.end_sec);
      if (!Number.isFinite(end) || end <= start) {
        if (Number.isFinite(nextStart) && nextStart > start) end = nextStart;
        else if (audio.duration && audio.duration > start) end = audio.duration;
        else end = start + 3;
      }
      return { ...seg, start_sec: start, end_sec: end };
    });
  });
  renderSegments();
}

function renderSegments(){
  segList.innerHTML = '';
  segments.forEach(seg => {
    const li = document.createElement('li');
    li.dataset.idx = seg.idx;
    li.innerHTML = `<span class="time">${fmt(seg.start_sec)}</span>${seg.text_en}`;
    li.addEventListener('click', () => {
      audio.currentTime = seg.start_sec + 0.01;
      audio.play();
      setActive(seg.idx);
    });
    segList.appendChild(li);
  });
}

function setActive(idx){
  activeIdx = idx;
  [...segList.children].forEach(li => li.classList.toggle('active', Number(li.dataset.idx)===idx));
  const seg = segments.find(s => s.idx === idx);
  if (seg) {
    currentText.textContent = seg.text_en;
    // scroll into view
    const el = [...segList.children].find(li => Number(li.dataset.idx)===idx);
    if (el) el.scrollIntoView({ block: 'center' });
  }
}

function onTimeUpdate(){
  const t = audio.currentTime || 0;
  // binary search
  let lo = 0, hi = segments.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid];
    if (t < s.start_sec) { hi = mid - 1; }
    else if (t > s.end_sec) { lo = mid + 1; }
    else { found = s.idx; break; }
  }
  if (found !== -1 && found !== activeIdx) setActive(found);
}

async function startRec(){
  alert('跟读评分功能已下线');
}

function stopRec(){ btnRecStart.disabled = false; btnRecStop.disabled = true; }

audio.addEventListener('timeupdate', onTimeUpdate);
rateSel.addEventListener('change', () => { audio.playbackRate = Number(rateSel.value); });
btnLoad.addEventListener('click', loadLesson);
btnRecStart.addEventListener('click', startRec);
btnRecStop.addEventListener('click', stopRec);

// 自动加载
loadLesson();
