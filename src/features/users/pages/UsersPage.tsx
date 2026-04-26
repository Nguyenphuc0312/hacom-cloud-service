import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Popconfirm, Select, Space, Tag, Typography, message } from 'antd';
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
import { AvatarCell } from '@/components/AvatarCell';
import { DataTableShell } from '@/components/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel';
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { FilterBar } from '@/components/FilterBar';
import { MetaCell } from '@/components/MetaCell';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/utils/date';
import { canManageUsers } from '@/utils/role';

const accountStatusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending verification', value: 'PENDING_VERIFICATION' },
  { label: 'Disabled', value: 'DISABLED' },
];

const presenceOptions: Array<{ label: string; value: 'all' | UserPresenceStatus }> = [
  { label: 'All presence', value: 'all' },
  { label: 'Online', value: 'online' },
  { label: 'Offline', value: 'offline' },
  { label: 'Away', value: 'away' },
  { label: 'Do not disturb', value: 'dnd' },
];

const activityOptions = [
  { label: 'All activity', value: 'all' },
  { label: 'Only active', value: 'active' },
  { label: 'Only inactive', value: 'inactive' },
];

const readOnlyFallback = 'The current account has read-only access.';

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
          ? 'Account locked.'
          : variables.action === 'unlock'
            ? 'Account unlocked.'
            : 'Sessions revoked.',
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
        title: 'User',
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
        title: 'Employee Code',
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
        title: 'Department',
        key: 'department',
        width: 180,
        render: () => <MetaCell primary="-" secondary="Not returned by list API" />,
      },
      {
        title: 'Role',
        key: 'role',
        width: 140,
        render: () => <MetaCell primary="-" secondary="Authority API" />,
      },
      {
        title: 'Status',
        dataIndex: 'accountStatus',
        width: 150,
        render: (value: string | null) => <StatusBadge status={value} />,
      },
      {
        title: 'HR Linked',
        dataIndex: 'employeeId',
        width: 130,
        render: (value: string | null) =>
          value ? <Tag color="green">Linked</Tag> : <Tag color="default">Unlinked</Tag>,
      },
      {
        title: 'Updated At',
        dataIndex: 'updatedAt',
        width: 170,
        sorter: true,
        render: (value: string | null) => <DateTimeCell value={value} />,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 84,
        fixed: 'right',
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Open detail',
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
      message.info('Write actions are disabled by release configuration.');
      return;
    }

    if (!canManageUsers(currentRole)) {
      message.warning('Your current role cannot perform write actions.');
      return;
    }

    await actionMutation.mutateAsync({
      action,
      userId: selectedUserId,
      payload: { reason: `panel_${action}` },
    });
  };

  const pageHeader = {
    eyebrow: 'Identity',
    title: 'User Management',
    description: 'Manage accounts, HR-linked identities, roles, and account status.',
  };

  if (usersQuery.isPending && !usersQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Loading users..." />
      </PageShell>
    );
  }

  if (usersQuery.isError && !usersQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description="Unable to load users."
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
            Refresh
          </Button>
        </div>
      }
    >
      {!isAdminWriteActionsEnabled || !canManageUsers(currentRole) ? (
        <FeatureDisabledNotice
          description={!isAdminWriteActionsEnabled ? 'Write actions are disabled.' : readOnlyFallback}
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
                <Input allowClear placeholder="Search name, email, employee code..." />
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
                    Apply
                  </Button>
                  <Button onClick={resetFilters}>Reset</Button>
                </Space>
              </Form.Item>
            </Form>
            <div className="ds-filter-toolbar-meta">
              <span>{data?.pagination.total ?? 0} users</span>
              <span>{activeFilterCount > 0 ? `${activeFilterCount} active filters` : 'No filters'}</span>
            </div>
          </FilterBar>

          <DataTableShell title="Users" meta="Bounded, paginated account list from the admin API.">
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={usersQuery.isFetching && !usersQuery.isPending}
              dataSource={data?.items ?? []}
              emptyNode={<EmptyState description="No users match the current filters." />}
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
          title={selectedUser?.username ?? selectedUser?.email ?? 'User detail'}
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
              description="Unable to load user detail."
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
                <h3>Status</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Presence</dt>
                    <dd>
                      <StatusBadge status={selectedUser.status ?? 'offline'} />
                    </dd>
                  </div>
                  <div>
                    <dt>Last Seen</dt>
                    <dd>{selectedUser.lastSeen ? formatDateTime(selectedUser.lastSeen) : '-'}</dd>
                  </div>
                  <div>
                    <dt>Active Sessions</dt>
                    <dd>{selectedUser.activeSessionCount ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Devices</dt>
                    <dd>{selectedUser.deviceCount ?? '-'}</dd>
                  </div>
                </dl>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Identity</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Employee Code</dt>
                    <dd>{selectedUser.employeeId ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Department</dt>
                    <dd>{selectedUser.orgUnit ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Position</dt>
                    <dd>{selectedUser.title ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Email Verified</dt>
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
                <h3>Actions</h3>
                <div className="ds-admin-inline-actions">
                  <Popconfirm
                    title="Lock this account?"
                    description="The user will be disabled according to the backend account policy."
                    okText="Lock"
                    cancelText="Cancel"
                    onConfirm={() => void handleUserAction('lock')}
                    disabled={!canWriteUserActions || selectedUser.accountStatus === 'DISABLED'}
                  >
                    <Button
                      danger
                      icon={<AppIcon name="lock" size={15} aria-hidden />}
                      disabled={!canWriteUserActions || selectedUser.accountStatus === 'DISABLED'}
                      loading={actionMutation.isPending}
                    >
                      Lock
                    </Button>
                  </Popconfirm>

                  <Popconfirm
                    title="Unlock this account?"
                    description="The account will return to active state if backend policy allows it."
                    okText="Unlock"
                    cancelText="Cancel"
                    onConfirm={() => void handleUserAction('unlock')}
                    disabled={!canWriteUserActions || selectedUser.accountStatus !== 'DISABLED'}
                  >
                    <Button
                      icon={<AppIcon name="unlock" size={15} aria-hidden />}
                      disabled={!canWriteUserActions || selectedUser.accountStatus !== 'DISABLED'}
                      loading={actionMutation.isPending}
                    >
                      Unlock
                    </Button>
                  </Popconfirm>

                  <Popconfirm
                    title="Revoke all sessions?"
                    description="All active sessions for this account will be signed out."
                    okText="Revoke"
                    cancelText="Cancel"
                    onConfirm={() => void handleUserAction('revoke')}
                    disabled={!canWriteUserActions}
                  >
                    <Button
                      icon={<AppIcon name="warning" size={15} aria-hidden />}
                      disabled={!canWriteUserActions}
                      loading={actionMutation.isPending}
                    >
                      Revoke Sessions
                    </Button>
                  </Popconfirm>
                </div>
              </section>
            </div>
          ) : (
            <EmptyState description="Select a user to inspect details." />
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
