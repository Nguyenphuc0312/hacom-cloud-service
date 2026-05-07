import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

import { Card } from '@/components/Card/Card';

import './SurfaceCard.css';
interface SurfaceCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
}

export const SurfaceCard = ({
  eyebrow,
  title,
  description,
  status,
  actions,
  className,
  bodyClassName,
  children,
  ...props
}: SurfaceCardProps) => (
  <Card className={clsx('ds-surface-card ds-ui-surface-card', className)} {...props}>
    {(eyebrow || title || description || status || actions) && (
      <div className="ds-ui-surface-card-header">
        <div className="ds-ui-surface-card-copy">
          {eyebrow ? <span className="ds-ui-surface-card-eyebrow">{eyebrow}</span> : null}
          {title ? <h3 className="ds-ui-surface-card-title">{title}</h3> : null}
          {description ? <p className="ds-ui-surface-card-description">{description}</p> : null}
        </div>
        {(status || actions) && (
          <div className="ds-ui-surface-card-meta">
            {status ? <div className="ds-ui-surface-card-status">{status}</div> : null}
            {actions ? <div className="ds-ui-surface-card-actions">{actions}</div> : null}
          </div>
        )}
      </div>
    )}
    <div className={clsx('ds-ui-surface-card-body', bodyClassName)}>{children}</div>
  </Card>
);
