import { Button, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Text, Title } = Typography;

interface MonitoringSectionHeaderProps {
  title: string;
  description: string;
  deepLink?: string | null;
  secondaryAction?: ReactNode;
}

export const MonitoringSectionHeader = ({
  title,
  description,
  deepLink,
  secondaryAction,
}: MonitoringSectionHeaderProps) => (
  <div className="monitoring-section-header">
    <div>
      <Title level={4} className="monitoring-section-title">
        {title}
      </Title>
      <Text type="secondary">{description}</Text>
    </div>
    <Space size={8} wrap>
      {secondaryAction}
      {deepLink ? (
        <Button type="default" href={deepLink} target="_blank" rel="noreferrer">
          Mở dashboard chi tiết
        </Button>
      ) : null}
    </Space>
  </div>
);
