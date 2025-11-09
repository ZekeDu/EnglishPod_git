import { useEffect, useState } from 'react';
import styles from './models.module.css';
import { Button, Card, Badge } from '../../../components/ui';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function ModelsIndex() {
  const [me, setMe] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await fetch(`${API}/me`, { credentials: 'include' }).then((r) => r.json());
        setMe(m.data);
      } catch {}
      try {
        const c = await fetch(`${API}/admin/model-services`, { credentials: 'include' }).then((r) => r.json());
        setCfg(c.data || {});
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button as="a" href="/admin" variant="ghost" size="sm">
          返回管理
        </Button>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>模型服务管理</h1>
          <p className={styles.subtitle}>统一管理语音合成与评分服务的接入状态</p>
        </div>
        <Badge variant="muted">Beta</Badge>
      </header>

      <section className={styles.grid}>
        <Card className={styles.serviceCard}>
          <div className={styles.serviceHeader}>
            <h2 className={styles.cardTitle}>语音合成（TTS）</h2>
            <Badge variant={cfg?.tts?.enabled ? 'success' : 'muted'}>
              {cfg?.tts?.enabled ? '已启用' : '未启用'}
            </Badge>
          </div>
          <p className={styles.description}>维护课程词汇与课文的语音合成服务，支持阿里云、Azure 或本地引擎。</p>
          <p className={styles.metaLine}>
            当前提供商：{cfg?.tts?.provider ? cfg.tts.provider : '暂未配置'}
          </p>
          <div className={styles.actions}>
            <Button as="a" href="/admin/settings/models/tts" size="sm">
              配置 TTS
            </Button>
          </div>
        </Card>

        <Card className={styles.serviceCard}>
          <div className={styles.serviceHeader}>
            <h2 className={styles.cardTitle}>评分服务</h2>
            <Badge variant={cfg?.scoring?.enabled ? 'success' : 'muted'}>
              {cfg?.scoring?.enabled ? '已启用' : '未启用'}
            </Badge>
          </div>
          <p className={styles.description}>用于完形填空与小作文的自动评分，兼容 OpenAI、Ollama、DeepSeek 等模型。</p>
          <p className={styles.metaLine}>
            当前提供商：{cfg?.scoring?.provider ? cfg.scoring.provider : '暂未配置'}
          </p>
          <div className={styles.actions}>
            <Button as="a" href="/admin/settings/models/scoring" size="sm" variant="ghost">
              配置评分服务
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
