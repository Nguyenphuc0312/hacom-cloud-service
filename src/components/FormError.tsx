import React from 'react';
import clsx from 'clsx';

export const FormError: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={clsx('ds-form-error', className)} {...props} />;
