import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '../../utils/cn';
import styles from './BottomNav.module.css';

type Item = { label: string; href: string; icon?: JSX.Element };

const NAV_ITEMS: Item[] = [
  { label: '课程', href: '/' },
  { label: '复习', href: '/review' },
  { label: '我', href: '/account' },
];

export function BottomNav() {
  const router = useRouter();
  return (
    <nav className={styles.root} aria-label="主导航">
      <div className={styles.inner}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/'
            ? router.pathname === '/'
            : router.pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
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

