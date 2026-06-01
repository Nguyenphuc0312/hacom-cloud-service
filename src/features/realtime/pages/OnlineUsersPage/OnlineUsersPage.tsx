import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';

import { realtimeClient, type OnlineUser } from '@/api/clients/realtimeClient/realtimeClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';

import './OnlineUsersPage.css';

const { Text } = Typography;

export const OnlineUsersPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const query = useQuery({
    queryKey: queryKeys.realtimeOnlineUsers({ page, pageSize, search }),
    queryFn: () => realtimeClient.getOnlineUsers(page, pageSize, search),
    placeholderData: (previousData) => previousData,
    staleTime: 5000,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const columns: ColumnsType<OnlineUser> = [
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => (
        <StatusBadge
          status={
            status === 'online'
              ? 'healthy'
              : status === 'idle'
                ? 'warning'
                : 'unknown'
          }
        />
      ),
    },
    {
      title: 'Tên hiển thị',
      dataIndex: 'displayName',
      width: 200,
      render: (name: string, record) => (
        <div className="user-name-cell">
          <Text strong>{name || 'Unknown'}</Text>
          {record.email && <Text type="secondary">{record.email}</Text>}
        </div>
      ),
    },
    {
      title: 'Phòng ban',
      dataIndex: 'department',
      width: 150,
      render: (dept: string) => dept || '-',
    },
    {
      title: 'Thiết bị',
      key: 'device',
      width: 150,
      render: (_, record) => (
        <div className="device-cell">
          {record.browser && <Tag>{record.browser}</Tag>}
          {record.device && <Tag color="blue">{record.device}</Tag>}
        </div>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 130,
      render: (ip: string) => ip || '-',
    },
    {
      title: 'Hoạt động cuối',
      dataIndex: 'lastActive',
      width: 160,
      render: (time: string) => <DateTimeCell value={time} />,
    },
  ];

  const isLoading = query.isLoading && !query.data;
  const isError = query.isError && !query.data;
  const data = query.data;

  return (
    <PageShell
      eyebrow="Realtime"
      title="Người dùng Online"
      description="Danh sách người dùng đang hoạt động trên hệ thống chat."
      headerExtra={
        <div className="online-users-header-actions">
          <Text type="secondary">
            {data?.total ?? 0} người dùng online
          </Text>
          <Button
            icon={<AppIcon name="refresh" size={14} aria-hidden />}
            onClick={() => void query.refetch()}
            loading={query.isFetching}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <QueryStateView kind="loading" title="Đang tải danh sách người dùng..." />
      ) : isError ? (
        <QueryStateView
          kind="error"
          title="Không thể tải danh sách"
          description="Dữ liệu người dùng online tạm thời không khả dụng."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DataTableShell
          title="Danh sách người dùng"
          toolbar={
            <div className="online-users-filters">
              <Space>
                <Input.Search
                  placeholder="Tìm theo tên, email..."
                  allowClear
                  onSearch={setSearch}
                  style={{ width: 250 }}
                />
                <Select
                  placeholder="Lọc trạng thái"
                  allowClear
                  style={{ width: 140 }}
                  onChange={setStatusFilter}
                  options={[
                    { label: 'Tất cả', value: '' },
                    { label: 'Online', value: 'online' },
                    { label: 'Idle', value: 'idle' },
                    { label: 'Đã ngắt', value: 'disconnected' },
                  ]}
                />
              </Space>
            </div>
          }
        >
          <Table
            rowKey="userId"
            columns={columns}
            dataSource={data?.users.filter((u) => !statusFilter || u.status === statusFilter)}
            loading={query.isFetching && !!data}
            pagination={{
              current: page,
              pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `${total} người dùng`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            locale={{
              emptyText: <EmptyState title="Không có người dùng online" description="Không có người dùng nào đang hoạt động." compact />,
            }}
            scroll={{ x: 900 }}
          />
        </DataTableShell>
      )}
    </PageShell>
  );
};
