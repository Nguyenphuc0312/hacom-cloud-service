import { Alert, Button, Input, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import type { OnlineUser } from '@/api/clients/realtimeClient/realtimeClient';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatCard } from '@/components/StatCard/StatCard';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { useOnlineUsers } from '../../hooks/useOnlineUsers/useOnlineUsers';
import { OnlineUserDetailDrawer } from '../../components/OnlineUserDetailDrawer/OnlineUserDetailDrawer';

import './OnlineUsersPage.css';

const { Text } = Typography;

/** Presence states that still mean "connected"; mirrors the websocket gateway. */
const STATE_OPTIONS = [
  { label: 'Tất cả trạng thái', value: '' },
  { label: 'Trực tuyến', value: 'online' },
  { label: 'Vắng mặt', value: 'away' },
  { label: 'Chờ', value: 'idle' },
  { label: 'Không làm phiền', value: 'dnd' },
  { label: 'Bận', value: 'busy' },
];

export const OnlineUsersPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);

  const query = useOnlineUsers({ page, pageSize, search, state: stateFilter, autoRefresh });

  const data = query.data;
  const items = data?.items ?? [];

  // Counted from the current page only; the header total comes from the backend.
  const stateBreakdown = useMemo(() => {
    const breakdown = { connections: 0, away: 0, online: 0 };
    for (const user of data?.items ?? []) {
      breakdown.connections += user.connectionCount;
      if (user.presenceState === 'online') {
        breakdown.online += 1;
      } else {
        breakdown.away += 1;
      }
    }
    return breakdown;
  }, [data?.items]);

  const columns: ColumnsType<OnlineUser> = useMemo(
    () => [
      {
        title: 'Trạng thái',
        dataIndex: 'presenceState',
        width: 130,
        render: (state: string) => <StatusBadge status={state} />,
      },
      {
        title: 'Người dùng',
        dataIndex: 'displayName',
        width: 240,
        render: (name: string, record) => (
          <div className="user-name-cell">
            <Text strong>{name}</Text>
            {record.employeeCode && <Text type="secondary">{record.employeeCode}</Text>}
          </div>
        ),
      },
      {
        title: 'Phòng ban',
        dataIndex: 'department',
        width: 160,
        render: (department: string | null) => department || '-',
      },
      {
        title: (
          <Tooltip title="Số kết nối WebSocket đang mở của người dùng (nhiều tab/thiết bị sẽ tính nhiều kết nối).">
            <span>Phiên kết nối</span>
          </Tooltip>
        ),
        dataIndex: 'connectionCount',
        width: 120,
        align: 'right',
        render: (count: number) => count,
      },
      {
        title: 'Hoạt động cuối',
        dataIndex: 'lastSeenAt',
        width: 170,
        render: (value: string | null) => (value ? <DateTimeCell value={value} /> : '-'),
      },
      {
        title: 'Thiết bị',
        key: 'device',
        width: 130,
        render: (_, record) => (
          <Button type="link" size="small" onClick={() => setSelectedUser(record)}>
            Xem thiết bị
          </Button>
        ),
      },
    ],
    [],
  );

  const isLoading = query.isLoading && !data;
  const isError = query.isError && !data;
  const isStale = data?.source === 'stale';

  return (
    <PageShell
      eyebrow="Realtime"
      title="Người dùng Online"
      description="Ai đang kết nối, ở trạng thái nào và giữ bao nhiêu phiên WebSocket."
      headerExtra={
        <div className="online-users-header-actions">
          <Button
            type={autoRefresh ? 'primary' : 'default'}
            icon={<AppIcon name={autoRefresh ? 'pause' : 'play'} size={14} aria-hidden />}
            onClick={() => setAutoRefresh((prev) => !prev)}
          >
            {autoRefresh ? 'Tạm dừng' : 'Tự làm mới'}
          </Button>
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
        <>
          {isStale && (
            <Alert
              type="warning"
              showIcon
              className="online-users-stale-alert"
              message="Không đọc được dữ liệu presence"
              description={`${data?.staleReason ?? 'Nguồn presence không khả dụng.'} Danh sách trống ở đây KHÔNG có nghĩa là không có ai online.`}
            />
          )}

          <section className="ds-ops-summary-grid" aria-label="Tổng quan người dùng online">
            <StatCard
              title="Đang online"
              value={isStale ? '-' : (data?.total ?? 0)}
              meta="Người dùng có kết nối WebSocket"
            />
            <StatCard
              title="Trạng thái trực tuyến"
              value={isStale ? '-' : stateBreakdown.online}
              meta="Trong trang hiện tại"
            />
            <StatCard
              title="Vắng mặt / bận"
              value={isStale ? '-' : stateBreakdown.away}
              meta="Trong trang hiện tại"
            />
            <StatCard
              title="Tổng phiên kết nối"
              value={isStale ? '-' : stateBreakdown.connections}
              meta="Trong trang hiện tại"
            />
          </section>

          <DataTableShell
            title="Danh sách người dùng"
            toolbar={
              <div className="online-users-filters">
                <Space>
                  <Input.Search
                    placeholder="Tìm theo tên, mã NS, phòng ban..."
                    allowClear
                    onSearch={(value) => {
                      setSearch(value);
                      setPage(1);
                    }}
                    style={{ width: 260 }}
                  />
                  <Select
                    placeholder="Lọc trạng thái"
                    allowClear
                    style={{ width: 180 }}
                    onChange={(value) => {
                      setStateFilter(value || undefined);
                      setPage(1);
                    }}
                    options={STATE_OPTIONS}
                  />
                </Space>
              </div>
            }
          >
            <Table
              rowKey="userId"
              columns={columns}
              dataSource={items}
              loading={query.isFetching && !!data}
              onRow={(record) => ({
                onClick: () => setSelectedUser(record),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize,
                total: data?.total ?? 0,
                showSizeChanger: true,
                showTotal: (total) => `${total} người dùng`,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                },
              }}
              locale={{
                emptyText: (
                  <EmptyState
                    title={isStale ? 'Chưa có dữ liệu presence' : 'Không có người dùng online'}
                    description={
                      isStale
                        ? 'Không đọc được nguồn presence, xem cảnh báo phía trên.'
                        : 'Hiện không có ai đang kết nối.'
                    }
                    compact
                  />
                ),
              }}
              scroll={{ x: 900 }}
            />
          </DataTableShell>
        </>
      )}

      <OnlineUserDetailDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
    </PageShell>
  );
};
