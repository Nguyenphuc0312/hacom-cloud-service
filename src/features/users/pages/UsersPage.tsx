import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { formatDateTime } from '@/utils/date';

const accountStatusOptions = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Đang hoạt động', value: 'ACTIVE' },
  { label: 'Chờ xác minh', value: 'PENDING_VERIFICATION' },
  { label: 'Đã khóa', value: 'DISABLED' },
];

const presenceOptions: Array<{ label: string; value: 'all' | UserPresenceStatus }> = [
  { label: 'Mọi trạng thái', value: 'all' },
  { label: 'Online', value: 'online' },
  { label: 'Offline', value: 'offline' },
  { label: 'Away', value: 'away' },
  { label: 'Do not disturb', value: 'dnd' },
];

export const UsersPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

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
        message.success('Đã thu hồi phiên đăng nhập.');
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.usersList(JSON.stringify(params)) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(variables.userId) });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const confirmAction = useCallback(
    (action: 'lock' | 'unlock' | 'revoke', user: UserListItem) => {
      const titleMap: Record<typeof action, string> = {
        lock: 'Khóa tài khoản',
        unlock: 'Mở khóa tài khoản',
        revoke: 'Thu hồi mọi phiên',
      };

      const contentMap: Record<typeof action, string> = {
        lock: 'Tài khoản sẽ bị vô hiệu hóa và người dùng sẽ bị đăng xuất khỏi các phiên hoạt động.',
        unlock: 'Tài khoản sẽ được kích hoạt lại theo chính sách của auth-service.',
        revoke: 'Toàn bộ phiên đăng nhập hiện tại của người dùng sẽ bị thu hồi.',
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
    [actionMutation],
  );

  const columns = useMemo<ColumnsType<UserListItem>>(
    () => [
      {
        title: 'Tài khoản',
        key: 'account',
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{record.username ?? '(không có username)'}</Typography.Text>
            <Typography.Text type="secondary">{record.email}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Nhân sự',
        dataIndex: 'employeeId',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Trạng thái account',
        dataIndex: 'accountStatus',
        render: (value: string | null) => {
          if (value === 'ACTIVE') return <Tag color="green">ACTIVE</Tag>;
          if (value === 'DISABLED') return <Tag color="red">DISABLED</Tag>;
          if (value === 'PENDING_VERIFICATION') return <Tag color="gold">PENDING_VERIFICATION</Tag>;
          return <Tag>{value ?? 'UNKNOWN'}</Tag>;
        },
      },
      {
        title: 'Presence',
        dataIndex: 'status',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Last seen',
        dataIndex: 'lastSeen',
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: 'Hành động',
        key: 'actions',
        render: (_, record) => (
          <Space wrap>
            <Button size="small" onClick={() => navigate(`/users/${record.id}`)}>
              Chi tiết
            </Button>
            <Button
              size="small"
              danger
              disabled={record.accountStatus === 'DISABLED' || actionMutation.isPending}
              onClick={() => confirmAction('lock', record)}
            >
              Lock
            </Button>
            <Button
              size="small"
              disabled={record.accountStatus !== 'DISABLED' || actionMutation.isPending}
              onClick={() => confirmAction('unlock', record)}
            >
              Unlock
            </Button>
            <Button
              size="small"
              disabled={actionMutation.isPending}
              onClick={() => confirmAction('revoke', record)}
            >
              Revoke sessions
            </Button>
          </Space>
        ),
      },
    ],
    [actionMutation.isPending, confirmAction, navigate],
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

  if (usersQuery.isLoading) {
    return <LoadingState tip="Đang tải danh sách người dùng..." />;
  }

  if (usersQuery.isError) {
    return (
      <ErrorState
        subTitle="Không thể tải users list."
        extra={<Button onClick={() => usersQuery.refetch()}>Thử lại</Button>}
      />
    );
  }

  const data = usersQuery.data;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Users"
        description="Tra cứu người dùng, xem trạng thái tài khoản và thực hiện action quản trị tối thiểu"
      />

      <Card>
        <Form
          form={form}
          layout="inline"
          initialValues={{ accountStatus: 'all', status: 'all', active: 'all' }}
        >
          <Form.Item name="keyword">
            <Input
              allowClear
              placeholder="Tìm theo username, email, employee"
              style={{ width: 260 }}
            />
          </Form.Item>
          <Form.Item name="accountStatus">
            <Select style={{ width: 190 }} options={accountStatusOptions} />
          </Form.Item>
          <Form.Item name="status">
            <Select style={{ width: 170 }} options={presenceOptions} />
          </Form.Item>
          <Form.Item name="active">
            <Select
              style={{ width: 160 }}
              options={[
                { label: 'Mọi active state', value: 'all' },
                { label: 'isActive=true', value: 'active' },
                { label: 'isActive=false', value: 'inactive' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={applyFilters}>
                Áp dụng
              </Button>
              <Button
                onClick={() => {
                  form.resetFields();
                  setParams((prev) => ({
                    ...prev,
                    page: 1,
                    keyword: undefined,
                    accountStatus: undefined,
                    status: undefined,
                    isActive: undefined,
                  }));
                }}
              >
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          locale={{ emptyText: <EmptyState description="Không có người dùng phù hợp bộ lọc." /> }}
          pagination={{
            current: data?.pagination.page,
            pageSize: data?.pagination.limit,
            total: data?.pagination.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              setParams((prev) => ({
                ...prev,
                page,
                limit: pageSize,
              }));
            },
          }}
        />
      </Card>
    </Space>
  );
};
