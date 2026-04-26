import type { ReactNode } from 'react';
import clsx from 'clsx';

type IncidentTone = 'info' | 'warning' | 'danger';

interface IncidentBannerProps {
  title: ReactNode;
  description?: ReactNode;
  tone?: IncidentTone;
  status?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export const IncidentBanner = ({
  title,
  description,
  tone = 'warning',
  status,
  actions,
  children,
  className,
}: IncidentBannerProps) => (
  <section className={clsx('ds-incident-banner', `tone-${tone}`, className)} role="status">
    <div className="ds-incident-banner-main">
      <div className="ds-incident-banner-copy">
        <span className="ds-incident-banner-eyebrow">
          {tone === 'danger'
            ? 'Sự cố nghiêm trọng'
            : tone === 'warning'
              ? 'Sự cố đang diễn ra'
              : 'Ghi chú vận hành'}
        </span>
        <h3 className="ds-incident-banner-title">{title}</h3>
        {description ? <p className="ds-incident-banner-description">{description}</p> : null}
      </div>
      {(status || actions) && (
        <div className="ds-incident-banner-meta">
          {status ? <div className="ds-incident-banner-status">{status}</div> : null}
          {actions ? <div className="ds-incident-banner-actions">{actions}</div> : null}
        </div>
      )}
    </div>
    {children ? <div className="ds-incident-banner-body">{children}</div> : null}
  </section>
);
