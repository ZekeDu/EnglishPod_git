import { useState } from 'react';
import useSWR from 'swr';
import styles from './account.module.css';
import { Button, Card, Badge } from '../components/ui';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => {
  if (r.status === 401) {
    if (typeof window !== 'undefined') window.location.href = `/login?redirect=/account`;
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error('request_failed');
  return r.json();
});

type UserInfo = { email?: string; role?: string; username?: string; nickname?: string } | null;
type Subscription = { status?: string; plan?: string; expire_at?: string } | null;

type ProgressSummary = {
  streak: number;
  lessons: {
    total: number;
    completed: number;
    inProgress: number;
  };
  reviews: {
    total: number;
    due: number;
    learning: number;
    mastered: number;
    clearedToday?: boolean;
  };
  week: { date: string; completed: boolean }[];
} | null;

const plans = [
  {
    id: 'monthly',
    title: '月度计划',
    price: '¥49',
    desc: '无限访问全部课程 + AI 作文点评 + 定制复习计划',
    label: '推荐',
  },
  {
    id: 'yearly',
    title: '年度计划',
    price: '¥468',
    desc: '年度尊享，额外赠送课程包与学习报告',
    label: 'Soon',
  },
];

export default function AccountPage() {
  const { data: meResp } = useSWR<{ data: UserInfo }>(`${API}/me`, fetcher);
  const { data: subResp, mutate: mutateSub } = useSWR<{ data: Subscription }>(`${API}/me/subscription`, fetcher);
  const {
    data: summaryResp,
    error: summaryError,
  } = useSWR<{ data: ProgressSummary }>(`${API}/me/progress/summary`, fetcher);
  const [message, setMessage] = useState('');
  const me = meResp?.data || null;
  const sub = subResp?.data || null;
  const summary: ProgressSummary = summaryResp?.data || null;
  const loadingSummary = !summaryResp && !summaryError;
  const safeSummary = summary || {
    streak: 0,
    lessons: { total: 0, completed: 0, inProgress: 0 },
    reviews: { total: 0, due: 0, learning: 0, mastered: 0, clearedToday: false },
    week: [],
  };

  const handleCheckout = async (plan: string) => {
    try {
      setMessage('');
      const resp = await fetch(`${API}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.data?.error || '订阅失败');
      mutateSub();
      setMessage('订阅信息已更新（模拟）');
    } catch (err: any) {
      setMessage(err?.message || '订阅失败，请稍后再试');
    }
  };

  if (!me) {
    return (
      <Card className={styles.page}>
        <p>未登录，请先 <a href="/login">登录</a></p>
      </Card>
    );
  }

  const displayName = me.nickname || me.username || me.email || 'EnglishPod Learner';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>个人主页</h1>
          <p className={styles.subtitle}>你好，{displayName} 👋</p>
        </div>
        <Badge>beta</Badge>
      </header>

      <Card className={styles.infoCard}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>邮箱</span>
          <span>{me.email || '—'}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>角色</span>
          <span>{me.role || 'user'}</span>
        </div>
        {me.role === 'admin' && (
          <Button as="a" href="/admin" variant="secondary" size="sm">
            进入管理后台
          </Button>
        )}
      </Card>

      <Card>
        <div className={styles.overviewHeader}>
          <h3 className={styles.sectionTitle}>学习概览</h3>
          <Badge variant="muted">累计 {safeSummary.lessons.total} 门课程</Badge>
        </div>
        {summaryError && <p className={styles.errorText}>学习数据加载失败，请刷新重试。</p>}
        {loadingSummary ? (
          <div className={styles.statGrid}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeletonBlock} />
            ))}
          </div>
        ) : (
          <div className={styles.statGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>连续天数</span>
              <span className={styles.statValue}>{safeSummary.streak}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>进行中的课程</span>
              <span className={styles.statValue}>{safeSummary.lessons.inProgress}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>已完成课程</span>
              <span className={styles.statValue}>{safeSummary.lessons.completed}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>今日到期复习</span>
              <span className={styles.statValue}>
                {safeSummary.reviews.clearedToday ? '已完成' : safeSummary.reviews.due}
              </span>
            </div>
          </div>
        )}
        {!loadingSummary && (
          <p className={styles.statNote}>
            学习中词汇 {safeSummary.reviews.learning} · 已掌握 {safeSummary.reviews.mastered}
          </p>
        )}
      </Card>

      <Card className={styles.subscriptionCard}>
        <h3 className={styles.sectionTitle}>订阅状态</h3>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>当前状态</span>
          <span>{sub?.status || '未订阅'}</span>
        </div>
        {sub?.expire_at && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>到期时间</span>
            <span>{new Date(sub.expire_at).toLocaleDateString()}</span>
          </div>
        )}
        {message && <span className={styles.infoLabel}>{message}</span>}
      </Card>

      <section className={styles.subscriptionBanner}>
        <h3 className={styles.sectionTitle}>高级会员即将上线</h3>
        <p className={styles.subtitle}>
          计划包含扩展课程包、深度作文点评和学习报告。现在订阅将自动升级新版本。
        </p>
        <div className={styles.planGrid}>
          {plans.map((plan) => (
            <div key={plan.id} className={styles.planCard}>
              <Badge variant="muted">{plan.label}</Badge>
              <h4 className={styles.sectionTitle}>{plan.title}</h4>
              <span className={styles.planPrice}>{plan.price}</span>
              <p className={styles.planDesc}>{plan.desc}</p>
              <Button onClick={() => handleCheckout(plan.id)} disabled={plan.id === 'yearly'}>
                {plan.id === 'yearly' ? '即将开放' : '一键订阅（模拟）'}
              </Button>
            </div>
          ))}
        </div>
      </section>
      <div className={styles.logout}>
        <Button variant="ghost" size="sm" onClick={async () => {
          await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
          window.location.href = '/login';
        }}>
          退出登录
        </Button>
      </div>
    </div>
  );
}
