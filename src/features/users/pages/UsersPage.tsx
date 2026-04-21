import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Popconfirm, Select, Space, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SorterResult, TablePaginationConfig } from 'antd/es/table/interface';
import { useMemo, useState } from 'react';

import { usersClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type {
  UserActionPayload,
  UserDetail,
  UserListItem,
  UserPresenceStatus,
  UsersListQuery,
  UsersListResponse,
} from '@/api/types';
import { AppIcon } from '@/components/AppIcon';
import { AppTooltip } from '@/components/AppTooltip';
import { DataTableShell } from '@/components/DataTableShell';
import { DetailPanel } from '@/components/DetailPanel';
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { FilterBar } from '@/components/FilterBar';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime, formatRelativeTime } from '@/utils/date';
import { canManageUsers } from '@/utils/role';

const accountStatusOptions = [
  { label: 'Tất cả trạng thái', value: 'all' },
  { label: 'Đang hoạt động', value: 'ACTIVE' },
  { label: 'Chờ xác minh', value: 'PENDING_VERIFICATION' },
  { label: 'Đã tắt', value: 'DISABLED' },
];

const presenceOptions: Array<{ label: string; value: 'all' | UserPresenceStatus }> = [
  { label: 'Mọi trạng thái hiện diện', value: 'all' },
  { label: 'Trực tuyến', value: 'online' },
  { label: 'Ngoại tuyến', value: 'offline' },
  { label: 'Vắng mặt', value: 'away' },
  { label: 'Không làm phiền', value: 'dnd' },
];

const activityOptions = [
  { label: 'Mọi mức độ hoạt động', value: 'all' },
  { label: 'Chỉ đang hoạt động', value: 'active' },
  { label: 'Chỉ không hoạt động', value: 'inactive' },
];

const readOnlyFallback = 'Tài khoản hiện tại chỉ có quyền xem.';

