import React from 'react';
import clsx from 'clsx';

export const PageHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <header className={clsx('ds-page-header', className)} {...props}>
    {children}
  </header>
);

export const PageHeaderTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('ds-page-header-title', className)} {...props} />
);

export const PageHeaderDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('ds-page-header-description', className)} {...props} />
);

export const PageHeaderMeta = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('ds-page-header-meta', className)} {...props} />
);

export const PageHeaderActions = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('ds-page-header-actions', className)} {...props} />
);

export const PageToolbar = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('ds-page-toolbar', className)} {...props} />
);
