import React from 'react';
import clsx from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: 'sm' | 'md' | 'lg';
}

export const Input: React.FC<InputProps> = ({ size = 'md', className, ...props }) => {
  return <input className={clsx('ds-input', `ds-input--${size}`, className)} {...props} />;
};
