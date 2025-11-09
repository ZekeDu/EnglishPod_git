import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { Button, Card } from '../components/ui';
import styles from './login.module.css';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [msg, setMsg] = useState('');

  const resetCaptcha = useCallback(() => {
    setCaptchaImage('');
    setCaptchaToken('');
    setCaptchaAnswer('');
  }, []);

  const fetchCaptcha = useCallback(async () => {
    try {
      setLoadingCaptcha(true);
      const res = await fetch(`${API}/auth/captcha`, { credentials: 'include' });
      if (!res.ok) throw new Error('captcha');
      const j = await res.json();
      const data = j?.data || {};
      setCaptchaImage(data.image || '');
      setCaptchaToken(data.token || '');
      setCaptchaAnswer('');
      setCaptchaRequired(true);
    } catch {
      setMsg('验证码获取失败，请稍后重试');
    } finally {
      setLoadingCaptcha(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'login') return;
    resetCaptcha();
    setCaptchaRequired(false);
  }, [mode, resetCaptcha]);

  const handleModeSwitch = (next: 'login' | 'signup') => {
    setMode(next);
    setMsg('');
  };

  const submit = async () => {
    setMsg('');
    const payload: Record<string, any> = {
      username: username.trim(),
      password,
    };
    if (mode === 'signup' && email.trim()) {
      payload.email = email.trim();
    }
    if (captchaToken && captchaAnswer) {
      payload.captchaToken = captchaToken;
      payload.captchaAnswer = captchaAnswer.trim();
    }
    if (!payload.username || !password) {
      setMsg('请输入账号和密码');
      return;
    }
    const url = mode === 'login' ? '/auth/login' : '/auth/signup';
    try {
      const res = await fetch(`${API}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg('成功');
        window.location.href = '/account';
        return;
      }
      const error = j?.data?.error || '失败';
      setMsg(error);
      if (j?.data?.captchaRequired) {
        await fetchCaptcha();
      } else if (mode === 'login' && captchaRequired) {
        // 登录失败但服务器未返回 captchaRequired，再刷新一次验证码以防 token 失效
        await fetchCaptcha();
      }
    } catch (e: any) {
      setMsg(e?.message || '请求失败');
    }
  };

  return (
    <>
      <Head>
        <title>登录 EnglishPod 365</title>
      </Head>
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <span className={styles.brand}>englishpod 365</span>
            <h1 className={styles.title}>欢迎回来</h1>
            <p className={styles.subtitle}>
              登录后即可同步课程进度、练习记录与复习计划。注册新账号也只需一分钟。
            </p>
          </section>
          <Card className={styles.card}>
            <div className={styles.toggleBar} role="tablist" aria-label="登录方式切换">
              <button
                type="button"
                className={`${styles.toggleButton} ${mode === 'login' ? styles.toggleActive : ''}`}
                onClick={() => handleModeSwitch('login')}
                role="tab"
                aria-selected={mode === 'login'}
              >
                登录
              </button>
              <button
                type="button"
                className={`${styles.toggleButton} ${mode === 'signup' ? styles.toggleActive : ''}`}
                onClick={() => handleModeSwitch('signup')}
                role="tab"
                aria-selected={mode === 'signup'}
              >
                注册
              </button>
            </div>

            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor="username">
                  用户名
                </label>
                <input
                  id="username"
                  className={styles.input}
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                />
              </div>
              {mode === 'signup' && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="email">
                    邮箱（可选）
                  </label>
                  <input
                    id="email"
                    className={styles.input}
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    placeholder="用于通知与找回密码"
                    autoComplete="email"
                  />
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">
                  密码
                </label>
                <input
                  id="password"
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  placeholder="请输入密码"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>
              {mode === 'login' && captchaRequired && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="captcha">
                    验证码
                  </label>
                  <div className={styles.captchaRow}>
                    <input
                      id="captcha"
                      className={styles.input}
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.currentTarget.value)}
                      placeholder="请输入验证码"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => fetchCaptcha()}
                      disabled={loadingCaptcha}
                    >
                      {loadingCaptcha ? '刷新中…' : '换一张'}
                    </Button>
                  </div>
                  {captchaImage && (
                    <img className={styles.captchaImage} src={captchaImage} alt="验证码" />
                  )}
                </div>
              )}

              <Button type="submit">{mode === 'login' ? '登录' : '注册账号'}</Button>
            </form>

            <p className={`${styles.message} ${msg && msg !== '成功' ? styles.messageError : ''}`}>
              {msg}
            </p>
            {mode === 'login' && !captchaRequired && (
              <p className={styles.footerNote}>多次登录失败后会要求输入验证码。</p>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
