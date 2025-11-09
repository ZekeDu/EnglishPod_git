import { useEffect, useState } from 'react';
import styles from '../models.module.css';
import { Button, Card } from '../../../../components/ui';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function ScoringConfig() {
  const [me, setMe] = useState<any>(null);
  const [cfg, setCfg] = useState<any>({
    enabled: false,
    provider: 'ollama',
    providers: { ollama: { base: 'http://localhost:11434', model: 'llama3:instruct', timeout: 8000 } },
  });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const m = await fetch(`${API}/me`, { credentials: 'include' }).then((r) => r.json());
        setMe(m.data);
      } catch {}
      try {
        const c = await fetch(`${API}/admin/model-services/scoring`, { credentials: 'include' }).then((r) => r.json());
        const d = c.data || {};
        if (d.provider === 'local') d.provider = 'ollama';
        setCfg(d);
      } catch {}
    })();
  }, []);

  const save = async () => {
    setMsg('');
    const resp = await fetch(`${API}/admin/model-services/scoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(cfg),
    });
    const json = await resp.json();
    setMsg(resp.ok ? '已保存' : json?.data?.error || '保存失败');
  };

  const health = async () => {
    setMsg('');
    const resp = await fetch(`${API}/admin/model-services/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ kind: 'scoring', provider: cfg.provider }),
    });
    const json = await resp.json();
    setMsg(resp.ok ? `健康检查通过：${cfg.provider}` : `健康检查失败：缺少 ${(json?.data?.missing || []).join(',')}`);
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

  const pv = (name: string) => (cfg.providers?.[name] || (cfg.providers[name] = {}, cfg.providers[name]));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button as="a" href="/admin/settings/models" variant="ghost" size="sm">
          返回模型服务管理
        </Button>
        <h1 className={styles.title}>评分服务配置</h1>
      </header>

      {msg && <Card className={styles.notice}>{msg}</Card>}

      <Card className={styles.form}>
        <div className={styles.fieldGroup}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={!!cfg.enabled}
              onChange={(e) => setCfg({ ...cfg, enabled: e.currentTarget.checked })}
            />
            启用评分服务（未启用时使用本地占位评分）
          </label>
        </div>
        <div className={styles.fieldGroup}>
          <label>Provider</label>
          <select
            className={styles.input}
            value={cfg.provider === 'local' ? 'ollama' : cfg.provider || 'ollama'}
            onChange={(e) => setCfg({ ...cfg, provider: e.currentTarget.value })}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama（本地）</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>
      </Card>

      {cfg.provider === 'openai' && (
        <ProviderOpenAI v={pv('openai')} onChange={(v: any) => setCfg({ ...cfg, providers: { ...cfg.providers, openai: v } })} />
      )}
      {cfg.provider === 'gemini' && (
        <ProviderGemini v={pv('gemini')} onChange={(v: any) => setCfg({ ...cfg, providers: { ...cfg.providers, gemini: v } })} />
      )}
      {cfg.provider === 'ollama' && (
        <ProviderOllama v={pv('ollama')} onChange={(v: any) => setCfg({ ...cfg, providers: { ...cfg.providers, ollama: v } })} />
      )}
      {cfg.provider === 'deepseek' && (
        <ProviderDeepSeek v={pv('deepseek')} onChange={(v: any) => setCfg({ ...cfg, providers: { ...cfg.providers, deepseek: v } })} />
      )}

      <div className={styles.buttonRow}>
        <Button size="sm" onClick={save}>
          保存配置
        </Button>
        <Button variant="ghost" size="sm" onClick={health}>
          健康检查
        </Button>
      </div>
    </div>
  );
}

function ProviderOpenAI({ v, onChange }: { v: any; onChange: (x: any) => void }) {
  return (
    <Card className={styles.form}>
      <h3 className={styles.cardTitle}>OpenAI</h3>
      <div className={styles.fieldGroup}>
        <label>API Base（可选代理）</label>
        <input
          className={styles.input}
          value={v.base || ''}
          onChange={(e) => onChange({ ...v, base: e.currentTarget.value })}
          placeholder="https://api.openai.com/v1"
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>API Key（敏感）</label>
        <input
          className={styles.input}
          type="password"
          value={v.apiKey || ''}
          onChange={(e) => onChange({ ...v, apiKey: e.currentTarget.value })}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>Model</label>
        <input
          className={styles.input}
          value={v.model || ''}
          onChange={(e) => onChange({ ...v, model: e.currentTarget.value })}
          placeholder="gpt-4o-mini"
        />
      </div>
      <div className={styles.twoCol}>
        <div className={styles.fieldGroup}>
          <label>Timeout(ms)</label>
          <input
            className={styles.input}
            type="number"
            value={v.timeout || 8000}
            onChange={(e) => onChange({ ...v, timeout: Number(e.currentTarget.value) })}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label>MaxTokens</label>
          <input
            className={styles.input}
            type="number"
            value={v.maxTokens || 512}
            onChange={(e) => onChange({ ...v, maxTokens: Number(e.currentTarget.value) })}
          />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label>Temperature</label>
        <input
          className={styles.input}
          type="number"
          step="0.1"
          value={v.temperature || 0}
          onChange={(e) => onChange({ ...v, temperature: Number(e.currentTarget.value) })}
        />
      </div>
    </Card>
  );
}

