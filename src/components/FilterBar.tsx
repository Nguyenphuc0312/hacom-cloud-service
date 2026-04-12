import React from 'react';
import clsx from 'clsx';

export const FilterBar: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={clsx('ds-filter-bar', className)} {...props} />;
