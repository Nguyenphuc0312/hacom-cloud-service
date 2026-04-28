import React from 'react';
import clsx from 'clsx';

import './ChartCard.css';
interface ChartCardProps {
  title?: string;
  filter?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, filter, children, className }) => (
  <div className={clsx('ds-chart-card', className)}>
    {(title || filter) && (
      <div className="ds-chart-card-header">
        {title && <span className="ds-chart-card-title">{title}</span>}
        {filter && <div className="ds-chart-card-filter">{filter}</div>}
      </div>
    )}
    <div className="ds-chart-card-body">{children}</div>
  </div>
);
