import { useEffect, useMemo, useState } from 'react';
import styles from './admin.module.css';
import { Button, Card, Badge } from '../../components/ui';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type AdminLesson = {
  id: string;
  title: string;
  version: number;
  published: boolean;
  updated_at?: string | null;
  level?: string;
  tags?: string[];
};

type AdminUser = { role?: string; nickname?: string; username?: string } | null;

export default function AdminHome() {
  const [me, setMe] = useState<AdminUser>(null);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [tags, setTags] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API}/me`, { credentials: 'include' });
        const data = await resp.json();
        setMe(data.data);
      } catch {}
    })();
  }, []);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (level) params.set('level', level);
      if (tags) params.set('tags', tags);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const resp = await fetch(`${API}/admin/lessons?${params.toString()}`, { credentials: 'include' });
      const json = await resp.json();
      if (resp.ok && Array.isArray(json.data)) {
        setLessons(json.data);
        setTotal(json.meta?.total || 0);
      } else {
        setMessage(json?.data?.error || '加载失败');
      }
    } catch {
      setMessage('加载失败');
    }
  };

  useEffect(() => {
    load();
  }, [query, level, tags, page, pageSize]);

  const publish = async (id: string, action: 'publish' | 'unpublish') => {
    setMessage('');
    const resp = await fetch(`${API}/admin/lessons/${id}/${action}`, {
      method: 'PUT',
      credentials: 'include',
    });
    const json = await resp.json();
    if (resp.ok) {
      setLessons((prev) =>
        prev.map((lesson) =>
          lesson.id === id
            ? {
                ...lesson,
                published: action === 'publish',
                version: action === 'publish' ? (lesson.version || 0) + 1 : lesson.version,
              }
            : lesson,
        ),
      );
    } else {
      setMessage(json?.data?.error || '操作失败');
    }
  };

  const removeLesson = async (id: string) => {
    setMessage('');
    const confirmId = prompt(`删除课程 #${id}，请输入课程编号确认：`) || '';
    if (confirmId.trim() !== id) return;
    const purge = window.confirm('是否同时删除本地上传的音频文件？选择“确定”将一并删除。');
    const querySuffix = purge ? '?purgeUploads=1' : '';
    try {
      const resp = await fetch(`${API}/admin/lessons/${id}${querySuffix}`, { method: 'DELETE', credentials: 'include' });
      const json = await resp.json();
      if (resp.ok) {
        setLessons((prev) => prev.filter((lesson) => lesson.id !== id));
        setTotal((t) => Math.max(0, t - 1));
        setMessage('课程已删除');
      } else {
        setMessage(json?.data?.error || '删除失败');
      }
    } catch {
      setMessage('删除失败');
    }
  };

  if (!me) {
    return (
      <Card className={styles.page}>
        <p>未登录，请先 <a href="/login">登录</a></p>
      </Card>
    );
  }

  if (me.role !== 'admin') {
    return (
      <Card className={styles.page}>
        <p>无权限，需要管理员账户。</p>
      </Card>
    );
  }

  const displayName = me.nickname || me.username || 'Admin';

  const headerActions = (
    <div className={styles.headerActions}>
      <Button
        onClick={async () => {
          const inputId = prompt('请输入课程编号（留空则自动分配）：') || '';
          const resp = await fetch(`${API}/admin/lessons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: inputId.trim() || undefined }),
          });
          const json = await resp.json();
          if (resp.ok) window.location.href = `/admin/lessons/${json.data.id}`;
          else alert(json?.data?.error || '创建失败');
        }}
      >
        新建课程
      </Button>
      <Button as="a" href="/admin/settings/models" variant="ghost">
        模型服务管理
      </Button>
      <Button as="a" href="/settings/offline" variant="ghost">
        离线管理
      </Button>
      <Button as="a" href="/admin/import" variant="ghost">
        批量导入
      </Button>
      <Button as="a" href="/docs/import-format.html" variant="ghost">
        导入格式说明
      </Button>
    </div>
  );

  const filterControls = (
    <div className={styles.filters}>
      <input
        placeholder="搜索标题"
        value={query}
        onChange={(e) => {
          setPage(1);
          setQuery(e.currentTarget.value);
        }}
      />
      <input
        placeholder="等级"
        value={level}
        onChange={(e) => {
          setPage(1);
          setLevel(e.currentTarget.value);
        }}
      />
      <input
        placeholder="标签（逗号分隔）"
        value={tags}
        onChange={(e) => {
          setPage(1);
          setTags(e.currentTarget.value);
        }}
      />
      <Badge variant="muted">共 {total} 条</Badge>
    </div>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Button as="a" href="/account" variant="ghost" size="sm">
            返回账户
          </Button>
          <h1 className={styles.heading}>后台管理</h1>
          <p className="muted">{displayName}，欢迎回来</p>
        </div>
        {headerActions}
      </header>

      <Card>{filterControls}</Card>

      {message && <Card>{message}</Card>}

      <section className={styles.lessonGrid}>
        {lessons.map((lesson) => (
          <Card key={lesson.id} className={styles.lessonCard}>
            <div className={styles.metaRow}>
              <div>
                <h3 style={{ margin: 0 }}>#{lesson.id} {lesson.title || '(未命名)'}</h3>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {lesson.level || '未分级'} · v{lesson.version || 1}
                </p>
              </div>
              <Badge variant={lesson.published ? 'success' : 'muted'}>
                {lesson.published ? '已发布' : '草稿'}
              </Badge>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              更新：{lesson.updated_at ? new Date(lesson.updated_at).toLocaleString() : '-'}
            </p>
            <div className={styles.tagRow}>
              {(lesson.tags || []).map((tag) => (
                <Badge key={tag} variant="muted">#{tag}</Badge>
              ))}
            </div>
            <div className={styles.headerActions}>
              <Button as="a" href={`/admin/lessons/${lesson.id}`} size="sm">
                编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => publish(lesson.id, lesson.published ? 'unpublish' : 'publish')}
              >
                {lesson.published ? '下线' : '发布'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                style={{ color: 'crimson', borderColor: 'rgba(220,38,38,0.4)' }}
                onClick={() => removeLesson(lesson.id)}
              >
                删除
              </Button>
            </div>
          </Card>
        ))}
      </section>

      <div className={styles.footerPager}>
        <div className={styles.headerActions}>
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>
            上一页
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={page * pageSize >= total}
            onClick={() => setPage((prev) => prev + 1)}
          >
            下一页
          </Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted">每页</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.currentTarget.value));
            }}
          >
            {[10, 20, 30, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
