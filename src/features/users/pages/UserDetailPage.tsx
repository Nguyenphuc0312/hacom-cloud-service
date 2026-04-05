import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Descriptions, Modal, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { sessionsClient, usersClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { UserActionPayload, UserDevice, UserSession } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/utils/date';
import { canManageUsers } from '@/utils/role';

export const UserDetailPage = () => {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const userId = params.id ?? '';
  const currentRole = useAuthStore((state) => state.user?.role);
  const canWriteUserActions = isAdminWriteActionsEnabled && canManageUsers(currentRole);

  const [sessionsPage, setSessionsPage] = useState(1);
  const [devicesPage, setDevicesPage] = useState(1);

  const detailQuery = useQuery({
    queryKey: queryKeys.userDetail(userId),
    queryFn: () => usersClient.getById(userId),
    enabled: Boolean(userId),
  });

  const sessionsQuery = useQuery({
    queryKey: queryKeys.userSessions(userId, JSON.stringify({ page: sessionsPage, limit: 10 })),
    queryFn: () => sessionsClient.listByUserId(userId, { page: sessionsPage, limit: 10 }),
    enabled: Boolean(userId),
  });

  const devicesQuery = useQuery({
    queryKey: queryKeys.userDevices(userId, JSON.stringify({ page: devicesPage, limit: 10 })),
    queryFn: () => sessionsClient.listDevicesByUserId(userId, { page: devicesPage, limit: 10 }),
    enabled: Boolean(userId),
  });

  const actionMutation = useMutation({
    mutationFn: async (input: {
      action: 'lock' | 'unlock' | 'revoke';
      payload?: UserActionPayload;
    }) => {
      if (input.action === 'lock') {
        return usersClient.lock(userId, input.payload);
      }

      if (input.action === 'unlock') {
        return usersClient.unlock(userId, input.payload);
      }

      return usersClient.revokeSessions(userId, input.payload);
    },
    onSuccess: (_data, variables) => {
      if (variables.action === 'lock') {
        message.success('Đã khóa tài khoản.');
      } else if (variables.action === 'unlock') {
        message.success('Đã mở khóa tài khoản.');
      } else {
        message.success('Đã thu hồi phiên đăng nhập.');
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(userId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.userSessions(userId, JSON.stringify({ page: sessionsPage, limit: 10 })),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.usersList('') });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const confirmAction = (action: 'lock' | 'unlock' | 'revoke') => {
    if (!isAdminWriteActionsEnabled) {
      message.info('Write actions are disabled by release configuration.');
      return;
    }

    if (!canManageUsers(currentRole)) {
      message.warning('Role hiện tại không có quyền thực hiện user write actions.');
      return;
    }

    const titleMap: Record<typeof action, string> = {
      lock: 'Khóa tài khoản',
      unlock: 'Mở khóa tài khoản',
      revoke: 'Thu hồi phiên',
    };

    const contentMap: Record<typeof action, string> = {
      lock: 'Người dùng sẽ bị khóa tài khoản và đăng xuất khỏi các phiên đang hoạt động.',
      unlock: 'Tài khoản sẽ được mở khóa.',
      revoke: 'Toàn bộ phiên đăng nhập sẽ bị thu hồi.',
    };

    Modal.confirm({
      title: titleMap[action],
      content: contentMap[action],
      okText: 'Xác nhận',
      cancelText: 'Hủy',
      onOk: async () => {
        await actionMutation.mutateAsync({ action, payload: { reason: `panel_${action}` } });
      },
    });
  };

  const sessionColumns = useMemo<ColumnsType<UserSession>>(
    () => [
      { title: 'Session ID', dataIndex: 'id', width: 240 },
      { title: 'Device', dataIndex: 'deviceName', render: (value) => value ?? '-' },
      { title: 'Platform', dataIndex: 'devicePlatform', render: (value) => value ?? '-' },
      {
        title: 'Revoked',
        dataIndex: 'isRevoked',
        render: (value: boolean) =>
          value ? <Tag color="red">YES</Tag> : <Tag color="green">NO</Tag>,
      },
      {
        title: 'Last used',
        dataIndex: 'lastUsedAt',
        render: (value) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: 'Expires',
        dataIndex: 'expiresAt',
        render: (value) => (value ? formatDateTime(value) : '-'),
      },
    ],
    [],
  );

  const deviceColumns = useMemo<ColumnsType<UserDevice>>(
    () => [
      { title: 'Device name', dataIndex: 'deviceName', render: (value) => value ?? '-' },
      { title: 'Platform', dataIndex: 'platform', render: (value) => value ?? '-' },
      {
        title: 'Push enabled',
        dataIndex: 'pushEnabled',
        render: (value: boolean | null) =>
          value === null ? '-' : value ? <Tag color="green">ENABLED</Tag> : <Tag>DISABLED</Tag>,
      },
      {
        title: 'Last active',
        dataIndex: 'lastActiveAt',
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
      },
    ],
    [],
  );

  if (!userId) {
    return <ErrorState subTitle="Thiếu user id." />;
  }

  if (detailQuery.isLoading) {
    return <LoadingState tip="Đang tải user detail..." />;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        subTitle="Không thể tải user detail."
        extra={<Button onClick={() => detailQuery.refetch()}>Thử lại</Button>}
      />
    );
  }

  const user = detailQuery.data;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="User Detail"
        description={
          <Space>
            <Typography.Text>{user.email}</Typography.Text>
            <Link to="/users">Quay lại danh sách</Link>
          </Space>
        }
        extra={
          <Space>
            <Button
              danger
              disabled={!canWriteUserActions || user.accountStatus === 'DISABLED'}
              onClick={() => confirmAction('lock')}
            >
              Lock
            </Button>
            <Button
              disabled={!canWriteUserActions || user.accountStatus !== 'DISABLED'}
              onClick={() => confirmAction('unlock')}
            >
              Unlock
            </Button>
            <Button disabled={!canWriteUserActions} onClick={() => confirmAction('revoke')}>
              Revoke sessions
            </Button>
          </Space>
        }
      />

      {(!isAdminWriteActionsEnabled || !canManageUsers(currentRole)) && (
        <Card>
          <Typography.Text type="secondary">
            {!isAdminWriteActionsEnabled
              ? 'Write actions (lock/unlock/revoke sessions) are disabled by release configuration.'
              : 'Role hiện tại chỉ có quyền xem, không có quyền lock/unlock/revoke sessions.'}
          </Typography.Text>
        </Card>
      )}

      <Card>
        <Descriptions column={{ xs: 1, md: 2, lg: 3 }}>
          <Descriptions.Item label="Username">{user.username ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Account status">{user.accountStatus ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Presence">{user.status ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Employee ID">{user.employeeId ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Org Unit">{user.orgUnit ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Title">{user.title ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Phone">{user.phone ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Email verified">
            {user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Phone verified">
            {user.phoneVerifiedAt ? formatDateTime(user.phoneVerifiedAt) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Active sessions">
            {user.activeSessionCount ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Devices">{user.deviceCount ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Last seen">
            {user.lastSeen ? formatDateTime(user.lastSeen) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Sessions">
        {sessionsQuery.isError ? (
          <ErrorState subTitle="Không thể tải sessions." />
        ) : (
          <Table
            rowKey="id"
            loading={sessionsQuery.isLoading}
            columns={sessionColumns}
            dataSource={sessionsQuery.data?.items ?? []}
            locale={{ emptyText: <EmptyState description="Không có session" /> }}
            pagination={{
              current: sessionsQuery.data?.pagination.page,
              pageSize: sessionsQuery.data?.pagination.limit,
              total: sessionsQuery.data?.pagination.total,
              onChange: (page) => setSessionsPage(page),
            }}
          />
        )}
      </Card>

      <Card title="Devices">
        {devicesQuery.isError ? (
          <ErrorState subTitle="Không thể tải devices." />
        ) : (
          <Table
            rowKey="id"
            loading={devicesQuery.isLoading}
            columns={deviceColumns}
            dataSource={devicesQuery.data?.items ?? []}
            locale={{ emptyText: <EmptyState description="Không có device" /> }}
            pagination={{
              current: devicesQuery.data?.pagination.page,
              pageSize: devicesQuery.data?.pagination.limit,
              total: devicesQuery.data?.pagination.total,
              onChange: (page) => setDevicesPage(page),
            }}
          />
        )}
      </Card>
    </Space>
  );
};
