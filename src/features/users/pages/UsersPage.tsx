import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SorterResult, TablePaginationConfig } from 'antd/es/table/interface';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { usersClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type {
  UserActionPayload,
  UserListItem,
  UserPresenceStatus,
  UsersListQuery,
} from '@/api/types';
import { AdminTable } from '@/components/AdminTable';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { FilterBar } from '@/components/FilterBar';
import { PageShell } from '@/components/PageShell';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
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
  { label: 'Any presence', value: 'all' },
  { label: 'Online', value: 'online' },
  { label: 'Offline', value: 'offline' },
  { label: 'Away', value: 'away' },
  { label: 'Do not disturb', value: 'dnd' },
];

const activityOptions = [
  { label: 'Any activity', value: 'all' },
  { label: 'Active only', value: 'active' },
  { label: 'Inactive only', value: 'inactive' },
];

export const UsersPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const currentRole = useAuthStore((state) => state.user?.role);
  const canWriteUserActions = isAdminWriteActionsEnabled && canManageUsers(currentRole);

  const [params, setParams] = useState<UsersListQuery>({
    page: 1,
    limit: 20,
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.usersList(JSON.stringify(params)),
    queryFn: () => usersClient.list(params),
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
        message.success('Account locked.');
      } else if (variables.action === 'unlock') {
        message.success('Account unlocked.');
      } else {
        message.success('Sessions revoked.');
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.usersList(JSON.stringify(params)) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(variables.userId) });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const confirmAction = useCallback(
    (action: 'lock' | 'unlock' | 'revoke', user: UserListItem) => {
      if (!isAdminWriteActionsEnabled) {
        message.info('Write actions are disabled by release configuration.');
        return;
      }

      if (!canManageUsers(currentRole)) {
        message.warning('Your current role cannot run account write actions.');
        return;
      }

      const titleMap: Record<typeof action, string> = {
        lock: 'Lock account',
        unlock: 'Unlock account',
        revoke: 'Revoke active sessions',
      };

      const contentMap: Record<typeof action, string> = {
        lock: 'The account will be disabled and the user will be signed out of active sessions.',
        unlock: 'The account will be restored according to the current auth-service policy.',
        revoke: 'All current sessions for this user will be revoked immediately.',
      };

      Modal.confirm({
        title: titleMap[action],
        content: contentMap[action],
        okText: 'Confirm',
        cancelText: 'Cancel',
        onOk: async () => {
          await actionMutation.mutateAsync({
            action,
            userId: user.id,
            payload: { reason: `panel_${action}` },
          });
        },
      });
    },
    [actionMutation, currentRole],
  );

  const columns = useMemo<ColumnsType<UserListItem>>(
    () => [
      {
        title: 'Account',
        key: 'account',
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{record.username ?? 'No username'}</Typography.Text>
            <Typography.Text type="secondary">{record.email}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Employee',
        dataIndex: 'employeeId',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Account state',
        dataIndex: 'accountStatus',
        render: (value: string | null) => <StatusBadge status={value} />,
      },
      {
        title: 'Presence',
        dataIndex: 'status',
        render: (value: string | null) => <StatusBadge status={value ?? 'offline'} />,
      },
      {
        title: 'Last seen',
        dataIndex: 'lastSeen',
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: 'Updated at',
        dataIndex: 'updatedAt',
        sorter: true,
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
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
                label: 'Open detail',
                onClick: () => navigate(`/users/${record.id}`),
              },
              {
                key: 'lock',
                label: 'Lock account',
                danger: true,
                disabled:
                  !isAdminWriteActionsEnabled ||
                  !canWriteUserActions ||
                  record.accountStatus === 'DISABLED' ||
                  actionMutation.isPending,
                onClick: () => confirmAction('lock', record),
              },
              {
                key: 'unlock',
                label: 'Unlock account',
                disabled:
                  !isAdminWriteActionsEnabled ||
                  !canWriteUserActions ||
                  record.accountStatus !== 'DISABLED' ||
                  actionMutation.isPending,
                onClick: () => confirmAction('unlock', record),
              },
              {
                key: 'revoke',
                label: 'Revoke sessions',
                disabled: !canWriteUserActions || actionMutation.isPending,
                onClick: () => confirmAction('revoke', record),
              },
            ]}
          />
        ),
      },
    ],
    [actionMutation.isPending, canWriteUserActions, confirmAction, navigate],
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

  if (usersQuery.isLoading) {
    return (
      <PageShell
        title="Users"
        description="Review admin accounts, presence, and access state."
      >
        <QueryStateView kind="loading" title="Loading accounts..." />
      </PageShell>
    );
  }

  if (usersQuery.isError) {
    return (
      <PageShell
        title="Users"
        description="Review admin accounts, presence, and access state."
      >
        <QueryStateView
          kind="error"
          description="Unable to load the accounts list."
          onRetry={() => {
            void usersQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const data = usersQuery.data;

  return (
    <PageShell
      title="Users"
      description="Find the right operator fast, then open detail only when a write action is needed."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<ReloadOutlined />}
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
      {(!isAdminWriteActionsEnabled || !canManageUsers(currentRole)) && (
        <FeatureDisabledNotice
          description={
            !isAdminWriteActionsEnabled
              ? 'Write actions are disabled by release configuration.'
              : 'Your current role is read-only for lock, unlock, and session revocation.'
          }
        />
      )}

      <FilterBar>
        <Form
          form={form}
          layout="inline"
          className="ds-toolbar-form"
          initialValues={{ accountStatus: 'all', status: 'all', active: 'all' }}
        >
          <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
            <Input allowClear placeholder="Search username, email, or employee" />
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
                Apply filters
              </Button>
              <Button onClick={resetFilters}>Reset</Button>
            </Space>
          </Form.Item>
        </Form>
        <div className="ds-filter-toolbar-meta">
          <span>
            {data?.pagination.total ?? 0} matched account
            {(data?.pagination.total ?? 0) === 1 ? '' : 's'}
          </span>
          <span>
            {activeFilterCount > 0
              ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}`
              : 'No active filters'}
          </span>
          <span>
            Last sync:{' '}
            {usersQuery.dataUpdatedAt
              ? formatDateTime(new Date(usersQuery.dataUpdatedAt).toISOString())
              : '-'}
          </span>
        </div>
      </FilterBar>

      <DataTableShell
        title="Accounts"
        meta="Primary workspace for account state, presence, and row-level actions."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">
              Sort: {params.sortBy ?? 'created_at'} / {params.sortOrder ?? 'desc'}
            </span>
          </DataTableToolbar>
        }
      >
        <AdminTable
          rowKey="id"
          columns={columns}
          minHeight={320}
          dataSource={data?.items ?? []}
          emptyNode={<EmptyState description="No users matched the current filters." />}
          onRow={(record) => ({
            onClick: () => navigate(`/users/${record.id}`),
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
    </PageShell>
  );
};
