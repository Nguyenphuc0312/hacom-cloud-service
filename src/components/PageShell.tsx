import { Typography } from 'antd';
import type { ReactNode } from 'react';
import {
  PageHeader,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderMeta,
} from '@/components/PageHeader';

const { Text } = Typography;

interface PageShellProps {
  title: string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export const PageShell = ({ title, description, headerExtra, children }: PageShellProps) => {
  return (
    <section className="ds-page-shell">
      <PageHeader>
        <div>
          <PageHeaderTitle>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {title}
            </Typography.Title>
          </PageHeaderTitle>
          {description ? (
            <PageHeaderDescription>
              <Text type="secondary">{description}</Text>
            </PageHeaderDescription>
          ) : null}
        </div>
        {headerExtra ? <PageHeaderMeta>{headerExtra}</PageHeaderMeta> : null}
      </PageHeader>
      <div className="ds-page-shell-body">{children}</div>
    </section>
  );
};
