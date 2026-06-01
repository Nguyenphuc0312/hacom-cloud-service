import type { ReactNode } from 'react';

import './PageShell.css';
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderTitle,
} from '@/components/PageHeader/PageHeader';
import { Breadcrumbs, LastUpdated } from '@/components/Breadcrumbs';
import type { BreadcrumbItem } from '@/components/Breadcrumbs';

interface PageShellProps {
  title: string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  eyebrow?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  showBreadcrumbs?: boolean;
  lastUpdated?: string | Date | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export const PageShell = ({
  title,
  description,
  headerExtra,
  children,
  eyebrow,
  breadcrumbs = [],
  showBreadcrumbs = true,
  lastUpdated,
  isRefreshing = false,
  onRefresh,
}: PageShellProps) => {
  return (
    <section className="ds-page-shell">
      {showBreadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs items={breadcrumbs} />
      )}
      <PageHeader>
        <div>
          {eyebrow ? <div className="ds-page-eyebrow">{eyebrow}</div> : null}
          <PageHeaderTitle>{title}</PageHeaderTitle>
          {description ? <PageHeaderDescription>{description}</PageHeaderDescription> : null}
        </div>
        <PageHeaderMeta>
          {lastUpdated && (
            <LastUpdated
              timestamp={lastUpdated}
              refreshing={isRefreshing}
              onRefresh={onRefresh}
            />
          )}
          {headerExtra}
        </PageHeaderMeta>
      </PageHeader>
      <div className="ds-page-shell-body">{children}</div>
    </section>
  );
};
