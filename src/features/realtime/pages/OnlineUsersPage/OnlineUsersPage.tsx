import { Button, Input, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import type { OnlineUser } from '@/api/clients/realtimeClient/realtimeClient';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { AvatarCell } from '@/components/AvatarCell/AvatarCell';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { TableSkeleton } from '@/components/TableSkeleton/TableSkeleton';
import { useOnlineUsers } from '../../hooks/useOnlineUsers/useOnlineUsers';
import { OnlineUserDetailDrawer } from '../../components/OnlineUserDetailDrawer/OnlineUserDetailDrawer';
import { PresenceSummary } from '../../components/PresenceSummary/PresenceSummary';
import { UserDeviceStrip } from '../../components/UserDeviceStrip/UserDeviceStrip';

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
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  const query = useOnlineUsers({ page, pageSize, search, state: stateFilter, autoRefresh });

  const data = query.data;
  const items = data?.items ?? [];

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
        render: (name: string, record) => (
          <AvatarCell name={name} description={record.employeeCode} />
        ),
      },
      {
        title: 'Phòng ban',
        dataIndex: 'department',
        width: 180,
        render: (department: string | null) =>
          department || <Text type="secondary">Chưa có</Text>,
      },
      {
        title: (
          <Tooltip title="Số kết nối WebSocket đang mở. Nhiều tab hoặc nhiều thiết bị sẽ tính thành nhiều phiên.">
            <span className="online-users-th-hint">Phiên</span>
          </Tooltip>
        ),
        dataIndex: 'connectionCount',
        width: 96,
        align: 'right',
        render: (count: number) => (
          <span className="online-users-sessions" data-multi={count > 1 || undefined}>
            {count}
          </span>
        ),
      },
      {
        title: 'Hoạt động cuối',
        dataIndex: 'lastSeenAt',
        width: 180,
        render: (value: string | null) =>
          value ? <DateTimeCell value={value} /> : <Text type="secondary">—</Text>,
      },
      {
        title: '',
        key: 'actions',
        width: 60,
        align: 'right',
        render: (_, record) => (
          <Tooltip title="Xem chi tiết">
            <Button
              type="text"
              size="small"
              aria-label={`Xem chi tiết ${record.displayName}`}
              icon={<AppIcon name="arrowRight" size={14} aria-hidden />}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedUser(record);
              }}
            />
          </Tooltip>
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
      description="Bao nhiêu người đang online, cụ thể là ai, và thiết bị nào gắn với tài khoản của họ. Mở rộng một dòng để xem thiết bị."
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
        // Skeleton reserves the real layout instead of a spinner over empty space.
        <TableSkeleton rows={8} />
      ) : isError ? (
        <QueryStateView
          kind="error"
          title="Không thể tải danh sách"
          description="Dữ liệu người dùng online tạm thời không khả dụng."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <PresenceSummary
            total={data?.total ?? 0}
            pageItems={items}
            isStale={isStale}
            staleReason={data?.staleReason ?? null}
            lastUpdatedAt={query.dataUpdatedAt}
            isFetching={query.isFetching}
          />

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
              expandable={{
                // Devices load per user, so they expand on demand instead of
                // firing one request per visible row.
                expandedRowKeys,
                onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
                expandedRowRender: (record) => (
                  <UserDeviceStrip
                    userId={record.userId}
                    connectionCount={record.connectionCount}
                  />
                ),
                expandRowByClick: true,
                expandedRowClassName: () => 'online-users-expanded',
              }}
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
