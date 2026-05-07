import React from 'react';
import clsx from 'clsx';

export const PageContainer: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={clsx('ds-page-container', className)} {...props} />;
