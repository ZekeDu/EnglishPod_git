import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  LabelHTMLAttributes,
  ReactNode,
} from 'react';
import { cn } from '../../utils/cn';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link';

type SharedProps = {
  variant?: Variant;
  block?: boolean;
  size?: 'md' | 'sm';
  icon?: ReactNode;
};

type ButtonProps =
  | (DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> &
      SharedProps & { as?: 'button'; href?: never })
  | (DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement> &
      SharedProps & { as: 'a'; href: string })
  | (DetailedHTMLProps<LabelHTMLAttributes<HTMLLabelElement>, HTMLLabelElement> &
      SharedProps & { as: 'label'; href?: never });

export function Button(props: ButtonProps) {
  const { variant = 'primary', block, size = 'md', icon, className, children } = props;
  const commonClass = cn(
    styles.root,
    styles[variant],
    size === 'sm' && styles.small,
    block && styles.block,
    className,
  );

  if (props.as === 'a') {
    const { href, as: _as, ...rest } = props;
    return (
      <a className={commonClass} href={href} {...rest}>
        {icon}
        {children}
      </a>
    );
  }

  if (props.as === 'label') {
    const { as: _as, ...rest } = props;
    return (
      <label className={commonClass} {...rest}>
        {icon}
        {children}
      </label>
    );
  }

  const { as: _ignored, ...rest } = props as DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> &
    SharedProps & { as?: 'button' };
  return (
    <button className={commonClass} {...rest}>
      {icon}
      {children}
    </button>
  );
}
