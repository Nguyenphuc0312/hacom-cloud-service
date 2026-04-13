import React from 'react';
import clsx from 'clsx';

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  delta,
  icon,
  meta,
  className,
}) => (
  <div className={clsx('ds-stat-card', className)}>
    <div className="ds-stat-card-header">
      <span className="ds-stat-card-title">{title}</span>
      {icon && <span className="ds-stat-card-icon">{icon}</span>}
    </div>
    <div className="ds-stat-card-value-row">
      <span className="ds-stat-card-value">{value}</span>
      {delta && <span className="ds-stat-card-delta">{delta}</span>}
    </div>
    {meta && <div className="ds-stat-card-meta">{meta}</div>}
  </div>
);
