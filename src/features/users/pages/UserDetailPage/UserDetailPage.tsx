import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Form, Input, Modal, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { sessionsClient } from '@/api/clients/sessionsClient/sessionsClient';
import { usersClient } from '@/api/clients/usersClient/usersClient';
import { getErrorMessage } from '@/api/error/error';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { UserActionPayload, UserDetail } from '@/api/types/users/users';
import type { UserDevice, UserSession } from '@/api/types/sessions/sessions';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar/DataTableToolbar';
import { EmptyState, QueryStateView } from '@/components/QueryStates/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown/RowActionsDropdown';
import { PageShell } from '@/components/PageShell/PageShell';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import { DataTable } from '@/components/ui/DataTable/DataTable';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags/featureFlags';
import { formatDateTime } from '@/utils/date/date';

const formatOptionalDate = (value?: string | null): string => (value ? formatDateTime(value) : '-');

export const UserDetailPage = () => {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const userId = params.id ?? '';
  const [actionForm] = Form.useForm<{ reason: string; acknowledged: boolean }>();
  const canWriteUserActions = isAdminWriteActionsEnabled;

  const [sessionsPage, setSessionsPage] = useState(1);
  const [devicesPage, setDevicesPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<'lock' | 'unlock' | 'revoke' | null>(null);

  const detailQuery = useQuery({
    queryKey: queryKeys.userDetail(userId),
    queryFn: () => usersClient.getById(userId),
    enabled: Boolean(userId),
  });

  const sessionsQuery = useQuery({
    queryKey: queryKeys.userSessions(userId, { page: sessionsPage, limit: 10 }),
    queryFn: () => sessionsClient.listByUserId(userId, { page: sessionsPage, limit: 10 }),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  });

  const devicesQuery = useQuery({
    queryKey: queryKeys.userDevices(userId, { page: devicesPage, limit: 10 }),
    queryFn: () => sessionsClient.listDevicesByUserId(userId, { page: devicesPage, limit: 10 }),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  });

  const actionMutation = useMutation({
    mutationFn: async (input: {
      action: 'lock' | 'unlock' | 'revoke';
      payload: UserActionPayload;
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
        message.success('Đã thu hồi các phiên.');
      }

      const nextAccountStatus =
        variables.action === 'lock'
          ? 'DISABLED'
          : variables.action === 'unlock'
            ? 'ACTIVE'
            : undefined;

      if (nextAccountStatus) {
        queryClient.setQueryData<UserDetail>(queryKeys.userDetail(userId), (current) =>
          current ? { ...current, accountStatus: nextAccountStatus } : current,
        );
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userSessionsRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.usersRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLogsRoot });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const openActionDialog = (action: 'lock' | 'unlock' | 'revoke') => {
    if (!isAdminWriteActionsEnabled) {
      message.info('Các thao tác ghi đang bị tắt theo cấu hình phát hành.');
      return;
    }

    actionForm.resetFields();
    setPendingAction(action);
  };

  const submitAction = async () => {
    if (!pendingAction) return;
    const values = await actionForm.validateFields();
    await actionMutation.mutateAsync({ action: pendingAction, payload: { reason: values.reason.trim() } });
    actionForm.resetFields();
    setPendingAction(null);
  };

  const actionTitle = pendingAction === 'lock' ? 'Khóa tài khoản' : pendingAction === 'unlock' ? 'Mở khóa tài khoản' : 'Thu hồi phiên đang hoạt động';

  const sessionColumns = useMemo<ColumnsType<UserSession>>(
    () => [
      { title: 'Mã phiên', dataIndex: 'id', width: 240 },
      { title: 'Thiết bị', dataIndex: 'deviceName', render: (value) => value ?? '-' },
      { title: 'Nền tảng', dataIndex: 'devicePlatform', render: (value) => value ?? '-' },
      {
        title: 'Trạng thái',
        dataIndex: 'isRevoked',
        render: (value: boolean) => <StatusBadge status={value ? 'disabled' : 'active'} />,
      },
      {
        title: 'Dùng gần nhất',
        dataIndex: 'lastUsedAt',
        render: (value) => formatOptionalDate(value),
      },
      {
        title: 'Hết hạn',
        dataIndex: 'expiresAt',
        render: (value) => formatOptionalDate(value),
      },
    ],
    [],
  );

  const deviceColumns = useMemo<ColumnsType<UserDevice>>(
    () => [
      { title: 'Tên thiết bị', dataIndex: 'deviceName', render: (value) => value ?? '-' },
      { title: 'Nền tảng', dataIndex: 'platform', render: (value) => value ?? '-' },
      {
        title: 'Push',
        dataIndex: 'pushEnabled',
        render: (value: boolean | null) => (
          <StatusBadge status={value === null ? 'unknown' : value ? 'enabled' : 'inactive'} />
        ),
      },
      {
        title: 'Hoạt động gần nhất',
        dataIndex: 'lastActiveAt',
        render: (value: string | null) => formatOptionalDate(value),
      },
    ],
    [],
  );

  if (!userId) {
    return (
      <PageShell title="Chi tiết người dùng" description="Cần có mã người dùng để tải trang này.">
        <QueryStateView kind="error" description="Thiếu mã người dùng." />
      </PageShell>
    );
  }

  if (detailQuery.isPending && !detailQuery.data) {
    return (
      <PageShell
        title="Chi tiết người dùng"
        description="Trang sâu cho danh tính, phiên và thiết bị. Bảng người dùng chỉ giữ inspect nhanh."
      >
        <QueryStateView kind="loading" title="Đang tải chi tiết người dùng..." />
      </PageShell>
    );
  }

  if ((detailQuery.isError && !detailQuery.data) || !detailQuery.data) {
    return (
      <PageShell
        title="Chi tiết người dùng"
        description="Trang sâu cho danh tính, phiên và thiết bị. Bảng người dùng chỉ giữ inspect nhanh."
      >
        <QueryStateView
          kind="error"
          description="Không thể tải chi tiết người dùng."
          onRetry={() => {
            void detailQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const user = detailQuery.data;

  return (
    <PageShell
      title="Chi tiết người dùng"
      description="Đây là deep admin page. Inspector ở danh sách người dùng chỉ để xem nhanh và thao tác nhanh."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <span className="ds-shell-chip">{user.email}</span>
            <span className="ds-shell-chip ds-shell-chip--ghost">{user.id}</span>
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button onClick={() => navigate('/users')}>Quay lại danh sách người dùng</Button>
            <RowActionsDropdown
              actions={[
                {
                  key: 'lock',
                  label: 'Khóa tài khoản',
                  danger: true,
                  disabled: !canWriteUserActions || user.accountStatus === 'DISABLED',
                  onClick: () => openActionDialog('lock'),
                },
                {
                  key: 'unlock',
                  label: 'Mở khóa tài khoản',
                  disabled: !canWriteUserActions || user.accountStatus !== 'DISABLED',
                  onClick: () => openActionDialog('unlock'),
                },
                {
                  key: 'revoke',
                  label: 'Thu hồi phiên',
                  disabled: !canWriteUserActions,
                  onClick: () => openActionDialog('revoke'),
                },
              ]}
            />
          </div>
        </div>
      }
    >
      <div className="ds-detail-grid">
        <SurfaceCard
          eyebrow="Danh tính và tổ chức"
          title={user.username ?? 'Chưa có username'}
          description="Khối này giữ hồ sơ chính; thống kê nhanh đã nằm ở inspector ngoài danh sách."
          className="ds-detail-panel"
        >
          <div className="ds-detail-list">
            <div className="ds-detail-list-item">
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Mã nhân viên</span>
              <strong>{user.employeeId ?? '-'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Số điện thoại</span>
              <strong>{user.phone ?? '-'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Đơn vị</span>
              <strong>{user.orgUnit ?? '-'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Chức danh</span>
              <strong>{user.title ?? '-'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Lần thấy gần nhất</span>
              <strong>{formatOptionalDate(user.lastSeen)}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Mã người dùng</span>
              <code>{user.id}</code>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Bảo mật và xác minh"
          title="Tư thế xác minh"
          description="Giữ những mốc xác minh và tư thế runtime cần cho điều tra sâu."
          className="ds-detail-panel"
        >
          <div className="ds-detail-list">
            <div className="ds-detail-list-item">
              <span>Trạng thái tài khoản</span>
              <strong>
                <StatusBadge status={user.accountStatus} />
              </strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Hiện diện</span>
              <strong>
                <StatusBadge status={user.status ?? 'offline'} />
              </strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Email đã xác minh</span>
              <strong>{formatOptionalDate(user.emailVerifiedAt)}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Số điện thoại đã xác minh</span>
              <strong>{formatOptionalDate(user.phoneVerifiedAt)}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Dấu vết runtime</span>
              <strong>
                {user.activeSessionCount ?? '-'} phiên / {user.deviceCount ?? '-'} thiết bị
              </strong>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <DataTableShell
        title="Phiên"
        meta="Giữ trạng thái thu hồi và hạn dùng hiển thị rõ mà không buộc operator mở từng dòng."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">
              <span className="ds-shell-chip ds-shell-chip--ghost">
                {sessionsQuery.data?.pagination.total ?? 0} phiên
              </span>
            </span>
          </DataTableToolbar>
        }
      >
        {sessionsQuery.isError ? (
          <QueryStateView kind="error" compact description="Không thể tải danh sách phiên." />
        ) : (
          <DataTable
            rowKey="id"
            columns={sessionColumns}
            loading={sessionsQuery.isFetching && !sessionsQuery.isPending}
            minHeight={280}
            dataSource={sessionsQuery.data?.items ?? []}
            emptyNode={<EmptyState description="Không tìm thấy phiên nào." />}
            pagination={{
              current: sessionsQuery.data?.pagination.page,
              pageSize: sessionsQuery.data?.pagination.limit,
              total: sessionsQuery.data?.pagination.total,
              onChange: (page) => setSessionsPage(page),
            }}
          />
        )}
      </DataTableShell>

      <DataTableShell
        title="Thiết bị"
        meta="Hiển thị trạng thái push và hoạt động gần nhất để operator xem nhanh."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">
              <span className="ds-shell-chip ds-shell-chip--ghost">
                {devicesQuery.data?.pagination.total ?? 0} thiết bị
              </span>
            </span>
          </DataTableToolbar>
        }
      >
        {devicesQuery.isError ? (
          <QueryStateView kind="error" compact description="Không thể tải danh sách thiết bị." />
        ) : (
          <DataTable
            rowKey="id"
            columns={deviceColumns}
            loading={devicesQuery.isFetching && !devicesQuery.isPending}
            minHeight={280}
            dataSource={devicesQuery.data?.items ?? []}
            emptyNode={<EmptyState description="Không tìm thấy thiết bị nào." />}
            pagination={{
              current: devicesQuery.data?.pagination.page,
              pageSize: devicesQuery.data?.pagination.limit,
              total: devicesQuery.data?.pagination.total,
              onChange: (page) => setDevicesPage(page),
            }}
          />
        )}
      </DataTableShell>
      <Modal
        open={pendingAction !== null}
        title={actionTitle}
        okText="Xác nhận thao tác"
        cancelText="Hủy"
        confirmLoading={actionMutation.isPending}
        onCancel={() => {
          actionForm.resetFields();
          setPendingAction(null);
        }}
        onOk={() => void submitAction()}
      >
        <p>Thao tác được áp dụng bởi backend và sẽ được lưu vào nhật ký hỗ trợ.</p>
        <Form form={actionForm} layout="vertical">
          <Form.Item name="reason" label="Lý do thao tác" rules={[{ required: true, whitespace: true, message: 'Nhập lý do để tiếp tục.' }, { max: 240, message: 'Lý do tối đa 240 ký tự.' }]}>
            <Input.TextArea autoFocus autoSize={{ minRows: 3, maxRows: 6 }} maxLength={240} placeholder="Mô tả ngắn lý do hỗ trợ tài khoản" />
          </Form.Item>
          <Form.Item name="acknowledged" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Xác nhận trước khi tiếp tục.')) }]}>
            <Checkbox>Tôi xác nhận thao tác này cần được ghi nhận.</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </PageShell>
  );
};
