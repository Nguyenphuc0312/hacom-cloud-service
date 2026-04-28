import React from 'react';
import clsx from 'clsx';

import './SummaryCard.css';
interface SummaryCardProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ title, children, icon, className }) => (
  <div className={clsx('ds-summary-card', className)}>
    <div className="ds-summary-card-header">
      {icon && <span className="ds-summary-card-icon">{icon}</span>}
      <span className="ds-summary-card-title">{title}</span>
    </div>
    <div className="ds-summary-card-body">{children}</div>
  </div>
);
