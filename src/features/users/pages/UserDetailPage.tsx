import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { sessionsClient, usersClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { UserActionPayload, UserDevice, UserSession } from '@/api/types';
import { AdminTable } from '@/components/AdminTable';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { PageShell } from '@/components/PageShell';
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { StatusBadge } from '@/components/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
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
        message.success('Account locked.');
      } else if (variables.action === 'unlock') {
        message.success('Account unlocked.');
      } else {
        message.success('Sessions revoked.');
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
      message.warning('Your current role cannot run user write actions.');
      return;
    }

    const titleMap: Record<typeof action, string> = {
      lock: 'Lock account',
      unlock: 'Unlock account',
      revoke: 'Revoke active sessions',
    };

    const contentMap: Record<typeof action, string> = {
      lock: 'The account will be locked and active sessions will be invalidated.',
      unlock: 'The account will be re-enabled.',
      revoke: 'All active sessions for this user will be revoked immediately.',
    };

    Modal.confirm({
      title: titleMap[action],
      content: contentMap[action],
      okText: 'Confirm',
      cancelText: 'Cancel',
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
        title: 'State',
        dataIndex: 'isRevoked',
        render: (value: boolean) => <StatusBadge status={value ? 'disabled' : 'active'} />,
      },
      {
        title: 'Last used',
        dataIndex: 'lastUsedAt',
        render: (value) => formatOptionalDate(value),
      },
      {
        title: 'Expires',
        dataIndex: 'expiresAt',
        render: (value) => formatOptionalDate(value),
      },
    ],
    [],
  );

  const deviceColumns = useMemo<ColumnsType<UserDevice>>(
    () => [
      { title: 'Device name', dataIndex: 'deviceName', render: (value) => value ?? '-' },
      { title: 'Platform', dataIndex: 'platform', render: (value) => value ?? '-' },
      {
        title: 'Push',
        dataIndex: 'pushEnabled',
        render: (value: boolean | null) => (
          <StatusBadge status={value === null ? 'unknown' : value ? 'enabled' : 'inactive'} />
        ),
      },
      {
        title: 'Last active',
        dataIndex: 'lastActiveAt',
        render: (value: string | null) => formatOptionalDate(value),
      },
    ],
    [],
  );

  if (!userId) {
    return (
      <PageShell title="User Detail" description="A user id is required to load this page.">
        <QueryStateView kind="error" description="Missing user id." />
      </PageShell>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <PageShell
        title="User Detail"
        description="Review identity, verification, sessions, and devices from a single operator-focused profile."
      >
        <QueryStateView kind="loading" title="Loading user detail..." />
      </PageShell>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <PageShell
        title="User Detail"
        description="Review identity, verification, sessions, and devices from a single operator-focused profile."
      >
        <QueryStateView
          kind="error"
          description="Unable to load user detail."
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
      title="User Detail"
      description="Keep the top of the page focused on state, footprint, and identity. Move deeper session and device inspection below the fold."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <span className="ds-shell-chip">{user.email}</span>
            <span className="ds-shell-chip ds-shell-chip--ghost">{user.id}</span>
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button onClick={() => navigate('/users')}>Back to users</Button>
            <RowActionsDropdown
              actions={[
                {
                  key: 'lock',
                  label: 'Lock account',
                  danger: true,
                  disabled: !canWriteUserActions || user.accountStatus === 'DISABLED',
                  onClick: () => confirmAction('lock'),
                },
                {
                  key: 'unlock',
                  label: 'Unlock account',
                  disabled: !canWriteUserActions || user.accountStatus !== 'DISABLED',
                  onClick: () => confirmAction('unlock'),
                },
                {
                  key: 'revoke',
                  label: 'Revoke sessions',
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
              ? 'Write actions are disabled by release configuration.'
              : 'Your current role is read-only for lock, unlock, and session revocation.'
          }
        />
      )}

      <div className="ds-detail-overview-grid">
        <div className="ds-summary-tile">
          <span className="ds-summary-tile-label">Account state</span>
          <div className="ds-summary-tile-value">
            <StatusBadge status={user.accountStatus} />
          </div>
          <span className="ds-summary-tile-meta">Current access state from auth-service.</span>
        </div>
        <div className="ds-summary-tile">
          <span className="ds-summary-tile-label">Presence</span>
          <div className="ds-summary-tile-value">
            <StatusBadge status={user.status ?? 'offline'} />
          </div>
          <span className="ds-summary-tile-meta">Latest presence state seen by the panel.</span>
        </div>
        <div className="ds-summary-tile">
          <span className="ds-summary-tile-label">Active sessions</span>
          <strong className="ds-summary-tile-value">{user.activeSessionCount ?? 0}</strong>
          <span className="ds-summary-tile-meta">Open browser or device sessions.</span>
        </div>
        <div className="ds-summary-tile">
          <span className="ds-summary-tile-label">Known devices</span>
          <strong className="ds-summary-tile-value">{user.deviceCount ?? 0}</strong>
          <span className="ds-summary-tile-meta">Registered device records tied to the account.</span>
        </div>
      </div>

      <div className="ds-detail-grid">
        <SurfaceCard
          eyebrow="Identity"
          title={user.username ?? 'No username'}
          description="Core account identifiers and contact information."
          className="ds-detail-panel"
        >
          <div className="ds-detail-list">
            <div className="ds-detail-list-item">
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Employee ID</span>
              <strong>{user.employeeId ?? '-'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Phone</span>
              <strong>{user.phone ?? '-'}</strong>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Organisation"
          title={user.orgUnit ?? 'No org unit'}
          description="Work context and ownership fields."
          className="ds-detail-panel"
        >
          <div className="ds-detail-list">
            <div className="ds-detail-list-item">
              <span>Title</span>
              <strong>{user.title ?? '-'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Last seen</span>
              <strong>{formatOptionalDate(user.lastSeen)}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>User ID</span>
              <code>{user.id}</code>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Verification"
          title="Security posture"
          description="Verification timestamps and account footprint."
          className="ds-detail-panel"
        >
          <div className="ds-detail-list">
            <div className="ds-detail-list-item">
              <span>Email verified</span>
              <strong>{formatOptionalDate(user.emailVerifiedAt)}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Phone verified</span>
              <strong>{formatOptionalDate(user.phoneVerifiedAt)}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Runtime footprint</span>
              <strong>
                {user.activeSessionCount ?? 0} sessions / {user.deviceCount ?? 0} devices
              </strong>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <DataTableShell
        title="Sessions"
        meta="Keep revoked state and expiry visible without forcing operators to open each row."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">
              <span className="ds-shell-chip ds-shell-chip--ghost">
                {sessionsQuery.data?.pagination.total ?? 0} session{(sessionsQuery.data?.pagination.total ?? 0) === 1 ? '' : 's'}
              </span>
            </span>
          </DataTableToolbar>
        }
      >
        {sessionsQuery.isError ? (
          <QueryStateView kind="error" compact description="Unable to load sessions." />
        ) : (
          <AdminTable
            rowKey="id"
            columns={sessionColumns}
            loading={sessionsQuery.isLoading}
            minHeight={280}
            dataSource={sessionsQuery.data?.items ?? []}
            emptyNode={<EmptyState description="No sessions found." />}
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
        title="Devices"
        meta="Surface push state and last activity for fast operator review."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">
              <span className="ds-shell-chip ds-shell-chip--ghost">
                {devicesQuery.data?.pagination.total ?? 0} device{(devicesQuery.data?.pagination.total ?? 0) === 1 ? '' : 's'}
              </span>
            </span>
          </DataTableToolbar>
        }
      >
        {devicesQuery.isError ? (
          <QueryStateView kind="error" compact description="Unable to load devices." />
        ) : (
          <AdminTable
            rowKey="id"
            columns={deviceColumns}
            loading={devicesQuery.isLoading}
            minHeight={280}
            dataSource={devicesQuery.data?.items ?? []}
            emptyNode={<EmptyState description="No devices found." />}
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
