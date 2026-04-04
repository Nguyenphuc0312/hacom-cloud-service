import { Space, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Title, Text } = Typography;

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  extra?: ReactNode;
}

export const PageHeader = ({ title, description, extra }: PageHeaderProps) => {
  return (
    <div className="page-header">
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          {title}
        </Title>
        {description ? <Text type="secondary">{description}</Text> : null}
      </div>
      {extra ? <Space>{extra}</Space> : null}
    </div>
  );
};
