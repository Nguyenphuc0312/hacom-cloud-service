import React from 'react';
import clsx from 'clsx';

interface WidgetCardProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({ title, actions, children, className }) => (
  <div className={clsx('ds-widget-card', className)}>
    {(title || actions) && (
      <div className="ds-widget-card-header">
        {title && <span className="ds-widget-card-title">{title}</span>}
        {actions && <div className="ds-widget-card-actions">{actions}</div>}
      </div>
    )}
    <div className="ds-widget-card-body">{children}</div>
  </div>
);