export const UsersPage = () => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const currentRole = useAuthStore((state) => state.user?.role);
  const canWriteUserActions = isAdminWriteActionsEnabled && canManageUsers(currentRole);

  const [params, setParams] = useState<UsersListQuery>({
    page: 1,
    limit: 20,
    sortBy: 'updated_at',
    sortOrder: 'desc',
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: queryKeys.usersList(params),
    queryFn: () => usersClient.list(params),
    placeholderData: keepPreviousData,
  });

  const selectedUserQuery = useQuery({
    queryKey: queryKeys.userDetail(selectedUserId ?? ''),
    queryFn: () => usersClient.getById(selectedUserId ?? ''),
    enabled: Boolean(selectedUserId),
  });

  const activeFilterCount = [
    params.keyword,
    params.accountStatus,
    params.status,
    typeof params.isActive === 'boolean' ? `${params.isActive}` : null,
  ].filter(Boolean).length;

  const actionMutation = useMutation({
    mutationFn: async (input: {
      action: 'lock' | 'unlock' | 'revoke';
      userId: string;
      payload?: UserActionPayload;
    }) => {
      if (input.action === 'lock') {
        return usersClient.lock(input.userId, input.payload);
      }

      if (input.action === 'unlock') {
        return usersClient.unlock(input.userId, input.payload);
      }

      return usersClient.revokeSessions(input.userId, input.payload);
    },
    onSuccess: (_data, variables) => {
      if (variables.action === 'lock') {
        message.success('Đã khóa tài khoản.');
      } else if (variables.action === 'unlock') {
        message.success('Đã mở khóa tài khoản.');
      } else {
        message.success('Đã thu hồi phiên.');
      }

      const nextAccountStatus =
        variables.action === 'lock'
          ? 'DISABLED'
          : variables.action === 'unlock'
            ? 'ACTIVE'
            : undefined;

      if (nextAccountStatus) {
        queryClient.setQueriesData<UsersListResponse>(
          { queryKey: queryKeys.usersRoot },
          (current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item.id === variables.userId ? { ...item, accountStatus: nextAccountStatus } : item,
                  ),
                }
              : current,
        );

        queryClient.setQueryData<UserDetail>(queryKeys.userDetail(variables.userId), (current) =>
          current ? { ...current, accountStatus: nextAccountStatus } : current,
        );
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(variables.userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLogsRoot });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const columns = useMemo<ColumnsType<UserListItem>>(
    () => [
      {
        title: 'Tài khoản',
        key: 'account',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.username ?? 'Chưa có username'}</strong>
            <span>{record.email}</span>
          </div>
        ),
      },
      {
        title: 'Mã nhân sự',
        dataIndex: 'employeeId',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Trạng thái',
        dataIndex: 'accountStatus',
        width: 160,
        render: (value: string | null) => <StatusBadge status={value} />,
      },
      {
        title: 'Hiện diện',
        dataIndex: 'status',
        width: 140,
        render: (value: string | null) => <StatusBadge status={value ?? 'offline'} />,
      },
      {
        title: 'Lần cuối hoạt động',
        dataIndex: 'lastSeen',
        width: 180,
        render: (value: string | null) =>
          value ? (
            <AppTooltip title={formatDateTime(value)}>
              <span>{formatRelativeTime(value)}</span>
            </AppTooltip>
          ) : (
            '-'
          ),
      },
      {
        title: '',
        key: 'actions',
        width: 72,
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Mở chi tiết',
                icon: <AppIcon name="eye" size={14} aria-hidden />,
                onClick: () => setSelectedUserId(record.id),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  const applyFilters = () => {
    const values = form.getFieldsValue() as {
      keyword?: string;
      accountStatus?: string;
      status?: string;
      active?: string;
    };

    setParams((prev) => ({
      ...prev,
      page: 1,
      keyword: values.keyword?.trim() || undefined,
      accountStatus:
        values.accountStatus && values.accountStatus !== 'all'
          ? (values.accountStatus as UsersListQuery['accountStatus'])
          : undefined,
      status:
        values.status && values.status !== 'all'
          ? (values.status as UsersListQuery['status'])
          : undefined,
      isActive:
        values.active === 'active' ? true : values.active === 'inactive' ? false : undefined,
    }));
  };

  const resetFilters = () => {
    form.resetFields();
    setParams((prev) => ({
      ...prev,
      page: 1,
      keyword: undefined,
      accountStatus: undefined,
      status: undefined,
      isActive: undefined,
    }));
  };

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<UserListItem> | SorterResult<UserListItem>[],
  ) => {
    const resolvedSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    const sortField =
      resolvedSorter?.field === 'updatedAt'
        ? 'updated_at'
        : resolvedSorter?.field === 'createdAt'
          ? 'created_at'
          : undefined;
    const sortOrder = resolvedSorter?.order === 'ascend' ? 'asc' : 'desc';

    setParams((prev) => ({
      ...prev,
      page: pagination.current ?? prev.page,
      limit: pagination.pageSize ?? prev.limit,
      sortBy: sortField ?? prev.sortBy,
      sortOrder: sortField ? sortOrder : prev.sortOrder,
    }));
  };

  const handleUserAction = async (action: 'lock' | 'unlock' | 'revoke') => {
    if (!selectedUserId) {
      return;
    }

    if (!isAdminWriteActionsEnabled) {
      message.info('Các thao tác ghi đang bị tắt theo cấu hình phát hành.');
      return;
    }

    if (!canManageUsers(currentRole)) {
      message.warning('Vai trò hiện tại không thể thực hiện thao tác ghi.');
      return;
    }

    await actionMutation.mutateAsync({
      action,
      userId: selectedUserId,
      payload: { reason: `panel_${action}` },
    });
  };

  const pageHeader = {
    eyebrow: 'Danh tính và truy cập',
    title: 'Tài khoản',
    description: 'Tra cứu tài khoản quản trị, kiểm tra trạng thái truy cập và mở inspector để xử lý.',
  };

  if (usersQuery.isPending && !usersQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Đang tải danh sách tài khoản..." />
      </PageShell>
    );
  }

  if (usersQuery.isError && !usersQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description="Không thể tải danh sách tài khoản."
          onRetry={() => {
            void usersQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const data = usersQuery.data;
  const selectedUser = selectedUserQuery.data;

  return (
    <PageShell
      {...pageHeader}
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<AppIcon name="refresh" size={16} aria-hidden />}
            loading={usersQuery.isFetching}
            onClick={() => {
              void usersQuery.refetch();
            }}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      {!isAdminWriteActionsEnabled || !canManageUsers(currentRole) ? (
        <FeatureDisabledNotice
          description={
            !isAdminWriteActionsEnabled
              ? 'Các thao tác ghi đang bị tắt theo cấu hình phát hành.'
              : readOnlyFallback
          }
        />
      ) : null}

      <div className="ds-page-with-detail">
        <div className="ds-page-main-stack">
          <FilterBar>
            <Form
              form={form}
              layout="inline"
              className="ds-toolbar-form"
              initialValues={{ accountStatus: 'all', status: 'all', active: 'all' }}
            >
              <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
                <Input allowClear placeholder="Tìm username, email hoặc mã nhân sự" />
              </Form.Item>
              <Form.Item name="accountStatus" className="ds-toolbar-field ds-toolbar-field--md">
                <Select options={accountStatusOptions} />
              </Form.Item>
              <Form.Item name="status" className="ds-toolbar-field ds-toolbar-field--sm">
                <Select options={presenceOptions} />
              </Form.Item>
              <Form.Item name="active" className="ds-toolbar-field ds-toolbar-field--sm">
                <Select options={activityOptions} />
              </Form.Item>
              <Form.Item className="ds-toolbar-field ds-toolbar-actions">
                <Space>
                  <Button type="primary" onClick={applyFilters}>
                    Áp dụng
                  </Button>
                  <Button onClick={resetFilters}>Đặt lại</Button>
                </Space>
              </Form.Item>
            </Form>
            <div className="ds-filter-toolbar-meta">
              <span>{data?.pagination.total ?? 0} tài khoản</span>
              <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang bật` : 'Không có bộ lọc'}</span>
            </div>
          </FilterBar>

          <DataTableShell
            title="Danh sách tài khoản"
            meta="Giữ danh sách gọn, tập trung vào trạng thái và mở inspector khi cần thao tác."
          >
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={usersQuery.isFetching && !usersQuery.isPending}
              dataSource={data?.items ?? []}
              emptyNode={<EmptyState description="Không có tài khoản nào khớp với bộ lọc hiện tại." />}
              onRow={(record) => ({
                onClick: () => setSelectedUserId(record.id),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: data?.pagination.page,
                pageSize: data?.pagination.limit,
                total: data?.pagination.total,
                showSizeChanger: true,
              }}
              onChange={handleTableChange}
            />
          </DataTableShell>
        </div>

        <DetailPanel
          open={Boolean(selectedUserId)}
          title={selectedUser?.username ?? selectedUser?.email ?? 'Chi tiết tài khoản'}
          onClose={() => setSelectedUserId(null)}
          width={400}
          className="ds-ops-detail-panel"
        >
          {selectedUserQuery.isPending && !selectedUser ? (
            <QueryStateView kind="loading" compact />
          ) : selectedUserQuery.isError ? (
            <QueryStateView
              kind="error"
              compact
              description="Không thể tải chi tiết tài khoản."
              onRetry={() => {
                void selectedUserQuery.refetch();
              }}
            />
          ) : selectedUser ? (
            <div className="ds-ops-detail-stack">
              <section className="ds-ops-detail-section">
                <div className="ds-ops-detail-header">
                  <div>
                    <strong>{selectedUser.email}</strong>
                    <p>{selectedUser.employeeId ?? 'Chưa liên kết hồ sơ nhân sự'}</p>
                  </div>
                  <StatusBadge status={selectedUser.accountStatus} />
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Trạng thái</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Hiện diện</dt>
                    <dd>
                      <StatusBadge status={selectedUser.status ?? 'offline'} />
                    </dd>
                  </div>
                  <div>
                    <dt>Lần cuối hoạt động</dt>
                    <dd>{selectedUser.lastSeen ? formatDateTime(selectedUser.lastSeen) : '-'}</dd>
                  </div>
                  <div>
                    <dt>Phiên hoạt động</dt>
                    <dd>{selectedUser.activeSessionCount ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Thiết bị</dt>
                    <dd>{selectedUser.deviceCount ?? '-'}</dd>
                  </div>
                </dl>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Danh tính</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Phòng ban</dt>
                    <dd>{selectedUser.orgUnit ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Chức danh</dt>
                    <dd>{selectedUser.title ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Email xác minh</dt>
                    <dd>{selectedUser.emailVerifiedAt ? formatDateTime(selectedUser.emailVerifiedAt) : '-'}</dd>
                  </div>
                  <div>
                    <dt>Điện thoại xác minh</dt>
                    <dd>{selectedUser.phoneVerifiedAt ? formatDateTime(selectedUser.phoneVerifiedAt) : '-'}</dd>
                  </div>
                  <div>
                    <dt>ID</dt>
                    <dd>
                      <AppTooltip title={selectedUser.id}>
                        <Typography.Text code ellipsis style={{ maxWidth: 220 }}>
                          {selectedUser.id}
                        </Typography.Text>
                      </AppTooltip>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Hành động</h3>
                <div className="ds-admin-inline-actions">
                  <Popconfirm
                    title="Khóa tài khoản này?"
                    description="Người dùng sẽ bị vô hiệu hóa và đăng xuất khỏi các phiên đang hoạt động."
                    okText="Khóa"
                    cancelText="Hủy"
                    onConfirm={() => void handleUserAction('lock')}
                    disabled={!canWriteUserActions || selectedUser.accountStatus === 'DISABLED'}
                  >
                    <Button
                      danger
                      icon={<AppIcon name="lock" size={15} aria-hidden />}
                      disabled={!canWriteUserActions || selectedUser.accountStatus === 'DISABLED'}
                      loading={actionMutation.isPending}
                    >
                      Khóa tài khoản
                    </Button>
                  </Popconfirm>

                  <Popconfirm
                    title="Mở khóa tài khoản này?"
                    description="Tài khoản sẽ quay lại trạng thái hoạt động theo chính sách hiện tại."
                    okText="Mở khóa"
                    cancelText="Hủy"
                    onConfirm={() => void handleUserAction('unlock')}
                    disabled={!canWriteUserActions || selectedUser.accountStatus !== 'DISABLED'}
                  >
                    <Button
                      icon={<AppIcon name="unlock" size={15} aria-hidden />}
                      disabled={!canWriteUserActions || selectedUser.accountStatus !== 'DISABLED'}
                      loading={actionMutation.isPending}
                    >
                      Mở khóa
                    </Button>
                  </Popconfirm>

                  <Popconfirm
                    title="Thu hồi toàn bộ phiên?"
                    description="Tất cả phiên hiện tại của tài khoản này sẽ bị đăng xuất."
                    okText="Thu hồi"
                    cancelText="Hủy"
                    onConfirm={() => void handleUserAction('revoke')}
                    disabled={!canWriteUserActions}
                  >
                    <Button
                      icon={<AppIcon name="warning" size={15} aria-hidden />}
                      disabled={!canWriteUserActions}
                      loading={actionMutation.isPending}
                    >
                      Thu hồi phiên
                    </Button>
                  </Popconfirm>
                </div>
              </section>
            </div>
          ) : (
            <EmptyState description="Chọn một tài khoản để xem chi tiết." />
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
