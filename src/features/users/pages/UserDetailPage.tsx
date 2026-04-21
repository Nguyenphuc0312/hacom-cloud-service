import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { sessionsClient, usersClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { UserActionPayload, UserDetail, UserDevice, UserSession } from '@/api/types';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { PageShell } from '@/components/PageShell';
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { StatusBadge } from '@/components/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { DataTable } from '@/components/ui/DataTable';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/utils/date';
import { canManageUsers } from '@/utils/role';

const formatOptionalDate = (value?: string | null): string => (value ? formatDateTime(value) : '-');

export const UserDetailPage = () => {
  const navigate = useNavigate();
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

  const confirmAction = (action: 'lock' | 'unlock' | 'revoke') => {
    if (!isAdminWriteActionsEnabled) {
      message.info('Các thao tác ghi đang bị tắt theo cấu hình phát hành.');
      return;
    }

    if (!canManageUsers(currentRole)) {
      message.warning('Vai trò hiện tại của bạn không thể thực hiện thao tác ghi lên người dùng.');
      return;
    }

    const titleMap: Record<typeof action, string> = {
      lock: 'Khóa tài khoản',
      unlock: 'Mở khóa tài khoản',
      revoke: 'Thu hồi phiên đang hoạt động',
    };

    const contentMap: Record<typeof action, string> = {
      lock: 'Tài khoản sẽ bị khóa và toàn bộ phiên đang hoạt động sẽ bị vô hiệu hóa.',
      unlock: 'Tài khoản sẽ được bật lại.',
      revoke: 'Toàn bộ phiên đang hoạt động của người dùng này sẽ bị thu hồi ngay lập tức.',
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
        description="Xem danh tính, xác minh, phiên và thiết bị."
      >
        <QueryStateView kind="loading" title="Đang tải chi tiết người dùng..." />
      </PageShell>
    );
  }

  if ((detailQuery.isError && !detailQuery.data) || !detailQuery.data) {
    return (
      <PageShell
        title="Chi tiết người dùng"
        description="Xem danh tính, xác minh, phiên và thiết bị."
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
      description="Đặt danh tính và tư thế bảo mật lên trên cùng, sau đó mới đi vào phiên và thiết bị."
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
                  onClick: () => confirmAction('lock'),
                },
                {
                  key: 'unlock',
                  label: 'Mở khóa tài khoản',
                  disabled: !canWriteUserActions || user.accountStatus !== 'DISABLED',
                  onClick: () => confirmAction('unlock'),
                },
                {
                  key: 'revoke',
                  label: 'Thu hồi phiên',
                  disabled: !canWriteUserActions,
                  onClick: () => confirmAction('revoke'),
                },
              ]}
            />
          </div>
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

      <div className="ds-detail-overview-grid">
        <div className="ds-summary-tile">
          <span className="ds-summary-tile-label">Trạng thái tài khoản</span>
          <div className="ds-summary-tile-value">
            <StatusBadge status={user.accountStatus} />
          </div>
          <span className="ds-summary-tile-meta">Trạng thái truy cập hiện tại từ auth-service.</span>
        </div>
        <div className="ds-summary-tile">
          <span className="ds-summary-tile-label">Hiện diện</span>
          <div className="ds-summary-tile-value">
            <StatusBadge status={user.status ?? 'offline'} />
          </div>
          <span className="ds-summary-tile-meta">Trạng thái hiện diện mới nhất mà panel ghi nhận.</span>
        </div>
        <div className="ds-summary-tile">
          <span className="ds-summary-tile-label">Phiên đang hoạt động</span>
          <strong className="ds-summary-tile-value">{user.activeSessionCount ?? 0}</strong>
          <span className="ds-summary-tile-meta">Các phiên trình duyệt hoặc thiết bị còn mở.</span>
        </div>
        <div className="ds-summary-tile">
          <span className="ds-summary-tile-label">Thiết bị đã biết</span>
          <strong className="ds-summary-tile-value">{user.deviceCount ?? 0}</strong>
          <span className="ds-summary-tile-meta">Bản ghi thiết bị đã đăng ký gắn với tài khoản.</span>
        </div>
      </div>

      <div className="ds-detail-grid">
        <SurfaceCard
          eyebrow="Danh tính và tổ chức"
          title={user.username ?? 'Chưa có username'}
          description="Định danh cốt lõi, thông tin sở hữu và hoạt động gần nhất."
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
          description="Mốc thời gian xác minh, dấu vết tài khoản và định danh runtime."
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
                {user.activeSessionCount ?? 0} phiên / {user.deviceCount ?? 0} thiết bị
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
    </PageShell>
  );
};
