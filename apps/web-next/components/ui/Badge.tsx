import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import styles from './Badge.module.css';

type Variant = 'default' | 'muted' | 'success';

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
  icon?: ReactNode;
};

export function Badge({ variant = 'default', icon, className, children, ...rest }: Props) {
  return (
    <span
      className={cn(styles.root, variant !== 'default' && styles[variant], className)}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

