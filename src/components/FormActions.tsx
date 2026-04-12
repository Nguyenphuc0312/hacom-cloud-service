import React from 'react';
import clsx from 'clsx';

export const FormActions: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={clsx('ds-form-actions', className)} {...props} />;
