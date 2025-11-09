import type { HTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '../../utils/cn';
import styles from './Card.module.css';

type Props = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  action?: ReactNode;
  href?: string;
};

export function Card({ className, title, action, href, children, ...rest }: Props) {
  const content = (
    <div
      className={cn(styles.root, href && styles.interactive, className)}
      {...rest}
    >
      {(title || action) && (
        <div className={styles.header}>
          {typeof title === 'string' ? <h3 className={styles.title}>{title}</h3> : title}
          {action}
        </div>
      )}
      {children}
    </div>
  );
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    );
  }
  return content;
}

