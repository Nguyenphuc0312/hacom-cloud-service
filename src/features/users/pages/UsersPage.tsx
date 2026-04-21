import { ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  UserDetail,
  UserListItem,
  UserPresenceStatus,
  UsersListQuery,
  UsersListResponse,
} from '@/api/types';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { FilterBar } from '@/components/FilterBar';
import { PageShell } from '@/components/PageShell';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/utils/date';
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
    queryKey: queryKeys.usersList(params),
    queryFn: () => usersClient.list(params),
    placeholderData: keepPreviousData,
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
        message.success('Đã thu hồi các phiên.');
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

      void queryClient.invalidateQueries({ queryKey: queryKeys.usersRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(variables.userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLogsRoot });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const confirmAction = useCallback(
    (action: 'lock' | 'unlock' | 'revoke', user: UserListItem) => {
      if (!isAdminWriteActionsEnabled) {
        message.info('Các thao tác ghi đang bị tắt theo cấu hình phát hành.');
        return;
      }

      if (!canManageUsers(currentRole)) {
        message.warning('Vai trò hiện tại của bạn không thể thực hiện thao tác ghi lên tài khoản.');
        return;
      }

      const titleMap: Record<typeof action, string> = {
        lock: 'Khóa tài khoản',
        unlock: 'Mở khóa tài khoản',
        revoke: 'Thu hồi phiên đang hoạt động',
      };

      const contentMap: Record<typeof action, string> = {
        lock: 'Tài khoản sẽ bị vô hiệu hóa và người dùng sẽ bị đăng xuất khỏi các phiên đang hoạt động.',
        unlock: 'Tài khoản sẽ được khôi phục theo chính sách auth-service hiện tại.',
        revoke: 'Toàn bộ phiên hiện tại của người dùng này sẽ bị thu hồi ngay lập tức.',
      };

      Modal.confirm({
        title: titleMap[action],
        content: contentMap[action],
        okText: 'Xác nhận',
        cancelText: 'Hủy',
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
        title: 'Tài khoản',
        key: 'account',
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{record.username ?? 'Chưa có username'}</Typography.Text>
            <Typography.Text type="secondary">{record.email}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Nhân viên',
        dataIndex: 'employeeId',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Trạng thái tài khoản',
        dataIndex: 'accountStatus',
        render: (value: string | null) => <StatusBadge status={value} />,
      },
      {
        title: 'Hiện diện',
        dataIndex: 'status',
        render: (value: string | null) => <StatusBadge status={value ?? 'offline'} />,
      },
      {
        title: 'Lần thấy gần nhất',
        dataIndex: 'lastSeen',
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: 'Cập nhật lúc',
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
                label: 'Mở chi tiết',
                onClick: () => navigate(`/users/${record.id}`),
              },
              {
                key: 'lock',
                label: 'Khóa tài khoản',
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
                label: 'Mở khóa tài khoản',
                disabled:
                  !isAdminWriteActionsEnabled ||
                  !canWriteUserActions ||
                  record.accountStatus !== 'DISABLED' ||
                  actionMutation.isPending,
                onClick: () => confirmAction('unlock', record),
              },
              {
                key: 'revoke',
                label: 'Thu hồi phiên',
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

  if (usersQuery.isPending && !usersQuery.data) {
    return (
      <PageShell
        title="Người dùng"
        description="Xem tài khoản admin, trạng thái hiện diện và trạng thái truy cập."
      >
        <QueryStateView kind="loading" title="Đang tải danh sách tài khoản..." />
      </PageShell>
    );
  }

  if (usersQuery.isError && !usersQuery.data) {
    return (
      <PageShell
        title="Người dùng"
        description="Xem tài khoản admin, trạng thái hiện diện và trạng thái truy cập."
      >
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

  return (
    <PageShell
      title="Người dùng"
      description="Tìm đúng operator thật nhanh, rồi chỉ mở chi tiết khi cần thực hiện thao tác ghi."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<ReloadOutlined />}
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
      {(!isAdminWriteActionsEnabled || !canManageUsers(currentRole)) && (
        <FeatureDisabledNotice
          description={
            !isAdminWriteActionsEnabled
              ? 'Các thao tác ghi đang bị tắt theo cấu hình phát hành.'
              : 'Vai trò hiện tại của bạn chỉ có quyền đọc với thao tác khóa, mở khóa và thu hồi phiên.'
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
            <Input allowClear placeholder="Tìm username, email hoặc mã nhân viên" />
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
                Áp dụng bộ lọc
              </Button>
              <Button onClick={resetFilters}>Đặt lại</Button>
            </Space>
          </Form.Item>
        </Form>
        <div className="ds-filter-toolbar-meta">
          <span>
            {data?.pagination.total ?? 0} tài khoản phù hợp
          </span>
          <span>
            {activeFilterCount > 0
              ? `${activeFilterCount} bộ lọc đang hoạt động`
              : 'Không có bộ lọc đang hoạt động'}
          </span>
          <span>
            Đồng bộ gần nhất:{' '}
            {usersQuery.dataUpdatedAt
              ? formatDateTime(new Date(usersQuery.dataUpdatedAt).toISOString())
              : '-'}
          </span>
        </div>
      </FilterBar>

      <DataTableShell
        title="Tài khoản"
        meta="Không gian chính để theo dõi trạng thái tài khoản, hiện diện và thao tác theo từng dòng."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">
              Sắp xếp: {params.sortBy ?? 'created_at'} / {params.sortOrder ?? 'desc'}
            </span>
          </DataTableToolbar>
        }
      >
        <DataTable
          rowKey="id"
          columns={columns}
          minHeight={320}
          loading={usersQuery.isFetching && !usersQuery.isPending}
          dataSource={data?.items ?? []}
          emptyNode={<EmptyState description="Không có người dùng nào khớp với bộ lọc hiện tại." />}
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
