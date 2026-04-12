import React from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'icon' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}) => {
  return (
    <button
      className={clsx(
        'ds-btn',
        `ds-btn--${variant}`,
        `ds-btn--${size}`,
        { 'is-loading': loading },
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <span className="ds-btn-spinner" /> : null}
      {children}
    </button>
  );
};
