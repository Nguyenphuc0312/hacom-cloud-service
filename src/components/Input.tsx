import React from 'react';
import clsx from 'clsx';

type InputSize = 'sm' | 'md' | 'lg';
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
}

export const Input: React.FC<InputProps> = ({ size = 'md', className, ...props }) => {
  return <input className={clsx('ds-input', `ds-input--${size}`, className)} {...props} />;
};
