import { Button, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';

import { useAlertsQuery, type Alert, type AlertFilters } from '@/api/clients/alertsClient/alertsClient';
import { getErrorMessage } from '@/api/error/error';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';

import './AlertsPage.css';

const { Text } = Typography;

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'red',
  warning: 'orange',
  info: 'blue',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Nghiêm trọng',
  warning: 'Cảnh báo',
  info: 'Thông tin',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'red',
  acknowledged: 'orange',
  resolved: 'green',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Đang hoạt động',
  acknowledged: 'Đã xác nhận',
  resolved: 'Đã giải quyết',
};

export const AlertsPage: React.FC = () => {
  const [severityFilter, setSeverityFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const filters: AlertFilters = {
    severity: severityFilter as AlertFilters['severity'],
    status: statusFilter as AlertFilters['status'],
  };

  const query = useAlertsQuery(filters);

  const columns: ColumnsType<Alert> = [
    {
      title: 'Mức độ',
      dataIndex: 'severity',
      width: 120,
      render: (severity: string) => (
        <Tag color={SEVERITY_COLORS[severity] ?? 'default'}>
          {SEVERITY_LABELS[severity] ?? severity}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status] ?? 'default'}>
          {STATUS_LABELS[status] ?? status}
        </Tag>
      ),
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      render: (title: string, record) => (
        <div className="alert-title-cell">
          <Text strong>{title}</Text>
          {record.description && (
            <Text type="secondary" className="alert-description">{record.description}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      width: 150,
      render: (source: string) => source || '-',
    },
    {
      title: 'Dịch vụ',
      dataIndex: 'service',
      width: 150,
      render: (service: string) => service || '-',
    },
    {
      title: 'Thời gian',
      dataIndex: 'occurredAt',
      width: 160,
      render: (time: string) => <DateTimeCell value={time} />,
    },
    {
      title: 'Hành động',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          {record.status === 'active' && (
            <Button size="small" type="link">
              Xác nhận
            </Button>
          )}
          {record.status !== 'resolved' && (
            <Button size="small" type="link">
              Giải quyết
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const alerts = query.data?.alerts ?? [];
  const criticalCount = query.data?.criticalCount ?? 0;
  const warningCount = query.data?.warningCount ?? 0;
  const infoCount = query.data?.infoCount ?? 0;

  const isLoading = query.isLoading && !query.data;
  const isError = query.isError && !query.data;

  return (
    <PageShell
      eyebrow="Cảnh báo"
      title="Cảnh báo & Sự cố"
      description="Danh sách cảnh báo, incidents và gợi ý hành động."
      headerExtra={
        <div className="alerts-header-stats">
          <Tag color="red">{criticalCount} Nghiêm trọng</Tag>
          <Tag color="orange">{warningCount} Cảnh báo</Tag>
          <Tag color="blue">{infoCount} Thông tin</Tag>
          <Button
            icon={<AppIcon name="refresh" size={14} />}
            onClick={() => void query.refetch()}
            loading={query.isFetching}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <QueryStateView kind="loading" title="Đang tải cảnh báo..." />
      ) : isError ? (
        <QueryStateView
          kind="error"
          title="Không thể tải cảnh báo"
          description={getErrorMessage(query.error, 'Dữ liệu cảnh báo tạm thời không khả dụng.')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DataTableShell
          title="Danh sách cảnh báo"
          toolbar={
            <div className="alerts-filters">
              <Space wrap>
                <Button
                  type={severityFilter === 'critical' ? 'primary' : 'default'}
                  danger={severityFilter === 'critical'}
                  onClick={() => setSeverityFilter(severityFilter === 'critical' ? undefined : 'critical')}
                >
                  Nghiêm trọng
                </Button>
                <Button
                  type={severityFilter === 'warning' ? 'primary' : 'default'}
                  onClick={() => setSeverityFilter(severityFilter === 'warning' ? undefined : 'warning')}
                >
                  Cảnh báo
                </Button>
                <Button
                  type={severityFilter === 'info' ? 'primary' : 'default'}
                  onClick={() => setSeverityFilter(severityFilter === 'info' ? undefined : 'info')}
                >
                  Thông tin
                </Button>
                <Button
                  type={statusFilter === 'active' ? 'primary' : 'default'}
                  onClick={() => setStatusFilter(statusFilter === 'active' ? undefined : 'active')}
                >
                  Đang hoạt động
                </Button>
              </Space>
            </div>
          }
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={alerts}
            loading={query.isFetching && !!query.data}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `${total} cảnh báo`,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Không có cảnh báo nào"
                />
              ),
            }}
            rowClassName={(record) =>
              record.severity === 'critical' && record.status === 'active'
                ? 'alert-row-critical'
                : ''
            }
          />
        </DataTableShell>
      )}
    </PageShell>
  );
};
