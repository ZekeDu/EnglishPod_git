import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type ImportPayload = { id: string; meta?: any; transcript?: any; vocab?: any; practice?: { cloze?: any; essay?: any } };

export default function AdminImportPage(){
  const [me, setMe] = useState<any>(null);
  const [payload, setPayload] = useState<ImportPayload>({ id: '' });
  const [msg, setMsg] = useState('');
  const [report, setReport] = useState<any>(null);
  const [zipReport, setZipReport] = useState<any>(null);
  const [dryRun, setDryRun] = useState(true);
  const [publish, setPublish] = useState(false);
  const [overwrite, setOverwrite] = useState<string[]>(['all']);

  // 读取/保存导入选项（本地持久化）
  useEffect(()=>{
    try{
      const s = localStorage.getItem('ep_import_opts');
      if (s){ const o = JSON.parse(s); if (typeof o.dryRun==='boolean') setDryRun(o.dryRun); if (typeof o.publish==='boolean') setPublish(o.publish); if (Array.isArray(o.overwrite)) setOverwrite(o.overwrite); }
    }catch{}
  },[]);
  useEffect(()=>{
    try{ localStorage.setItem('ep_import_opts', JSON.stringify({ dryRun, publish, overwrite })); }catch{}
  },[dryRun, publish, overwrite]);

  useEffect(()=>{ (async()=>{ try{ const m = await fetch(`${API}/me`, { credentials:'include' }).then(r=>r.json()); setMe(m.data);}catch{}})(); },[]);

  const onFile = (field: 'meta'|'transcript'|'vocab'|'cloze'|'essay', file?: File|null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result||'{}'));
        setPayload(prev => {
          const next = { ...prev } as any;
          if (field==='cloze' || field==='essay') {
            next.practice = next.practice || {};
            next.practice[field] = json;
          } else {
            next[field] = json;
          }
          return next;
        });
      } catch(e:any){ setMsg('JSON 解析失败: '+e.message); }
    };
    reader.readAsText(file);
  };

  const submit = async () => {
    setMsg(''); setReport(null);
    if (!payload.id) { setMsg('请填写课程 ID'); return; }
    const r = await fetch(`${API}/admin/import/json`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify(payload) });
    const j = await r.json();
    if (r.ok) { setReport(j.data); setMsg('导入完成'); } else { setMsg(j?.data?.error || '导入失败'); }
  };

  if (!me) return <main className="container"><p>未登录，请先 <a href="/login">登录</a></p></main>;
  if (me.role !== 'admin') return <main className="container"><p>无权限，需要管理员账户。</p></main>;

  return (
    <main className="container">
      <header className="app-header">
        <a className="button ghost" href="/admin">返回管理</a>
        <h1 className="app-title" style={{fontSize:28}}>批量导入（JSON）</h1>
        <span />
      </header>

      {msg && <p className="inline-note" style={{color: msg==='导入完成'?'#16a34a':'crimson'}}>{msg}</p>}

      <section className="panel">
        <div className="panel-bd" style={{display:'grid', gap:12}}>
          <div>
            <label>课程 ID（数字目录名）：</label>
            <input value={payload.id} onChange={e=>setPayload(p=>({ ...p, id: e.currentTarget.value }))} placeholder="如：1" />
          </div>
          <div style={{display:'grid', gap:8}}>
            <label>meta.json</label>
            <input type="file" accept="application/json" onChange={e=>onFile('meta', e.currentTarget.files?.[0])} />
            <label>transcript.json</label>
            <input type="file" accept="application/json" onChange={e=>onFile('transcript', e.currentTarget.files?.[0])} />
            <label>vocab.json</label>
            <input type="file" accept="application/json" onChange={e=>onFile('vocab', e.currentTarget.files?.[0])} />
            <label>practice/cloze.json</label>
            <input type="file" accept="application/json" onChange={e=>onFile('cloze', e.currentTarget.files?.[0])} />
            <label>practice/essay.json</label>
            <input type="file" accept="application/json" onChange={e=>onFile('essay', e.currentTarget.files?.[0])} />
          </div>
          <div className="toolbar"><button className="button" onClick={submit}>开始导入</button></div>
        </div>
      </section>

      <section className="panel" style={{marginTop:16}}>
        <div className="panel-hd">批量导入（Zip：lessons.json + audio/*）</div>
        <div className="panel-bd">
          <div className="toolbar" style={{gap:12, flexWrap:'wrap'}}>
            <label><input type="checkbox" checked={dryRun} onChange={e=>setDryRun(e.currentTarget.checked)} /> 仅校验（dry-run）</label>
            <label><input type="checkbox" checked={publish} onChange={e=>setPublish(e.currentTarget.checked)} /> 导入后自动发布</label>
            <div>
              覆盖模块：
              <select multiple value={overwrite} onChange={e=>{
                const opts = Array.from(e.currentTarget.selectedOptions).map(o=>o.value);
                setOverwrite(opts.length? opts: ['all']);
              }}>
                {['all','meta','transcript','vocab','practice','podcast'].map(k=> (<option key={k} value={k}>{k}</option>))}
              </select>
            </div>
            <a className="button ghost" href="/docs/import-format.html" target="_blank" rel="noreferrer">查看导入格式说明</a>
            <button className="button ghost" onClick={()=>downloadTemplate()}>下载 lessons.json 模板</button>
            <button className="button" onClick={()=>{ window.location.href = `${API}/admin/import/sample.zip`; }}>下载示例 Zip</button>
          </div>
          <input id="zipfile" type="file" accept=".zip,application/zip" onChange={async (e)=>{
            const f = e.currentTarget.files?.[0]; if (!f) return;
            setMsg(''); setZipReport(null);
            try{
              const qp = new URLSearchParams();
              if (dryRun) qp.set('dry_run','1');
              if (publish) qp.set('publish','1');
              if (overwrite.length) qp.set('overwrite', overwrite.join(','));
              const r = await fetch(`${API}/admin/import/zip?${qp.toString()}`, { method:'POST', body: f, headers: { 'Content-Type':'application/zip' }, credentials:'include' });
              const j = await r.json();
              if (r.ok) setZipReport(j.data); else setMsg(j?.data?.error||'导入失败');
            }catch{ setMsg('导入失败'); }
          }} />
          {zipReport && (
            <div className="card" style={{marginTop:12}}>
              <div><strong>总数：</strong>{zipReport.total}，<strong>成功：</strong>{zipReport.success}，<strong>失败：</strong>{zipReport.failed}</div>
              <div className="toolbar" style={{marginTop:8}}>
                <button className="button ghost" onClick={()=>exportFailuresCSV(zipReport)}>导出失败项 CSV</button>
              </div>
              <details style={{marginTop:8}}>
                <summary className="muted">查看明细</summary>
                <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(zipReport.items, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      </section>

      {report && (
        <section className="panel" style={{marginTop:16}}>
          <div className="panel-hd">导入报告</div>
          <div className="panel-bd">
            <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(report, null, 2)}</pre>
          </div>
        </section>
      )}
    </main>
  );
}

function downloadTemplate(){
  const tmpl = {
    version: '1.1',
    lessons: [
      {
        id: '1',
        meta: { title: 'Lesson 1 Title', level: 'Elementary', tags: ['tag1','tag2'], audio: { file: '1_main.mp3' }, duration: 300, published: false },
        transcript: { segments: [ { idx:0, start_sec:0.50, end_sec:1.80, text_en:'Hello!' } ] },
        vocab: { cards: [ { word:'example', meaning:'示例' } ] },
        practice: { cloze: { passage: 'I {1} English.', items:[{ index:1, options:['like','likes'], answer:'like' }] }, essay: { prompt:'Write...', min_words:30, max_words:200 } },
        podcast: { meta: { }, audio: { file: '1_podcast.mp3' }, transcript: { dialogue: [ { idx:0, speaker:'M', text:'Hello' } ] } }
      }
    ]
  };
  const blob = new Blob([JSON.stringify(tmpl, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lessons.json';
  a.click();
}

function exportFailuresCSV(report: any){
  try{
    const items = Array.isArray(report?.items) ? report.items : [];
    const failed = items.filter((x:any)=>x.status==='failed');
    if (failed.length===0){ alert('没有失败项'); return; }
    const rows = [['id','status','errors']].concat(failed.map((x:any)=>[x.id, x.status, Array.isArray(x.errors)? x.errors.join('|'): (x.errors||'')]));
    const csv = rows.map(r=>r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'import-failures.csv'; a.click();
  }catch{ alert('导出失败'); }
}
