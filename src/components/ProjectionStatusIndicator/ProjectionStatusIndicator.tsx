/**
 * Component to display projection sync status
 */
import { Badge, Popover, Space, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { useProjectionStatus, getProjectionStatusLabel, getProjectionCounts, hasProjectionIssues } from '@/hooks/useProjectionStatus';
import type { ProjectionStatusItem } from '@/api/types/projection-status/projection-status';

import './ProjectionStatusIndicator.css';

dayjs.extend(relativeTime);

const { Text } = Typography;

interface StatusBadgeProps {
  status: ProjectionStatusItem['status'];
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config: Record<string, { color: string; status: 'success' | 'warning' | 'error' | 'default' }> = {
    healthy: { color: 'green', status: 'success' },
    stale: { color: 'orange', status: 'warning' },
    error: { color: 'red', status: 'error' },
    unknown: { color: 'gray', status: 'default' },
  };

  const { status: badgeStatus } = config[status] ?? config.unknown;

  return <Badge status={badgeStatus} />;
};

interface ProjectionPopoverContentProps {
  projections: ProjectionStatusItem[];
  checkedAt: string;
}

const ProjectionPopoverContent: React.FC<ProjectionPopoverContentProps> = ({
  projections,
  checkedAt,
}) => {
  const getStatusDetails = (projection: ProjectionStatusItem) => {
    if (projection.status === 'error') {
      return (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {projection.lastError || 'Unknown error'}
        </Text>
      );
    }
    if (projection.lastSuccessAt) {
      return (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(projection.lastSuccessAt).fromNow()}
        </Text>
      );
    }
    return null;
  };

  const getProjectionDisplayName = (name: string): string => {
    const names: Record<string, string> = {
      users: 'Người dùng',
      hr_employees: 'Nhân viên HR',
      audit_logs: 'Nhật ký kiểm toán',
    };
    return names[name] ?? name;
  };

  return (
    <div style={{ minWidth: 240 }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Kiểm tra lúc: {dayjs(checkedAt).format('HH:mm:ss')}
          </Text>
        </div>
        {projections.map((projection) => (
          <div key={projection.name}>
            <Space>
              <StatusBadge status={projection.status} />
              <Text strong>{getProjectionDisplayName(projection.name)}</Text>
            </Space>
            <div style={{ marginLeft: 24 }}>
              {getStatusDetails(projection)}
            </div>
          </div>
        ))}
      </Space>
    </div>
  );
};

interface ProjectionStatusIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export const ProjectionStatusIndicator: React.FC<ProjectionStatusIndicatorProps> = ({
  className,
  showLabel = true,
}) => {
  const { data, isLoading, isError } = useProjectionStatus();

  if (isLoading) {
    return (
      <Space className={className} size={4}>
        <Badge status="default" />
        {showLabel && <Text type="secondary">Đang tải...</Text>}
      </Space>
    );
  }

  if (isError || !data) {
    return (
      <Popover
        content={
          <Text type="secondary">Không thể tải trạng thái đồng bộ</Text>
        }
        title="Trạng thái đồng bộ"
      >
        <Space className={className} size={4}>
          <Badge status="error" />
          {showLabel && <Text type="secondary">Lỗi</Text>}
          <InfoCircleOutlined style={{ color: '#999', fontSize: 12 }} />
        </Space>
      </Popover>
    );
  }

  const counts = getProjectionCounts(data.projections);
  const hasIssues = hasProjectionIssues(data.projections);

  const getMainStatus = (): ProjectionStatusItem['status'] => {
    if (counts.error > 0) return 'error';
    if (counts.stale > 0) return 'stale';
    if (counts.healthy === data.projections.length) return 'healthy';
    return 'unknown';
  };

  const mainStatus = getMainStatus();

  return (
    <Popover
      content={<ProjectionPopoverContent projections={data.projections} checkedAt={data.checkedAt} />}
      title={
        <Space>
          <Text strong>Trạng thái đồng bộ dữ liệu</Text>
          {hasIssues && (
            <Badge status="warning" style={{ marginLeft: 8 }} />
          )}
        </Space>
      }
    >
      <Space className={className} size={4} style={{ cursor: 'pointer' }}>
        <StatusBadge status={mainStatus} />
        {showLabel && (
          <Text type="secondary">
            {getProjectionStatusLabel(mainStatus)}
          </Text>
        )}
        <InfoCircleOutlined style={{ color: '#999', fontSize: 12 }} />
      </Space>
    </Popover>
  );
};
