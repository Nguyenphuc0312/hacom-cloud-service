import React from 'react';
import clsx from 'clsx';

import './QuickActionCard.css';
interface QuickActionCardProps {
  title?: string;
  actions: Array<{ icon: React.ReactNode; label: string; onClick?: () => void }>;
  className?: string;
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({ title, actions, className }) => (
  <div className={clsx('ds-quick-action-card', className)}>
    {title && <div className="ds-quick-action-card-title">{title}</div>}
    <div className="ds-quick-action-card-actions">
      {actions.map((action, idx) => (
        <button
          key={idx}
          className="ds-btn ds-btn--icon ds-quick-action-btn"
          onClick={action.onClick}
        >
          <span className="ds-icon">{action.icon}</span>
          <span className="ds-quick-action-label">{action.label}</span>
        </button>
      ))}
    </div>
  </div>
);
