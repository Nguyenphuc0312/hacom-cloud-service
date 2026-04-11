import { Card, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

interface DataTableShellProps {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export const DataTableShell = ({ title, meta, actions, children }: DataTableShellProps) => {
  return (
    <Card className="data-table-shell">
      {title || meta || actions ? (
        <div className="data-table-shell-header">
          <Space direction="vertical" size={2}>
            {title ? <Typography.Text strong>{title}</Typography.Text> : null}
            {meta ? <Typography.Text type="secondary">{meta}</Typography.Text> : null}
          </Space>
          {actions ? <div>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Card>
  );
};
