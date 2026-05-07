import React from 'react';
import clsx from 'clsx';

export const DataTableToolbar: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={clsx('ds-table-toolbar', className)} {...props} />;
