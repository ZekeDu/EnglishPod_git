import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from './adminLesson.module.css';
import { Button, Card, Badge } from '../../../components/ui';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function AdminLessonEdit() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const [me, setMe] = useState<any>(null);
  const [pkg, setPkg] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [versions, setVersions] = useState<{file:string;version:number;ts:string;reason?:string}[]>([]);
  const [qc, setQc] = useState<{warnings:string[];errors:string[]}|null>(null);
  const [showTranscriptRaw, setShowTranscriptRaw] = useState(false);
  const [showVocabRaw, setShowVocabRaw] = useState(false);
  const [showPracticeRaw, setShowPracticeRaw] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'lesson' | 'podcast' | 'vocab' | 'practice'>('lesson');

  const tabs: { key: 'lesson' | 'podcast' | 'vocab' | 'practice'; label: string }[] = [
    { key: 'lesson', label: '课文' },
    { key: 'podcast', label: '播客' },
    { key: 'vocab', label: '词汇' },
    { key: 'practice', label: '练习' },
  ];

  useEffect(() => { (async () => {
    try { const m = await fetch(`${API}/me`, { credentials: 'include' }).then(r=>r.json()); setMe(m.data); } catch {}
  })(); }, []);

  useEffect(() => { if (!id) return; (async () => {
    setMsg('');
    try {
      const r = await fetch(`${API}/admin/lessons/${id}`, { credentials: 'include' });
      const j = await r.json();
      if (r.ok) {
        setPkg(j.data);
        setShowTranscriptRaw(false);
        setShowVocabRaw(false);
        setShowPracticeRaw(false);
      } else setMsg(j?.data?.error || '加载失败');
    } catch { setMsg('加载失败'); }
    try {
      const vr = await fetch(`${API}/admin/lessons/${id}/versions`, { credentials:'include' });
      const vj = await vr.json();
      if (vr.ok) setVersions(vj.data?.versions || []);
    } catch {}
    try {
      const qr = await fetch(`${API}/admin/lessons/${id}/qc`, { credentials:'include' });
      const qj = await qr.json();
      if (qr.ok) setQc(qj.data);
    } catch {}
  })(); }, [id]);

  const save = async (path: string, body: any) => {
    setMsg('');
    const r = await fetch(`${API}/admin/lessons/${id}/${path}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(j?.data?.error || '保存失败'); return j; }
    if (path === 'transcript') {
      const warnings = Number(j?.data?.qc?.warnings?.length || 0);
      const errors = Number(j?.data?.qc?.errors?.length || 0);
      if (errors > 0) setMsg('已保存，但仍有时间戳错误待修正');
      else if (warnings > 0) setMsg('已保存，存在时间戳警告');
      else setMsg('已保存');
    } else {
      setMsg('已保存');
    }
    return j;
  };

  const handleDelete = async () => {
    if (!id) return;
    const confirmId = prompt(`删除课程 #${id}，请输入课程编号确认：`) || '';
    if (confirmId.trim() !== id) return;
    const purge = window.confirm('是否同时删除本地上传的音频文件？选择“确定”将一并删除。');
    setDeleting(true);
    setMsg('');
    try {
      const query = purge ? '?purgeUploads=1' : '';
      const r = await fetch(`${API}/admin/lessons/${id}${query}`, { method: 'DELETE', credentials: 'include' });
      const j = await r.json();
      if (r.ok) {
        alert('课程已删除');
        router.push('/admin');
      } else {
        setMsg(j?.data?.error || '删除失败');
      }
    } catch {
      setMsg('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  if (!me) {
    return (
      <div className={styles.page}>
        <Card>
          <p>
            未登录，请先 <a href="/login">登录</a>
          </p>
        </Card>
      </div>
    );
  }
  if (me.role !== 'admin') {
    return (
      <div className={styles.page}>
        <Card>
          <p>无权限，需要管理员账户。</p>
        </Card>
      </div>
    );
  }
  if (!pkg) {
    return (
      <div className={styles.page}>
        <Card>
          <p>加载中...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button as="a" href="/admin" variant="ghost" size="sm">
          返回列表
        </Button>
        <div className={styles.headerInfo}>
          <div className={styles.inlineActions}>
            <Badge variant="muted">课程 #{id}</Badge>
            {pkg?.meta?.published ? <Badge variant="success">已发布</Badge> : <Badge variant="muted">草稿</Badge>}
          </div>
          <h1 className={styles.heading}>{pkg?.meta?.title || '编辑课程'}</h1>
          <p className="muted">维护课程基础信息、字幕、词汇与练习内容</p>
        </div>
        <div className={styles.headerActions}>
          <Button as="a" href={`/lesson/${id}`} variant="ghost" size="sm" target="_blank" rel="noreferrer">
            预览课程页
          </Button>
          <Button
            variant="ghost"
            size="sm"
            style={{ color: 'crimson', borderColor: 'rgba(220,38,38,0.4)' }}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? '正在删除…' : '删除课程'}
          </Button>
        </div>
      </header>

      {msg && <Card className={styles.notice}>{msg}</Card>}

      <div className={styles.tabBar}>
        <div className={styles.tabNav}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'lesson' && (
          <Card className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>课文</h2>
                <p className={styles.sectionDescription}>维护课程基础信息、主音频与逐句字幕</p>
              </div>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.subSection}>
                <div className={styles.subSectionHeader}>
                  <div>
                    <h3 className={styles.subSectionTitle}>基础信息</h3>
                    <p className={styles.subSectionHint}>更新标题、难度、标签与发布状态</p>
                  </div>
                </div>
                <div className={styles.subSectionBody}>
                  <MetaForm meta={pkg.meta || {}} onSave={(meta) => save('meta', meta)} />
                  <div className={styles.inlineActions}>
                    <input
                      id="file-main-audio"
                      type="file"
                      accept="audio/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const f = e.currentTarget.files?.[0];
                        if (!f) return;
                        try {
                          const ext = f.name.split('.').pop() || 'mp3';
                          const presign = await fetch(`${API}/upload/presign?ext=${encodeURIComponent(ext)}`).then((r) => r.json());
                          const u = presign.data;
                          const uploadUrl = /^https?:/i.test(u.url) ? u.url : `${API}${u.url}`;
                          await fetch(uploadUrl, { method: u.method, headers: u.headers || {}, body: f });
                          let dur = 0;
                          try {
                            dur = await getAudioDuration(URL.createObjectURL(f));
                          } catch {}
                          const resp = await fetch(`${API}/admin/lessons/${id}/audio/attach`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ type: 'main', url: u.finalUrl, duration: dur }),
                          });
                          const json = await resp.json();
                          if (!resp.ok) throw new Error(json?.data?.error || 'attach failed');
                          alert('课文音频已更新');
                          try {
                            const mr = await fetch(`${API}/admin/lessons/${id}`, { credentials: 'include' });
                            const mj = await mr.json();
                            if (mr.ok) setPkg(mj.data);
                          } catch {}
                        } catch {
                          alert('上传失败');
                        }
                      }}
                    />
                    <Button as="label" htmlFor="file-main-audio" variant="ghost" size="sm">
                      上传课文音频
                    </Button>
                  </div>
                </div>
              </div>

              <div className={styles.subSection}>
                <div className={styles.subSectionHeader}>
                  <div>
                    <h3 className={styles.subSectionTitle}>逐句字幕</h3>
                    <p className={styles.subSectionHint}>编辑时间戳并查看质检结果</p>
                  </div>
                  <div className={styles.sectionActions}>
                    <Button as="a" href={`/align/${id}`} variant="ghost" size="sm" target="_blank" rel="noreferrer">
                      对齐/校正
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowTranscriptRaw((v) => !v)}>
                      {showTranscriptRaw ? '收起 JSON' : '查看原始 JSON'}
                    </Button>
                  </div>
                </div>
                <div className={styles.subSectionBody}>
                  <TranscriptEditor
                    transcript={pkg.transcript}
                    onSave={async (segments) => {
                      const res = await save('transcript', { segments });
                      if (res?.data?.qc) setQc(res.data.qc);
                      if (res?.code === 200) {
                        setPkg((prev: any) => ({ ...prev, transcript: { segments } }));
                        try {
                          const r = await fetch(`${API}/admin/lessons/${id}/qc`, { credentials: 'include' });
                          const j = await r.json();
                          if (r.ok) setQc(j.data);
                        } catch {}
                      }
                    }}
                  />
                  {qc ? (
                    <div className={styles.stack}>
                      {qc.errors?.length > 0 && (
                        <div className="inline-note" style={{ color: 'crimson' }}>
                          存在错误（发布将被拦截）：
                          <ul>{qc.errors.map((e, i) => (<li key={i}>{e}</li>))}</ul>
                        </div>
                      )}
                      {qc.warnings?.length > 0 && (
                        <div className="inline-note" style={{ color: '#b45309' }}>
                          警告（可保存/可发布）：
                          <ul>{qc.warnings.map((w, i) => (<li key={i}>{w}</li>))}</ul>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            const r = await fetch(`${API}/admin/lessons/${id}/qc`, { credentials: 'include' });
                            const j = await r.json();
                            if (r.ok) setQc(j.data);
                          } catch {}
                        }}
                      >
                        刷新质检
                      </Button>
                    </div>
                  ) : (
                    <p className="muted">暂无质检结果</p>
                  )}
                  {showTranscriptRaw && (
                    <div className={styles.jsonPanel}>
                      <JsonEditor
                        value={pkg.transcript || { segments: [] }}
                        onSave={async (value) => {
                          const res = await save('transcript', value);
                          if (res?.data?.qc) setQc(res.data.qc);
                          if (res?.code === 200) {
                            setPkg((prev: any) => ({ ...prev, transcript: value }));
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'vocab' && (
          <Card className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>词汇</h2>
                <p className={styles.sectionDescription}>维护词汇卡片，并可一次性预生成 TTS</p>
              </div>
              <div className={styles.sectionActions}>
                <Button variant="ghost" size="sm" onClick={() => setShowVocabRaw((v) => !v)}>
                  {showVocabRaw ? '收起 JSON' : '查看原始 JSON'}
                </Button>
              </div>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.subSection}>
                <div className={styles.subSectionHeader}>
                  <div>
                    <h3 className={styles.subSectionTitle}>词汇列表</h3>
                    <p className={styles.subSectionHint}>集中维护课程词汇，保存后自动同步练习与复习模块</p>
                  </div>
                  <div className={styles.sectionActions} style={{ marginLeft: 'auto' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        setMsg('');
                        try {
                          const resp = await fetch(`${API}/admin/lessons/${id}/tts/prefetch`, { method: 'POST', credentials: 'include' });
                          const json = await resp.json();
                          if (resp.ok) setMsg(`已预生成：${json.data.created}，跳过：${json.data.skipped}`);
                          else setMsg(json?.data?.error || '预生成失败');
                        } catch {
                          setMsg('预生成失败');
                        }
                      }}
                    >
                      预生成课程词汇 TTS
                    </Button>
                  </div>
                </div>
                <div className={styles.subSectionBody}>
                  <VocabEditor
                    vocab={pkg.vocab}
                    onSave={async (cards) => {
                      const res = await save('vocab', { cards });
                      if (res?.code === 200) {
                        setPkg((prev: any) => ({ ...prev, vocab: { cards } }));
                      }
                    }}
                  />
                </div>
              </div>
              {showVocabRaw && (
                <div className={styles.jsonPanel}>
                  <JsonEditor
                    value={pkg.vocab || { cards: [] }}
                    onSave={async (value) => {
                      const res = await save('vocab', value);
                      if (res?.code === 200) {
                        setPkg((prev: any) => ({ ...prev, vocab: value }));
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'podcast' && (
          <Card className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>播客</h2>
                <p className={styles.sectionDescription}>维护播客元数据与音频文件</p>
              </div>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.subSection}>
                <div className={styles.subSectionBody}>
                  <JsonEditor value={pkg.podcast || {}} onSave={async (v) => { await save('podcast', v); }} />
                  <div className={styles.inlineActions}>
                    <input
                      id="file-podcast-audio"
                      type="file"
                      accept="audio/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const f = e.currentTarget.files?.[0];
                        if (!f) return;
                        try {
                          const ext = f.name.split('.').pop() || 'mp3';
                          const presign = await fetch(`${API}/upload/presign?ext=${encodeURIComponent(ext)}`).then((r) => r.json());
                          const u = presign.data;
                          const uploadUrl = /^https?:/i.test(u.url) ? u.url : `${API}${u.url}`;
                          await fetch(uploadUrl, { method: u.method, headers: u.headers || {}, body: f });
                          let dur = 0;
                          try {
                            dur = await getAudioDuration(URL.createObjectURL(f));
                          } catch {}
                          const resp = await fetch(`${API}/admin/lessons/${id}/audio/attach`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ type: 'podcast', url: u.finalUrl, duration: dur }),
                          });
                          const json = await resp.json();
                          if (!resp.ok) throw new Error(json?.data?.error || 'attach failed');
                          alert('播客音频已更新');
                          try {
                            const mr = await fetch(`${API}/admin/lessons/${id}`, { credentials: 'include' });
                            const mj = await mr.json();
                            if (mr.ok) setPkg(mj.data);
                          } catch {}
                        } catch {
                          alert('上传失败');
                        }
                      }}
                    />
                    <Button as="label" htmlFor="file-podcast-audio" variant="ghost" size="sm">
                      上传播客音频文件
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'practice' && (
          <Card className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>练习</h2>
                <p className={styles.sectionDescription}>编辑完形填空与作文配置，保持与线上体验一致</p>
              </div>
              <div className={styles.sectionActions}>
                <Button variant="ghost" size="sm" onClick={() => setShowPracticeRaw((v) => !v)}>
                  {showPracticeRaw ? '收起 JSON' : '查看原始 JSON'}
                </Button>
              </div>
            </div>
            <div className={styles.sectionBody}>
              <PracticeForm
                practice={pkg.practice}
                onSave={async ({ cloze, essay }) => {
                  const res = await save('practice', { cloze: cloze ?? null, essay: essay ?? null });
                  if (res?.code === 200) {
                    setPkg((prev: any) => ({ ...prev, practice: { cloze: cloze ?? null, essay: essay ?? null } }));
                  }
                }}
              />
              {showPracticeRaw && (
                <div className={styles.jsonPanel}>
                  <JsonEditor
                    value={pkg.practice || {}}
                    onSave={async (value) => {
                      const res = await save('practice', value);
                      if (res?.code === 200) {
                        setPkg((prev: any) => ({ ...prev, practice: value }));
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      <Card className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>版本与回滚</h2>
        </div>
        <div className={styles.sectionBody}>
          {versions.length === 0 ? (
            <p className="muted">暂无历史快照</p>
          ) : (
            <div className={styles.inlineActions}>
              <select id="ver" defaultValue={versions.slice(0, 5)[0]?.file}>
                {versions.slice(0, 5).map((v) => (
                  <option key={v.file} value={v.file}>
                    v{v.version} · {new Date(v.ts).toLocaleString()}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const sel = (document.getElementById('ver') as HTMLSelectElement).value;
                  const resp = await fetch(`${API}/admin/lessons/${id}/rollback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ file: sel }),
                  });
                  const json = await resp.json();
                  if (resp.ok) {
                    setMsg('已回滚');
                    location.reload();
                  } else {
                    setMsg(json?.data?.error || '回滚失败');
                  }
                }}
              >
                回滚
              </Button>
            </div>
          )}
        </div>
      </Card>

    </div>
  );
}

function MetaForm({ meta, onSave }: { meta: any, onSave: (m:any)=>void }){
  const [m, setM] = useState<any>(meta);
  const [tagsInput, setTagsInput] = useState<string>((meta?.tags || []).join(', '));
  // 当上层 pkg.meta 变化（例如上传音频后自动写入 audio_url）时，同步到本地表单状态
  useEffect(() => {
    setM(meta);
    setTagsInput((meta?.tags || []).join(', '));
  }, [meta]);
  const handleTagsChange = (val: string) => {
    setTagsInput(val);
    const tags = val.split(',').map((x) => x.trim()).filter(Boolean);
    setM((prev: any) => ({ ...prev, tags }));
  };
  return (
    <div className={styles.stack}>
      <div className={styles.fieldGroup}>
        <label>标题（title）</label>
        <input
          className={styles.input}
          value={m.title || ''}
          onChange={(e) => setM({ ...m, title: e.currentTarget.value })}
          placeholder="如：Difficult Customer"
        />
      </div>
      <div className={styles.twoCol}>
        <div className={styles.fieldGroup}>
          <label>难度（level）</label>
          <select
            className={`${styles.input}`}
            value={m.level || ''}
            onChange={(e) => setM({ ...m, level: e.currentTarget.value })}
          >
            <option value="">未设置</option>
            <option>Elementary</option>
            <option>Intermediate</option>
            <option>Upper-Intermediate</option>
          </select>
        </div>
        <div className={styles.fieldGroup}>
          <label>时长（duration, 秒）</label>
          <input
            className={styles.input}
            type="number"
            value={m.duration || 0}
            onChange={(e) => setM({ ...m, duration: Number(e.currentTarget.value) })}
            placeholder="单位：秒"
          />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label>标签（tags）</label>
        <input
          className={styles.input}
          value={tagsInput}
          onChange={(e) => handleTagsChange(e.currentTarget.value)}
          placeholder="逗号分隔：restaurant, dialogue"
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>课文音频 URL（自动维护）</label>
        <input className={styles.input} value={m.audio_url || ''} readOnly placeholder="通过“上传课文音频”自动生成" />
        <span className="muted">如需更换音频，请使用上方“上传课文音频”按钮；此字段只读。</span>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={!!m.published} onChange={(e) => setM({ ...m, published: e.currentTarget.checked })} /> 已发布
        </label>
      </div>
      <div className={styles.buttonRow} style={{ justifyContent: 'flex-end' }}>
        <Button size="sm" onClick={() => onSave(m)}>
          保存基础信息
        </Button>
      </div>
    </div>
  );
}

const randomKey = () =>
  typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

type SegmentForm = {
  key: string;
  start_sec: string;
  end_sec: string;
  text_en: string;
  textZh?: string;
};

type SegmentOutput = {
  idx: number;
  start_sec: number;
  end_sec: number;
  text_en: string;
  text_zh?: string;
};

function TranscriptEditor({
  transcript,
  onSave,
}: {
  transcript: any;
  onSave: (segments: SegmentOutput[]) => Promise<void>;
}) {
  const [segments, setSegments] = useState<SegmentForm[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Array.isArray(transcript?.segments)) {
      setSegments(
        transcript.segments.map((seg: any) => ({
          key: randomKey(),
          start_sec: seg?.start_sec !== undefined ? String(seg.start_sec) : '',
          end_sec: seg?.end_sec !== undefined ? String(seg.end_sec) : '',
          text_en: seg?.text_en || '',
          textZh: seg?.text_zh || '',
        })),
      );
    } else {
      setSegments([]);
    }
  }, [JSON.stringify(transcript)]);

  const update = (idx: number, field: keyof SegmentForm, value: string) => {
    setSegments((prev) =>
      prev.map((seg, i) => (i === idx ? { ...seg, [field]: value } : seg)),
    );
  };

  const addSegment = () => {
    setSegments((prev) => [
      ...prev,
      { key: randomKey(), start_sec: '', end_sec: '', text_en: '', textZh: '' },
    ]);
  };

  const removeSegment = (idx: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveSegment = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= segments.length) return;
    setSegments((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const handleSave = async () => {
    const normalized: SegmentOutput[] = [];
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const start = Number(seg.start_sec);
      const end = Number(seg.end_sec);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        setError('开始/结束时间必须是数字');
        return;
      }
      if (seg.text_en.trim().length === 0) {
        setError('英文文本不能为空');
        return;
      }
      const item: SegmentOutput = {
        idx: i,
        start_sec: start,
        end_sec: end,
        text_en: seg.text_en.trim(),
      };
      const zh = seg.textZh?.trim();
      if (zh) item.text_zh = zh;
      normalized.push(item);
    }
    setError('');
    setSaving(true);
    try {
      await onSave(normalized);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.stack}>
      {segments.length === 0 && <p className="muted">暂无字幕段落，点击下方按钮新增。</p>}
      <div className={styles.itemList}>
        {segments.map((seg, idx) => (
          <div key={seg.key} className={styles.itemCard}>
            <div className={styles.twoCol}>
              <div className={styles.fieldGroup}>
                <label>开始秒</label>
                <input
                  className={styles.input}
                  type="number"
                  value={seg.start_sec}
                  onChange={(e) => update(idx, 'start_sec', e.currentTarget.value)}
                  placeholder="0"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label>结束秒</label>
                <input
                  className={styles.input}
                  type="number"
                  value={seg.end_sec}
                  onChange={(e) => update(idx, 'end_sec', e.currentTarget.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label>英文台词</label>
              <textarea
                className={styles.textarea}
                rows={2}
                value={seg.text_en}
                onChange={(e) => update(idx, 'text_en', e.currentTarget.value)}
              />
            </div>
            <div className={styles.itemActions}>
              <Button variant="ghost" size="sm" onClick={() => moveSegment(idx, -1)} disabled={idx === 0}>
                上移
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => moveSegment(idx, 1)}
                disabled={idx === segments.length - 1}
              >
                下移
              </Button>
              <Button variant="ghost" size="sm" style={{ color: 'crimson' }} onClick={() => removeSegment(idx)}>
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.buttonRow} style={{ justifyContent: 'space-between' }}>
        <Button variant="ghost" size="sm" onClick={addSegment}>
          新增段落
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存字幕'}
        </Button>
      </div>
      {error && <p className="inline-note" style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}

const POS_OPTIONS = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Phrase', 'Expression', 'Idiom', 'Other'];

type VocabCardForm = {
  key: string;
  id: string;
  word: string;
  phrase: string;
  meaning: string;
  pos: string;
  examplesText: string;
  extra: Record<string, any>;
};

function VocabEditor({
  vocab,
  onSave,
}: {
  vocab: any;
  onSave: (cards: any[]) => Promise<void>;
}) {
  const [cards, setCards] = useState<VocabCardForm[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Array.isArray(vocab?.cards)) {
      setCards(
        vocab.cards.map((card: any) => {
          const {
            id = '',
            word = '',
            meaning = '',
            pos = '',
            phrase = '',
            definition: _definition, // legacy 字段，保留在 extra 里但不展示
            examples = [],
            ...extra
          } = card || {};
          const examplesText = Array.isArray(examples) ? examples.join('\n') : '';
          const meaningValue = String(meaning || _definition || '');
          return {
            key: randomKey(),
            id: String(id || ''),
            word: String(word || ''),
            phrase: String(phrase || ''),
            meaning: meaningValue,
            pos: String(pos || ''),
            examplesText,
            extra: { ...extra, ...( _definition ? { definition: _definition } : {}) },
          };
        }),
      );
    } else {
      setCards([]);
    }
  }, [JSON.stringify(vocab)]);

  const update = (idx: number, field: keyof VocabCardForm, value: string) => {
    setCards((prev) =>
      prev.map((card, i) => (i === idx ? { ...card, [field]: value } : card)),
    );
  };

  const addCard = () => {
    setCards((prev) => [
      ...prev,
      {
        key: randomKey(),
        id: '',
        word: '',
        phrase: '',
        meaning: '',
        pos: '',
        examplesText: '',
        extra: {},
      },
    ]);
  };

  const removeCard = (idx: number) => {
    setCards((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveCard = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= cards.length) return;
    setCards((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const handleSave = async () => {
    const normalized: any[] = [];
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      const id = card.id.trim() || `card-${i + 1}`;
      const word = card.word.trim() || card.phrase.trim();
      if (!word) {
        setError('词汇列表中存在空白的“词/短语”，请填写或删除该行。');
        return;
      }
      const meaning = card.meaning.trim();
      if (!meaning) {
        setError('必须填写释义。');
        return;
      }
      const examples = card.examplesText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
                const { definition: _legacyDefinition, ...restExtra } = card.extra || {};
                void _legacyDefinition;
      const payload: any = {
        id,
        word,
        meaning,
        ...restExtra,
      };
      if (card.pos.trim()) payload.pos = card.pos.trim();
      if (card.phrase.trim()) payload.phrase = card.phrase.trim();
      if (examples.length > 0) payload.examples = examples;
      normalized.push(payload);
    }
    setError('');
    setSaving(true);
    try {
      await onSave(normalized);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.stack}>
      {cards.length === 0 && <p className="muted">暂无词汇，点击下方按钮新增。</p>}
      <div className={styles.itemList}>
        {cards.map((card, idx) => (
          <div key={card.key} className={styles.itemCard}>
            <div className={styles.twoCol}>
              <div className={styles.fieldGroup}>
                <label>词卡 ID（系统自动）</label>
                <div style={{ fontWeight: 600 }}>{card.id || `card-${idx + 1}`}</div>
              </div>
              <div className={styles.fieldGroup}>
                <label>词性（可选）</label>
                <select
                  className={styles.input}
                  value={POS_OPTIONS.includes(card.pos) ? card.pos : ''}
                  onChange={(e) => update(idx, 'pos', e.currentTarget.value)}
                >
                  <option value="">未设置</option>
                  {POS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.input}
                  placeholder="或自定义词性"
                  value={POS_OPTIONS.includes(card.pos) ? '' : card.pos}
                  onChange={(e) => update(idx, 'pos', e.currentTarget.value)}
                />
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label>词 / 短语</label>
              <input
                className={styles.input}
                value={card.word}
                onChange={(e) => update(idx, 'word', e.currentTarget.value)}
                placeholder="例：grab"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label>释义（必填）</label>
              <textarea
                className={styles.textarea}
                rows={2}
                value={card.meaning}
                onChange={(e) => update(idx, 'meaning', e.currentTarget.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label>例句（每行一条）</label>
              <textarea
                className={styles.textarea}
                rows={3}
                value={card.examplesText}
                onChange={(e) => update(idx, 'examplesText', e.currentTarget.value)}
                placeholder="每行一个例句，可留空"
              />
            </div>
            <div className={styles.itemActions}>
              <Button variant="ghost" size="sm" onClick={() => moveCard(idx, -1)} disabled={idx === 0}>
                上移
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => moveCard(idx, 1)}
                disabled={idx === cards.length - 1}
              >
                下移
              </Button>
              <Button variant="ghost" size="sm" style={{ color: 'crimson' }} onClick={() => removeCard(idx)}>
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.buttonRow} style={{ justifyContent: 'space-between' }}>
        <Button variant="ghost" size="sm" onClick={addCard}>
          新增词汇
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存词汇'}
        </Button>
      </div>
      {error && <p className="inline-note" style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}

function JsonEditor({ value, onSave }: { value: any; onSave: (v: any) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState('');

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);
      setError('');
      onSave(parsed);
    } catch (e: any) {
      setError(`JSON 格式错误：${e.message}`);
    }
  };

  return (
    <div className={styles.stack}>
      <textarea
        className={styles.textarea}
        rows={12}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      {error && <p className="inline-note" style={{ color: 'crimson' }}>{error}</p>}
      <div className={styles.buttonRow} style={{ justifyContent: 'flex-end' }}>
        <Button size="sm" onClick={handleSave}>
          保存 JSON
        </Button>
      </div>
    </div>
  );
}

type ClozeItemForm = {
  key: string;
  index: string;
  answer: string;
  analysis: string;
  optionsText: string;
};

type PracticePayload = {
  cloze: any | null;
  essay: any | null;
};

function PracticeForm({
  practice,
  onSave,
}: {
  practice: any;
  onSave: (payload: PracticePayload) => Promise<void>;
}) {
  const [clozePassage, setClozePassage] = useState('');
  const [clozeItems, setClozeItems] = useState<ClozeItemForm[]>([]);
  const [essayPrompt, setEssayPrompt] = useState('');
  const [essayMin, setEssayMin] = useState<string>('30');
  const [essayMax, setEssayMax] = useState<string>('200');
  const [rubric, setRubric] = useState<Record<string, string>>({ spelling: '1', grammar: '1', clarity: '1' });
  const [newRubricKey, setNewRubricKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (practice?.cloze) {
      setClozePassage(practice.cloze.passage || '');
      setClozeItems(
        (practice.cloze.items || []).map((item: any) => ({
          key: randomKey(),
          index: item?.index !== undefined ? String(item.index) : '',
          answer: item?.answer || '',
          analysis: item?.analysis || '',
          optionsText: Array.isArray(item?.options) ? item.options.join('\n') : '',
        })),
      );
    } else {
      setClozePassage('');
      setClozeItems([]);
    }
    if (practice?.essay) {
      setEssayPrompt(practice.essay.prompt || '');
      setEssayMin(String(practice.essay.min_words ?? 30));
      setEssayMax(String(practice.essay.max_words ?? 200));
      const rub: Record<string, string> = {};
      Object.entries(practice.essay.rubric || { spelling: 1, grammar: 1, clarity: 1 }).forEach(([k, v]) => {
        rub[k] = String(v);
      });
      setRubric(rub);
    } else {
      setEssayPrompt('');
      setEssayMin('30');
      setEssayMax('200');
      setRubric({ spelling: '1', grammar: '1', clarity: '1' });
    }
    setError('');
  }, [JSON.stringify(practice)]);

  const addClozeItem = () => {
    setClozeItems((prev) => [
      ...prev,
      {
        key: randomKey(),
        index: String(prev.length + 1),
        answer: '',
        analysis: '',
        optionsText: '',
      },
    ]);
  };

  const updateClozeItem = (idx: number, field: keyof ClozeItemForm, value: string) => {
    setClozeItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  };

  const moveClozeItem = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= clozeItems.length) return;
    setClozeItems((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const removeClozeItem = (idx: number) => {
    setClozeItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addRubricKey = () => {
    const key = newRubricKey.trim();
    if (!key || rubric[key] !== undefined) return;
    setRubric((prev) => ({ ...prev, [key]: '1' }));
    setNewRubricKey('');
  };

  const removeRubricKey = (key: string) => {
    setRubric((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    let clozePayload: any | null = null;
    let essayPayload: any | null = null;

    if (clozePassage.trim() || clozeItems.some((item) => item.answer.trim())) {
      if (!clozePassage.trim()) {
        setError('请填写完形填空的段落内容。');
        return;
      }
      const items = clozeItems
        .map((item, idx) => {
          const answer = item.answer.trim();
          const options = item.optionsText
            .split('\n')
            .map((opt) => opt.trim())
            .filter((opt) => opt.length > 0);
          if (!answer || options.length === 0) return null;
          const indexValue = Number(item.index);
          return {
            index: Number.isFinite(indexValue) ? indexValue : idx + 1,
            answer,
            options,
            ...(item.analysis.trim() ? { analysis: item.analysis.trim() } : {}),
          };
        })
        .filter(Boolean);
      if (items.length === 0) {
        setError('请至少填写一题完形填空，并补全选项与答案。');
        return;
      }
      clozePayload = {
        passage: clozePassage,
        items,
      };
    }

    if (essayPrompt.trim()) {
      const minWords = Number(essayMin);
      const maxWords = Number(essayMax);
      if (!Number.isFinite(minWords) || !Number.isFinite(maxWords)) {
        setError('作文字数限制必须是数字。');
        return;
      }
      if (minWords > maxWords) {
        setError('作文最小字数不能大于最大字数。');
        return;
      }
      const rubricObj: Record<string, number> = {};
      Object.entries(rubric).forEach(([key, value]) => {
        const num = Number(value);
        rubricObj[key] = Number.isFinite(num) ? num : 0;
      });
      essayPayload = {
        prompt: essayPrompt,
        min_words: minWords,
        max_words: maxWords,
        rubric: rubricObj,
      };
    }

    setError('');
    setSaving(true);
    try {
      await onSave({ cloze: clozePayload, essay: essayPayload });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.stack}>
      <div className={styles.subSection}>
        <div className={styles.subSectionHeader}>
          <div>
            <h3 className={styles.subSectionTitle}>完形填空</h3>
            <p className={styles.subSectionHint}>使用 {`{1}`}、{`{2}`} 占位符标记空格，保存后自动回填练习</p>
          </div>
          <div className={styles.sectionActions}>
            <Button variant="ghost" size="sm" onClick={addClozeItem}>
              新增填空
            </Button>
          </div>
        </div>
        <div className={styles.subSectionBody}>
          <div className={styles.fieldGroup}>
            <label>原文</label>
            <textarea
              className={styles.textarea}
              rows={5}
              value={clozePassage}
              onChange={(e) => setClozePassage(e.currentTarget.value)}
              placeholder="请粘贴课文，并使用 {1}、{2} 等占位符标记空格位置"
            />
          </div>
          {clozeItems.length === 0 && <p className="muted">暂无填空题，点击右上角按钮新增。</p>}
          <div className={styles.itemList}>
            {clozeItems.map((item, idx) => (
              <div key={item.key} className={styles.itemCard}>
                <div className={styles.twoCol}>
                  <div className={styles.fieldGroup}>
                    <label>题号</label>
                    <input
                      className={styles.input}
                      type="number"
                      value={item.index}
                      onChange={(e) => updateClozeItem(idx, 'index', e.currentTarget.value)}
                      placeholder={`${idx + 1}`}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label>正确答案</label>
                    <input
                      className={styles.input}
                      value={item.answer}
                      onChange={(e) => updateClozeItem(idx, 'answer', e.currentTarget.value)}
                      placeholder="如：take"
                    />
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label>选项（每行一个）</label>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={item.optionsText}
                    onChange={(e) => updateClozeItem(idx, 'optionsText', e.currentTarget.value)}
                    placeholder={'例如：\ntake\ngo with\nrecommend'}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>解析（可选）</label>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={item.analysis}
                    onChange={(e) => updateClozeItem(idx, 'analysis', e.currentTarget.value)}
                    placeholder="如需为学生提供讲解，可填写在此"
                  />
                </div>
                <div className={styles.itemActions}>
                  <Button variant="ghost" size="sm" onClick={() => moveClozeItem(idx, -1)} disabled={idx === 0}>
                    上移
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveClozeItem(idx, 1)}
                    disabled={idx === clozeItems.length - 1}
                  >
                    下移
                  </Button>
                  <Button variant="ghost" size="sm" style={{ color: 'crimson' }} onClick={() => removeClozeItem(idx)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.subSection}>
        <div className={styles.subSectionHeader}>
          <div>
            <h3 className={styles.subSectionTitle}>小作文</h3>
            <p className={styles.subSectionHint}>配置作文题目、字数区间与评分维度</p>
          </div>
        </div>
        <div className={styles.subSectionBody}>
          <div className={styles.fieldGroup}>
            <label>题目</label>
            <textarea
              className={styles.textarea}
              rows={4}
              value={essayPrompt}
              onChange={(e) => setEssayPrompt(e.currentTarget.value)}
              placeholder="请填写作文题目与要求"
            />
          </div>
          <div className={styles.twoCol}>
            <div className={styles.fieldGroup}>
              <label>最少词数</label>
              <input
                className={styles.input}
                type="number"
                value={essayMin}
                onChange={(e) => setEssayMin(e.currentTarget.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label>最多词数</label>
              <input
                className={styles.input}
                type="number"
                value={essayMax}
                onChange={(e) => setEssayMax(e.currentTarget.value)}
              />
            </div>
          </div>
          <div className={styles.stack}>
            <div className={styles.inlineActions}>
              <input
                className={styles.input}
                value={newRubricKey}
                onChange={(e) => setNewRubricKey(e.currentTarget.value)}
                placeholder="新增评分维度，如：fluency"
              />
              <Button variant="ghost" size="sm" onClick={addRubricKey}>
                添加
              </Button>
            </div>
            <div className={styles.itemList}>
              {Object.entries(rubric).map(([key, value]) => (
                <div key={key} className={styles.rubricRow}>
                  <strong>{key}</strong>
                  <input
                    className={styles.input}
                    type="number"
                    value={value}
                    onChange={(e) =>
                      setRubric((prev) => ({ ...prev, [key]: e.currentTarget.value }))
                    }
                    style={{ maxWidth: 100 }}
                  />
                  <Button variant="ghost" size="sm" style={{ color: 'crimson' }} onClick={() => removeRubricKey(key)}>
                    删除
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="inline-note" style={{ color: 'crimson' }}>{error}</p>}
      <div className={styles.buttonRow} style={{ justifyContent: 'flex-end' }}>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存练习'}
        </Button>
      </div>
    </div>
  );
}

async function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.src = url;
    a.onloadedmetadata = () => { resolve(isFinite(a.duration) ? a.duration : 0); };
    a.onerror = () => resolve(0);
  });
}
