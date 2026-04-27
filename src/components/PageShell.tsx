import type { ReactNode } from 'react';

import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderTitle,
} from '@/components/PageHeader';

interface PageShellProps {
  title: string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  eyebrow?: ReactNode;
}

export const PageShell = ({
  title,
  description,
  headerExtra,
  children,
  eyebrow,
}: PageShellProps) => {
  return (
    <section className="ds-page-shell">
      <PageHeader>
        <div>
          {eyebrow ? <div className="ds-page-eyebrow">{eyebrow}</div> : null}
          <PageHeaderTitle>{title}</PageHeaderTitle>
          {description ? <PageHeaderDescription>{description}</PageHeaderDescription> : null}
        </div>
        {headerExtra ? <PageHeaderMeta>{headerExtra}</PageHeaderMeta> : null}
      </PageHeader>
      <div className="ds-page-shell-body">{children}</div>
    </section>
  );
};
