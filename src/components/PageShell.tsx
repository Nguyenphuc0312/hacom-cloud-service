import { Space, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Text } = Typography;

interface PageShellProps {
  title: string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export const PageShell = ({ title, description, headerExtra, children }: PageShellProps) => {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="page-shell-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {description ? (
            <Text type="secondary" className="page-shell-description">
              {description}
            </Text>
          ) : null}
        </div>
        {headerExtra ? <div className="page-shell-extra">{headerExtra}</div> : null}
      </div>
      {children}
    </Space>
  );
};
