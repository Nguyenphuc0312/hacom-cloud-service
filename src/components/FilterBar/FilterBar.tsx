import React from 'react';
import clsx from 'clsx';

import './FilterBar.css';
export const FilterBar: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={clsx('ds-filter-bar', 'ds-filter-toolbar', className)} {...props} />;