function ProviderGemini({ v, onChange }: { v: any; onChange: (x: any) => void }) {
  return (
    <Card className={styles.form}>
      <h3 className={styles.cardTitle}>Gemini</h3>
      <div className={styles.fieldGroup}>
        <label>API Key</label>
        <input
          className={styles.input}
          type="password"
          value={v.apiKey || ''}
          onChange={(e) => onChange({ ...v, apiKey: e.currentTarget.value })}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>Model</label>
        <input
          className={styles.input}
          value={v.model || ''}
          onChange={(e) => onChange({ ...v, model: e.currentTarget.value })}
          placeholder="gemini-1.5-pro-latest"
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>Timeout(ms)</label>
        <input
          className={styles.input}
          type="number"
          value={v.timeout || 8000}
          onChange={(e) => onChange({ ...v, timeout: Number(e.currentTarget.value) })}
        />
      </div>
    </Card>
  );
}

function ProviderOllama({ v, onChange }: { v: any; onChange: (x: any) => void }) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const load = async (base?: string) => {
    setLoading(true); setErr('');
    try {
      const u = new URL(`${API}/admin/model-services/ollama/models`);
      if (base) u.searchParams.set('base', base);
      const r = await fetch(u.toString(), { credentials:'include' });
      const j = await r.json();
      if (r.ok) setModels(j.data?.models||[]); else setErr(j?.data?.error||'加载失败');
    } catch (e: any) { setErr(e?.message||'加载失败'); }
    setLoading(false);
  };
  useEffect(()=>{ load(v.base); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [v.base]);
  return (
    <Card className={styles.form}>
      <h3 className={styles.cardTitle}>Ollama（本地）</h3>
      <div className={styles.fieldGroup}>
        <label>Base</label>
        <div className={styles.inlineActions}>
          <input
            className={styles.input}
            value={v.base || 'http://localhost:11434'}
            onChange={(e) => onChange({ ...v, base: e.currentTarget.value })}
          />
          <Button variant="ghost" size="sm" type="button" onClick={() => load(v.base)}>
            刷新模型
          </Button>
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label>Model</label>
        <select
          className={styles.input}
          value={v.model || ''}
          onChange={(e) => onChange({ ...v, model: e.currentTarget.value })}
        >
          <option value="">请选择模型</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {loading && <span className="muted">加载模型列表...</span>}
      {err && <span className="inline-note" style={{ color: 'crimson' }}>{err}</span>}
      <div className={styles.fieldGroup}>
        <label>Timeout(ms)</label>
        <input
          className={styles.input}
          type="number"
          value={v.timeout || 8000}
          onChange={(e) => onChange({ ...v, timeout: Number(e.currentTarget.value) })}
        />
      </div>
    </Card>
  );
}

function ProviderDeepSeek({ v, onChange }: { v: any; onChange: (x: any) => void }) {
  return (
    <Card className={styles.form}>
      <h3 className={styles.cardTitle}>DeepSeek</h3>
      <div className={styles.fieldGroup}>
        <label>API Base</label>
        <input
          className={styles.input}
          value={v.base || 'https://api.deepseek.com'}
          onChange={(e) => onChange({ ...v, base: e.currentTarget.value })}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>API Key</label>
        <input
          className={styles.input}
          type="password"
          value={v.apiKey || ''}
          onChange={(e) => onChange({ ...v, apiKey: e.currentTarget.value })}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>Model</label>
        <input
          className={styles.input}
          value={v.model || 'deepseek-chat'}
          onChange={(e) => onChange({ ...v, model: e.currentTarget.value })}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>Timeout(ms)</label>
        <input
          className={styles.input}
          type="number"
          value={v.timeout || 8000}
          onChange={(e) => onChange({ ...v, timeout: Number(e.currentTarget.value) })}
        />
      </div>
    </Card>
  );
}
