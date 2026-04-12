import React from 'react';
import clsx from 'clsx';

export const FormHint: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={clsx('ds-form-hint', className)} {...props} />;
