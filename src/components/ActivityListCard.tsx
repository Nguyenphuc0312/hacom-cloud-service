import React from 'react';
import clsx from 'clsx';

interface ActivityListCardProps {
  title?: string;
  actions?: React.ReactNode;
  items: Array<{ icon?: React.ReactNode; content: React.ReactNode; meta?: React.ReactNode }>;
  className?: string;
}

export const ActivityListCard: React.FC<ActivityListCardProps> = ({
  title,
  actions,
  items,
  className,
}) => (
  <div className={clsx('ds-activity-card', className)}>
    {(title || actions) && (
      <div className="ds-activity-card-header">
        {title && <span className="ds-activity-card-title">{title}</span>}
        {actions && <div className="ds-activity-card-actions">{actions}</div>}
      </div>
    )}
    <ul className="ds-activity-card-list">
      {items.map((item, idx) => (
        <li key={idx} className="ds-activity-card-item">
          {item.icon && <span className="ds-activity-card-item-icon">{item.icon}</span>}
          <span className="ds-activity-card-item-content">{item.content}</span>
          {item.meta && <span className="ds-activity-card-item-meta">{item.meta}</span>}
        </li>
      ))}
    </ul>
  </div>
);
