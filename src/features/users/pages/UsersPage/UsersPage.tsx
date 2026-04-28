import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Popconfirm, Select, Space, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SorterResult, TablePaginationConfig } from 'antd/es/table/interface';
import { useMemo, useState } from 'react';

import { usersClient } from '@/api/clients/usersClient/usersClient';
import { getErrorMessage } from '@/api/error/error';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { UserActionPayload, UserDetail, UserListItem, UserPresenceStatus, UsersListQuery, UsersListResponse } from '@/api/types/users/users';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { AppTooltip } from '@/components/AppTooltip/AppTooltip';
import { AvatarCell } from '@/components/AvatarCell/AvatarCell';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel/DetailPanel';
import { FilterBar } from '@/components/FilterBar/FilterBar';
import { MetaCell } from '@/components/MetaCell/MetaCell';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { DataTable } from '@/components/ui/DataTable/DataTable';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags/featureFlags';
import { useAuthStore } from '@/store/authStore/authStore';
import { formatDateTime } from '@/utils/date/date';
import { canManageUsers } from '@/utils/role/role';
import './UsersPage.css';

const accountStatusOptions = [
  { label: 'Tất cả trạng thái', value: 'all' },
  { label: 'Hoạt động', value: 'ACTIVE' },
  { label: 'Chờ xác minh', value: 'PENDING_VERIFICATION' },
  { label: 'Đã vô hiệu', value: 'DISABLED' },
];

const presenceOptions: Array<{ label: string; value: 'all' | UserPresenceStatus }> = [
  { label: 'Tất cả hiện diện', value: 'all' },
  { label: 'Online', value: 'online' },
  { label: 'Offline', value: 'offline' },
  { label: 'Vắng mặt', value: 'away' },
  { label: 'Không làm phiền', value: 'dnd' },
];

