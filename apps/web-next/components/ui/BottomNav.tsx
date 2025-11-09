import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { cn } from '../../utils/cn';
import styles from './BottomNav.module.css';

type Item = { label: string; href: string; icon?: JSX.Element; requireAuth?: boolean };

const NAV_ITEMS: Item[] = [
  { label: '课程', href: '/' },
  { label: '复习', href: '/review', requireAuth: true },
  { label: '我', href: '/account', requireAuth: true },
];

export function BottomNav() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState<boolean>(false);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
        const url = base.replace(/\/$/, '') + '/me';
        const r = await fetch(url, { credentials: 'include' });
        if (!aborted && r.ok) setIsAuthed(true);
        else if (!aborted) setIsAuthed(false);
      } catch {
        if (!aborted) setIsAuthed(false);
      }
    })();
    return () => { aborted = true; };
  }, []);

  const handleNavigate = (href: string, requireAuth?: boolean) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (requireAuth && !isAuthed) {
      event.preventDefault();
      const redirect = encodeURIComponent(href);
      router.push(`/login?redirect=${redirect}`);
    }
  };

  return (
    <nav className={styles.root} aria-label="主导航">
      <div className={styles.inner}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/'
            ? router.pathname === '/'
            : router.pathname.startsWith(item.href);
          const href = item.requireAuth && !isAuthed ? `/login?redirect=${encodeURIComponent(item.href)}` : item.href;
          return (
            <Link
              key={item.href}
              href={href}
              onClick={handleNavigate(item.href, item.requireAuth)}
              className={cn(styles.item, isActive && styles.active)}
            >
              {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
