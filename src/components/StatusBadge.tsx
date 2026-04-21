import { Badge, Tag } from 'antd';

import { AppTooltip } from '@/components/AppTooltip';
import { resolveStatusBadgeConfig } from './statusBadgeUtils';

interface StatusBadgeProps {
  status?: string | boolean | null;
  mode?: 'tag' | 'badge';
  title?: string;
}

export const StatusBadge = ({ status, mode = 'tag', title }: StatusBadgeProps) => {
  const config = resolveStatusBadgeConfig(status);

  if (mode === 'badge') {
    return <Badge color={config.color} text={config.text} />;
  }

  const tagNode = <Tag color={config.color}>{config.text}</Tag>;

  const tooltipTitle =
    title || (config.rawStatus ? `Trạng thái backend chưa ánh xạ: ${config.rawStatus}` : undefined);

  if (!tooltipTitle) {
    return tagNode;
  }

  return <AppTooltip title={tooltipTitle}>{tagNode}</AppTooltip>;
};
