import { useEffect, useMemo, useState } from 'react';
import styles from '../models.module.css';
import { Button, Card } from '../../../../components/ui';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type TTSProviders = {
  local?: { base?: string; voice?: string };
  azure?: { region?: string; key?: string; voice?: string };
  aliyun?: {
    accessKeyId?: string;
    accessKeySecret?: string;
    appKey?: string;
    region?: string;
    voice?: string;
    sampleRate?: number;
  };
};

const makeProviders = (): TTSProviders => ({
  local: { base: '', voice: '' },
  azure: { region: '', key: '', voice: '' },
  aliyun: { accessKeyId: '', accessKeySecret: '', appKey: '', region: 'cn-shanghai', voice: '', sampleRate: 16000 },
});

export default function TTSConfig() {
  const [me, setMe] = useState<any>(null);
  const [cfg, setCfg] = useState<any>({ enabled: false, provider: 'local', providers: makeProviders() });
  const [msg, setMsg] = useState('');
  const providers = useMemo<TTSProviders>(() => ({ ...makeProviders(), ...(cfg?.providers || {}) }), [cfg?.providers]);

  useEffect(() => {
    (async () => {
      try {
        const m = await fetch(`${API}/me`, { credentials: 'include' }).then((r) => r.json());
        setMe(m.data);
      } catch {}
      try {
        const c = await fetch(`${API}/admin/model-services/tts`, { credentials: 'include' }).then((r) => r.json());
        const d = c.data || {};
        const mergedProviders = makeProviders();
        if (d.providers) {
          mergedProviders.local = { ...mergedProviders.local, ...(d.providers.local || {}) };
          mergedProviders.azure = { ...mergedProviders.azure, ...(d.providers.azure || {}) };
          mergedProviders.aliyun = { ...mergedProviders.aliyun, ...(d.providers.aliyun || {}) };
        }
        setCfg({
          enabled: !!d.enabled,
          provider: d.provider || 'local',
          providers: mergedProviders,
        });
      } catch {}
    })();
  }, []);

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

  const save = async () => {
    setMsg('');
    const payload = {
      enabled: !!cfg.enabled,
      provider: cfg.provider || 'local',
      providers: {
        local: providers.local,
        azure: providers.azure,
        aliyun: providers.aliyun,
      },
    };
    const resp = await fetch(`${API}/admin/model-services/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
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
      body: JSON.stringify({ kind: 'tts', provider: cfg.provider }),
    });
    const json = await resp.json();
    if (resp.ok) {
      const latency = json?.data?.latency_ms ? ` (${json.data.latency_ms} ms)` : '';
      setMsg(`健康检查通过：${cfg.provider}${latency}`);
    } else {
      const missing = Array.isArray(json?.data?.missing) ? json.data.missing.join(', ') : '';
      setMsg(`健康检查失败：${missing || json?.data?.error || '未知错误'}`);
    }
  };

  const updateProvider = (name: keyof TTSProviders, value: any) => {
    setCfg((prev: any) => ({
      ...prev,
      providers: {
        ...(prev.providers || {}),
        [name]: value,
      },
    }));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button as="a" href="/admin/settings/models" variant="ghost" size="sm">
          返回模型服务管理
        </Button>
        <h1 className={styles.title}>TTS 语音服务配置</h1>
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
            启用 TTS 服务（关闭时使用预置音色）
          </label>
        </div>
        <div className={styles.fieldGroup}>
          <label>服务提供商</label>
          <select
            className={styles.input}
            value={cfg.provider || 'local'}
            onChange={(e) => setCfg({ ...cfg, provider: e.currentTarget.value })}
          >
            <option value="local">本地服务</option>
            <option value="azure">Azure</option>
            <option value="aliyun">阿里云</option>
          </select>
        </div>
      </Card>

      {cfg.provider === 'local' && (
        <ProviderLocal value={providers.local || {}} onChange={(v) => updateProvider('local', v)} />
      )}
      {cfg.provider === 'azure' && (
        <ProviderAzure value={providers.azure || {}} onChange={(v) => updateProvider('azure', v)} />
      )}
      {cfg.provider === 'aliyun' && (
        <ProviderAliyun value={providers.aliyun || {}} onChange={(v) => updateProvider('aliyun', v)} />
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

function ProviderLocal({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <Card className={styles.form}>
      <h3 className={styles.cardTitle}>本地服务</h3>
      <div className={styles.fieldGroup}>
        <label>服务地址（可选）</label>
        <input
          className={styles.input}
          value={value.base || ''}
          onChange={(e) => onChange({ ...value, base: e.currentTarget.value })}
          placeholder="http://localhost:5005"
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>默认音色标识</label>
        <input
          className={styles.input}
          value={value.voice || ''}
          onChange={(e) => onChange({ ...value, voice: e.currentTarget.value })}
          placeholder="如：en-US-Standard-B"
        />
      </div>
    </Card>
  );
}

function ProviderAzure({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <Card className={styles.form}>
      <h3 className={styles.cardTitle}>Azure Speech</h3>
      <div className={styles.fieldGroup}>
        <label>Region</label>
        <input
          className={styles.input}
          value={value.region || ''}
          onChange={(e) => onChange({ ...value, region: e.currentTarget.value })}
          placeholder="如：eastasia"
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>Subscription Key</label>
        <input
          className={styles.input}
          type="password"
          value={value.key || ''}
          onChange={(e) => onChange({ ...value, key: e.currentTarget.value })}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label>默认音色</label>
        <input
          className={styles.input}
          value={value.voice || ''}
          onChange={(e) => onChange({ ...value, voice: e.currentTarget.value })}
          placeholder="如：en-US-JennyNeural"
        />
      </div>
    </Card>
  );
}

function ProviderAliyun({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <Card className={styles.form}>
      <h3 className={styles.cardTitle}>阿里云语音合成</h3>
      <div className={styles.twoCol}>
        <div className={styles.fieldGroup}>
          <label>AccessKey ID</label>
          <input
            className={styles.input}
            value={value.accessKeyId || ''}
            onChange={(e) => onChange({ ...value, accessKeyId: e.currentTarget.value })}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label>AccessKey Secret</label>
          <input
            className={styles.input}
            type="password"
            value={value.accessKeySecret || ''}
            onChange={(e) => onChange({ ...value, accessKeySecret: e.currentTarget.value })}
          />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label>App Key</label>
        <input
          className={styles.input}
          value={value.appKey || ''}
          onChange={(e) => onChange({ ...value, appKey: e.currentTarget.value })}
        />
      </div>
      <div className={styles.twoCol}>
        <div className={styles.fieldGroup}>
          <label>Region</label>
          <input
            className={styles.input}
            value={value.region || 'cn-shanghai'}
            onChange={(e) => onChange({ ...value, region: e.currentTarget.value })}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label>默认音色</label>
          <input
            className={styles.input}
            value={value.voice || ''}
            onChange={(e) => onChange({ ...value, voice: e.currentTarget.value })}
            placeholder="如：xiaoyun"
          />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label>采样率</label>
        <input
          className={styles.input}
          type="number"
          value={value.sampleRate || 16000}
          onChange={(e) => onChange({ ...value, sampleRate: Number(e.currentTarget.value) })}
        />
      </div>
    </Card>
  );
}