const activityOptions = [
  { label: 'Tất cả hoạt động', value: 'all' },
  { label: 'Chỉ đang hoạt động', value: 'active' },
  { label: 'Chỉ ngừng hoạt động', value: 'inactive' },
];

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
      message.success(
        variables.action === 'lock'
          ? 'Đã khóa tài khoản.'
          : variables.action === 'unlock'
            ? 'Đã mở khóa tài khoản.'
            : 'Đã thu hồi phiên đăng nhập.',
      );

      const nextAccountStatus =
        variables.action === 'lock'
          ? 'DISABLED'
          : variables.action === 'unlock'
            ? 'ACTIVE'
            : undefined;

      if (nextAccountStatus) {
        queryClient.setQueriesData<UsersListResponse>({ queryKey: queryKeys.usersRoot }, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === variables.userId
                    ? { ...item, accountStatus: nextAccountStatus }
                    : item,
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
        title: 'Người dùng',
        key: 'user',
        width: 260,
        fixed: 'left',
        render: (_, record) => (
          <AvatarCell
            name={record.username ?? record.email}
            description={record.email}
            code={record.employeeId}
          />
        ),
      },
      {
        title: 'Mã nhân viên',
        dataIndex: 'employeeId',
        width: 150,
        render: (value: string | null) => <MetaCell primary={value ?? '-'} />,
      },
      {
        title: 'Email',
        dataIndex: 'email',
        width: 260,
        ellipsis: true,
        render: (value: string) => <MetaCell primary={value} />,
      },
      {
        title: 'Phòng ban',
        key: 'department',
        width: 180,
        render: () => <MetaCell primary="-" secondary="API danh sách chưa trả về" />,
      },
      {
        title: 'Vai trò',
        key: 'role',
        width: 140,
        render: () => <MetaCell primary="-" secondary="API phân quyền" />,
      },
      {
        title: 'Trạng thái',
        dataIndex: 'accountStatus',
        width: 150,
        render: (value: string | null) => <StatusBadge status={value} />,
      },
      {
        title: 'Liên kết HR',
        dataIndex: 'employeeId',
        width: 130,
        render: (value: string | null) =>
          value ? <Tag color="green">Đã liên kết</Tag> : <Tag color="default">Chưa liên kết</Tag>,
      },
      {
        title: 'Cập nhật lúc',
        dataIndex: 'updatedAt',
        width: 170,
        sorter: true,
        render: (value: string | null) => <DateTimeCell value={value} />,
      },
      {
        title: 'Thao tác',
        key: 'actions',
        width: 84,
        fixed: 'right',
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Xem chi tiết',
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
      message.info('Thao tác ghi đang bị tắt theo cấu hình release.');
      return;
    }

    if (!canManageUsers(currentRole)) {
      message.warning('Vai trò hiện tại không được phép thực hiện thao tác ghi.');
      return;
    }

    await actionMutation.mutateAsync({
      action,
      userId: selectedUserId,
      payload: { reason: `panel_${action}` },
    });
  };

  const pageHeader = {
    eyebrow: 'Danh tính',
    title: 'Quản lý người dùng',
    description: 'Quản lý tài khoản, danh tính HR, vai trò và trạng thái.',
  };

  if (usersQuery.isPending && !usersQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Đang tải người dùng..." />
      </PageShell>
    );
  }

  if (usersQuery.isError && !usersQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description="Không thể tải danh sách người dùng."
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
      <div className="ds-page-with-detail">
        <div className="ds-page-main-stack">
          <FilterBar className="users-page-filter">
            <Form
              form={form}
              layout="inline"
              className="ds-toolbar-form"
              initialValues={{ accountStatus: 'all', status: 'all', active: 'all' }}
            >
              <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
                <Input allowClear placeholder="Tìm tên, email, mã nhân viên..." />
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
              <span>{data?.pagination.total ?? 0} người dùng</span>
              <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang bật` : 'Chưa lọc'}</span>
            </div>
          </FilterBar>

          <DataTableShell title="Người dùng" meta="Danh sách tài khoản có phân trang từ admin API.">
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={usersQuery.isFetching && !usersQuery.isPending}
              dataSource={data?.items ?? []}
              emptyNode={<EmptyState description="Không có người dùng khớp bộ lọc hiện tại." />}
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
          title={selectedUser?.username ?? selectedUser?.email ?? 'Chi tiết người dùng'}
          onClose={() => setSelectedUserId(null)}
          width={720}
          className="ds-ops-detail-panel"
        >
          {selectedUserQuery.isPending && !selectedUser ? (
            <QueryStateView kind="loading" compact />
          ) : selectedUserQuery.isError ? (
            <QueryStateView
              kind="error"
              compact
              description="Không thể tải chi tiết người dùng."
              onRetry={() => {
                void selectedUserQuery.refetch();
              }}
            />
          ) : selectedUser ? (
            <div className="ds-ops-detail-stack">
              <section className="ds-ops-detail-section">
                <div className="ds-ops-detail-header">
                  <AvatarCell
                    name={selectedUser.username ?? selectedUser.email}
                    description={selectedUser.email}
                    code={selectedUser.employeeId}
                  />
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
                    <dt>Lần cuối online</dt>
                    <dd>{selectedUser.lastSeen ? formatDateTime(selectedUser.lastSeen) : '-'}</dd>
                  </div>
                  <div>
                    <dt>Phiên đang hoạt động</dt>
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
                    <dt>Mã nhân viên</dt>
                    <dd>{selectedUser.employeeId ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Phòng ban</dt>
                    <dd>{selectedUser.orgUnit ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Chức danh</dt>
                    <dd>{selectedUser.title ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Email đã xác minh</dt>
                    <dd>{selectedUser.emailVerifiedAt ? formatDateTime(selectedUser.emailVerifiedAt) : '-'}</dd>
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
                <h3>Thao tác</h3>
                <div className="ds-admin-inline-actions">
                  <Popconfirm
                    title="Khóa tài khoản này?"
                    description="Người dùng sẽ bị vô hiệu theo chính sách tài khoản phía backend."
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
                      Khóa
                    </Button>
                  </Popconfirm>

                  <Popconfirm
                    title="Mở khóa tài khoản này?"
                    description="Tài khoản sẽ trở lại trạng thái hoạt động nếu backend cho phép."
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
                    title="Thu hồi tất cả phiên?"
                    description="Mọi phiên đang hoạt động của tài khoản này sẽ bị đăng xuất."
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
            <EmptyState description="Chọn một người dùng để xem chi tiết." />
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
