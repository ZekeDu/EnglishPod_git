import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type ImportMode = 'validate' | 'import';

type ZipRun = {
  fileName: string;
  mode: ImportMode;
  status: 'success' | 'error';
  report?: any;
  error?: string;
  startedAt: string;
};

export default function AdminImportPage() {
  const [me, setMe] = useState<any>(null);
  const [mode, setMode] = useState<ImportMode>('validate');
  const [autoPublish, setAutoPublish] = useState(false);
  const [overwrite, setOverwrite] = useState<string[]>(['all']);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [runs, setRuns] = useState<ZipRun[]>([]);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('');

  // 读取配置（兼容旧格式）
  useEffect(() => {
    try {
      const s = localStorage.getItem('ep_import_opts');
      if (!s) return;
      const o = JSON.parse(s);
      if (o) {
        if (o.mode === 'import' || o.mode === 'validate') {
          setMode(o.mode);
        } else if (typeof o.dryRun === 'boolean') {
          setMode(o.dryRun ? 'validate' : 'import');
        }
        if (typeof o.autoPublish === 'boolean') {
          setAutoPublish(o.autoPublish);
        } else if (typeof o.publish === 'boolean') {
          setAutoPublish(o.publish);
        }
        if (Array.isArray(o.overwrite)) setOverwrite(o.overwrite);
      }
    } catch { }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('ep_import_opts', JSON.stringify({ mode, autoPublish, overwrite }));
    } catch { }
  }, [mode, autoPublish, overwrite]);

  // 校验模式不允许自动发布
  useEffect(() => {
    if (mode === 'validate' && autoPublish) setAutoPublish(false);
  }, [mode, autoPublish]);

  // 获取用户信息
  useEffect(() => {
    (async () => {
      try {
        const m = await fetch(`${API}/me`, { credentials: 'include' }).then((r) => r.json());
        setMe(m.data);
      } catch { }
    })();
  }, []);

  const summary = useMemo(() => {
    const totals = { archives: runs.length, lessons: 0, success: 0, failed: 0 };
    runs.forEach((run) => {
      if (run.report) {
        const rep = run.report;
        totals.lessons += Number(rep?.total || 0);
        totals.success += Number(rep?.success || 0);
        totals.failed += Number(rep?.failed || 0);
      }
    });
    return totals;
  }, [runs]);

  const handleZipSelection = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSelectedFiles(Array.from(files));
    setMsg('');
  };

  const startImport = async () => {
    if (selectedFiles.length === 0) {
      setMsg('请先选择一个或多个 Zip 文件');
      return;
    }
    setProcessing(true);
    setMsg(mode === 'validate' ? '正在校验...' : '正在导入...');

    const params = new URLSearchParams();
    if (mode === 'validate') params.set('dry_run', '1');
    if (mode === 'import' && autoPublish) params.set('publish', '1');
    if (overwrite.length) params.set('overwrite', overwrite.join(','));

    const results: ZipRun[] = [];
    for (const file of selectedFiles) {
      const startedAt = new Date().toISOString();
      try {
        const res = await fetch(`${API}/admin/import/zip?${params.toString()}`, {
          method: 'POST',
          body: file,
          headers: { 'Content-Type': 'application/zip' },
          credentials: 'include',
        });
        let payload: any = null;
        try {
          payload = await res.json();
        } catch { }
        if (!res.ok) {
          const errMsg =
            payload?.data?.error || payload?.error || payload?.message || '导入失败';
          throw new Error(errMsg);
        }
        results.push({
          fileName: file.name,
          mode,
          status: 'success',
          report: payload?.data || null,
          startedAt,
        });
      } catch (err: any) {
        results.push({
          fileName: file.name,
          mode,
          status: 'error',
          error: err?.message || String(err),
          startedAt,
        });
      }
    }

    setRuns((prev) => [...results.reverse(), ...prev]);
    setSelectedFiles([]);
    setProcessing(false);
    setMsg(mode === 'validate' ? '校验完成' : '导入完成');
  };

  const buttonLabel = processing
    ? mode === 'validate'
      ? '正在校验...'
      : '正在导入...'
    : mode === 'validate'
      ? '开始校验'
      : '开始导入';

  if (!me) return <main className="container"><p>未登录，请先 <a href="/login">登录</a></p></main>;
  if (me.role !== 'admin') return <main className="container"><p>无权限，需要管理员账户。</p></main>;

  return (
    <main className="container">
      <header className="app-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <a className="button ghost" href="/admin">返回管理</a>
          <span />
        </div>
        <h1 className="app-title" style={{ fontSize: 28, margin: 0 }}>批量导入（lessons.zip）</h1>
      </header>

      {msg && <p className="inline-note" style={{ color: msg.includes('失败') ? 'crimson' : '#16a34a' }}>{msg}</p>}

      <section className="panel">
        <div className="panel-bd" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              <input
                type="radio"
                name="import-mode"
                value="validate"
                checked={mode === 'validate'}
                onChange={() => setMode('validate')}
              />{' '}
              仅校验（dry-run）
            </label>
            <label>
              <input
                type="radio"
                name="import-mode"
                value="import"
                checked={mode === 'import'}
                onChange={() => setMode('import')}
              />{' '}
              导入到课程
            </label>
            <label style={{ opacity: mode === 'validate' ? 0.5 : 1 }}>
              <input
                type="checkbox"
                disabled={mode === 'validate'}
                checked={mode === 'import' && autoPublish}
                onChange={(e) => setAutoPublish(e.currentTarget.checked)}
              />{' '}
              导入后自动发布
            </label>
            <div>
              覆盖模块：
              <select
                multiple
                value={overwrite}
                onChange={(e) => {
                  const opts = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
                  setOverwrite(opts.length ? opts : ['all']);
                }}
              >
                {['all', 'meta', 'transcript', 'vocab', 'practice', 'podcast'].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="muted">
            每个 Zip 应包含 `lessons.json` 以及可选的 `audio/` 目录（一个压缩包对应一门课程）。支持一次选择多个 Zip 文件，系统会按顺序处理。
          </div>

          <div className="toolbar" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="button ghost" htmlFor="zipfile" style={{ marginBottom: 0 }}>
              {selectedFiles.length ? '重新选择 Zip' : '选择 Zip 文件'}
            </label>
            <input
              id="zipfile"
              type="file"
              accept=".zip,application/zip"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                handleZipSelection(e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />
            <button
              className="button"
              onClick={startImport}
              disabled={processing || selectedFiles.length === 0}
            >
              {buttonLabel}
            </button>
            <a className="button ghost" href="/docs/import-format.html" target="_blank" rel="noreferrer">
              查看导入格式说明
            </a>
            <button className="button ghost" onClick={() => downloadTemplate()}>
              下载 lessons.json 模板
            </button>
            <button className="button" onClick={() => { window.location.href = `${API}/admin/import/sample.zip`; }}>
              下载示例 Zip
            </button>
          </div>

          {selectedFiles.length > 0 && (
            <div className="muted">
              已选择：{selectedFiles.map((f) => f.name).join('，')}
            </div>
          )}
        </div>
      </section>

      {runs.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-hd">本次结果</div>
          <div className="panel-bd" style={{ display: 'grid', gap: 12 }}>
            <div>
              <strong>压缩包：</strong>{summary.archives}，
              <strong>课程总数：</strong>{summary.lessons}，
              <strong>成功：</strong>{summary.success}，
              <strong>失败：</strong>{summary.failed}
            </div>
            <div className="toolbar" style={{ gap: 12 }}>
              <button className="button ghost" onClick={() => exportFailuresCSV(runs)}>
                导出失败项 CSV
              </button>
              <button className="button ghost" onClick={() => setRuns([])}>
                清空结果
              </button>
            </div>
            <div className="list" style={{ display: 'grid', gap: 12 }}>
              {runs.map((run, idx) => (
                <div key={`${run.fileName}-${run.startedAt}-${idx}`} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{run.fileName}</strong>
                    <span className="muted">
                      {run.mode === 'validate' ? '校验' : '导入'} · {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </div>
                  {run.status === 'error' ? (
                    <p style={{ color: 'crimson', marginTop: 8 }}>{run.error}</p>
                  ) : (
                    <details style={{ marginTop: 8 }}>
                      <summary className="muted">查看明细</summary>
                      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(run.report, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function downloadTemplate() {
  const tmpl = {
    version: '1.2',
    lessons: [
      {
        id: '1',
        meta: {
          title: 'Lesson 1 Title',
          level: 'Elementary',
          tags: ['tag1', 'tag2'],
          audio: { file: '1_main.mp3' },
          duration: 300,
          published: false,
        },
        transcript: {
          segments: [{ idx: 0, start_sec: 0.5, end_sec: 1.8, text_en: 'Hello!' }],
        },
        vocab: {
          cards: [{ word: 'example', meaning: '示例' }],
        },
        practice: {
          cloze: {
            passage: 'I {1} English.',
            items: [{ index: 1, options: ['like', 'likes'], answer: 'like' }],
          },
          essay: {
            prompt: 'Write...',
            min_words: 30,
            max_words: 200,
          },
        },
        podcast: {
          meta: {},
          audio: { file: '1_podcast.mp3' },
          transcript: { dialogue: [{ idx: 0, speaker: 'M', text: 'Hello' }] },
        },
      },
    ],
  };
  const blob = new Blob([JSON.stringify(tmpl, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lessons.json';
  a.click();
}

function exportFailuresCSV(runs: ZipRun[]) {
  try {
    const rows: string[][] = [['archive', 'mode', 'lesson_id', 'status', 'errors']];
    runs.forEach((run) => {
      if (run.status === 'error') {
        rows.push([run.fileName, run.mode, '', 'error', run.error || '']);
        return;
      }
      const items = Array.isArray(run.report?.items) ? run.report.items : [];
      items
        .filter((item: any) => item?.status === 'failed' || (item?.errors && item.errors.length > 0))
        .forEach((item: any) => {
          rows.push([
            run.fileName,
            run.mode,
            String(item?.id || ''),
            String(item?.status || 'failed'),
            Array.isArray(item?.errors) ? item.errors.join('|') : String(item?.errors || ''),
          ]);
        });
    });
    if (rows.length === 1) {
      alert('没有失败项');
      return;
    }
    const csv = rows
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'import-failures.csv';
    a.click();
  } catch {
    alert('导出失败');
  }
}
