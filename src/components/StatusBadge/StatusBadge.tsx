import { Badge, Tag } from 'antd';

import { AppIcon } from '@/components/AppIcon/AppIcon';
import { AppTooltip } from '@/components/AppTooltip/AppTooltip';
import { resolveStatusBadgeConfig, type StatusBadgeConfig } from './statusBadgeUtils';

export interface StatusBadgeProps {
  status?: string | boolean | null;
  mode?: 'tag' | 'badge' | 'dot';
  title?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const getIconName = (config: StatusBadgeConfig): string | undefined => {
  const text = config.text.toLowerCase();

  if (text.includes('tốt') || text.includes('thành công') || text.includes('ok') || text.includes('bật')) {
    return 'check';
  }
  if (text.includes('suy giảm') || text.includes('cảnh báo') || text.includes('chờ')) {
    return 'alert';
  }
  if (text.includes('dừng') || text.includes('lỗi') || text.includes('thất bại') || text.includes('tắt') || text.includes('khóa')) {
    return 'alertCircle';
  }
  if (text.includes('ngoại tuyến') || text.includes('không hoạt')) {
    return 'wifiOff';
  }
  if (text.includes('trực tuyến') || text.includes('đang chạy')) {
    return 'activity';
  }

  return undefined;
};

const sizeStyles: Record<string, { fontSize: number; padding: string; minHeight: number }> = {
  sm: { fontSize: 11, padding: '0 6px', minHeight: 20 },
  md: { fontSize: 12, padding: '2px 8px', minHeight: 24 },
  lg: { fontSize: 13, padding: '4px 12px', minHeight: 28 },
};

const iconSizes: Record<string, number> = {
  sm: 10,
  md: 12,
  lg: 14,
};

export const StatusBadge = ({
  status,
  mode = 'tag',
  title,
  showIcon = false,
  size = 'md',
}: StatusBadgeProps) => {
  const config = resolveStatusBadgeConfig(status);
  const iconName = showIcon ? getIconName(config) : undefined;

  const tooltipTitle =
    title || (config.rawStatus ? `Trạng thái backend chưa ánh xạ: ${config.rawStatus}` : undefined);

  if (mode === 'badge') {
    return (
      <Badge
        color={config.color}
        text={
          <span style={sizeStyles[size]}>
            {iconName && (
              <span style={{ marginRight: 4, display: 'inline-flex', alignItems: 'center' }}>
                <AppIcon name={iconName as 'check' | 'alert' | 'alertCircle' | 'wifiOff' | 'activity'} size={iconSizes[size]} />
              </span>
            )}
            {config.text}
          </span>
        }
      />
    );
  }

  if (mode === 'dot') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: `var(--ant-color-${config.color === 'green' ? 'success' : config.color === 'gold' ? 'warning' : config.color === 'red' ? 'error' : 'default'}-6)`,
          }}
        />
        <span style={sizeStyles[size]}>{config.text}</span>
      </span>
    );
  }

  const tagNode = (
    <Tag color={config.color} style={sizeStyles[size]}>
      {iconName && (
        <span style={{ marginRight: 4, display: 'inline-flex', alignItems: 'center' }}>
          <AppIcon name={iconName as 'check' | 'alert' | 'alertCircle' | 'wifiOff' | 'activity'} size={iconSizes[size]} />
        </span>
      )}
      {config.text}
    </Tag>
  );

  if (!tooltipTitle) {
    return tagNode;
  }

  return <AppTooltip title={tooltipTitle}>{tagNode}</AppTooltip>;
};
