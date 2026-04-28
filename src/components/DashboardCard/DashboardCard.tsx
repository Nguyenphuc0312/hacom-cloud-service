import type { ReactNode } from 'react';
import clsx from 'clsx';

interface DashboardCardProps {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const DashboardCard = ({ title, meta, action, children, className }: DashboardCardProps) => (
  <section className={clsx('ds-dashboard-card', className)}>
    <header className="ds-dashboard-card-header">
      <div className="ds-dashboard-card-copy">
        <h2>{title}</h2>
        {meta ? <p>{meta}</p> : null}
      </div>
      {action ? <div className="ds-dashboard-card-action">{action}</div> : null}
    </header>
    <div className="ds-dashboard-card-body">{children}</div>
  </section>
);
