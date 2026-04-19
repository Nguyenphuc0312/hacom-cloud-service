import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Select, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import { accessClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type {
  AccessRequestHistoryItem,
  AccessRequestListItem,
} from '@/api/types';
import { AppDrawer } from '@/components/AppDrawer';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { FilterBar } from '@/components/FilterBar';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { PageShell } from '@/components/PageShell';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatDateTime } from '@/utils/date';

type AccessAction = 'approve' | 'reject' | 'revoke';

const statusOptions = [
  { label: 'Pending first', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Revoked', value: 'revoked' },
  { label: 'Expired', value: 'expired' },
];

const actionLabels: Record<AccessAction, string> = {
  approve: 'Approve request',
  reject: 'Reject request',
  revoke: 'Revoke access',
};

const actionSuccessMessages: Record<AccessAction, string> = {
  approve: 'Request approved.',
  reject: 'Request rejected.',
  revoke: 'Access revoked.',
};

const actionFallbackReasons: Record<AccessAction, string> = {
  approve: 'approved_from_admin_panel',
  reject: 'rejected_from_admin_panel',
  revoke: 'revoked_from_admin_panel',
};

const renderRiskChips = (record: Pick<AccessRequestListItem, 'risk'>) => {
  if (!record.risk.sharedIp && !record.risk.expiringSoon) {
    return <span className="ds-shell-chip ds-shell-chip--ghost">No active risk flags</span>;
  }

  return (
    <div className="ds-admin-chip-list">
      {record.risk.sharedIp ? <span className="ds-shell-chip ds-shell-chip--warning">Shared IP</span> : null}
      {record.risk.expiringSoon ? (
        <span className="ds-shell-chip ds-shell-chip--warning">Expiring soon</span>
      ) : null}
    </div>
  );
};

const isActionAvailable = (status: AccessRequestListItem['status'], action: AccessAction) => {
  if (action === 'approve') return status === 'pending';
  if (action === 'reject') return status === 'pending';
  return status === 'approved';
};

export const AccessRequestsPage = () => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<{
    page: number;
    limit: number;
    status?: string;
    keyword?: string;
  }>({
    page: 1,
    limit: 20,
    status: 'pending',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState('');

  const listQuery = useQuery({
    queryKey: queryKeys.accessIpRequests(JSON.stringify(filters)),
    queryFn: () =>
      accessClient.listRequests({
        page: filters.page,
        limit: filters.limit,
        status: filters.status,
        ip: filters.keyword,
        email: filters.keyword,
      }),
  });

  const detailQuery = useQuery({
    queryKey: selectedId
      ? queryKeys.accessIpRequestDetail(selectedId)
      : ['access-ip-request-detail-empty'],
    queryFn: () => accessClient.getRequestDetail(selectedId ?? ''),
    enabled: Boolean(selectedId),
  });

  const historyQuery = useQuery({
    queryKey: selectedId
      ? queryKeys.accessIpRequestHistory(selectedId)
      : ['access-ip-request-history-empty'],
    queryFn: () => accessClient.getRequestHistory(selectedId ?? ''),
    enabled: Boolean(selectedId),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, id }: { action: AccessAction; id: string }) => {
      const reason = actionReason.trim() || actionFallbackReasons[action];
      const payload = {
        reason,
        note: actionReason.trim() || undefined,
      };

      if (action === 'approve') {
        return accessClient.approveRequest(id, payload);
      }

      if (action === 'reject') {
        return accessClient.rejectRequest(id, payload);
      }

      return accessClient.revokeRequest(id, payload);
    },
    onSuccess: async (_data, variables) => {
      message.success(actionSuccessMessages[variables.action]);
      setActionReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['access-ip-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['access-ip-request-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['access-ip-request-history'] }),
      ]);
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const activeFilterCount = [filters.status, filters.keyword].filter(Boolean).length;

  const columns = useMemo<ColumnsType<AccessRequestListItem>>(
    () => [
      {
        title: 'Request',
        key: 'request',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.normalizedIp}</strong>
            <span>
              Scope: {record.scope} · Source: {record.source}
            </span>
          </div>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        width: 140,
        render: (value: AccessRequestListItem['status']) => <StatusBadge status={value} />,
      },
      {
        title: 'Linked users',
        dataIndex: 'requestUserCount',
        width: 120,
      },
      {
        title: 'Last seen',
        dataIndex: 'lastSeenAt',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Expires',
        dataIndex: 'expiresAt',
        width: 180,
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: 'Risk',
        key: 'risk',
        render: (_, record) => renderRiskChips(record),
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
                onClick: () => setSelectedId(record.id),
              },
              {
                key: 'approve',
                label: actionLabels.approve,
                disabled:
                  actionMutation.isPending || !isActionAvailable(record.status, 'approve'),
                onClick: () => actionMutation.mutate({ action: 'approve', id: record.id }),
              },
              {
                key: 'reject',
                label: actionLabels.reject,
                danger: true,
                disabled:
                  actionMutation.isPending || !isActionAvailable(record.status, 'reject'),
                onClick: () => actionMutation.mutate({ action: 'reject', id: record.id }),
              },
              {
                key: 'revoke',
                label: actionLabels.revoke,
                danger: true,
                disabled:
                  actionMutation.isPending || !isActionAvailable(record.status, 'revoke'),
                onClick: () => actionMutation.mutate({ action: 'revoke', id: record.id }),
              },
            ]}
          />
        ),
      },
    ],
    [actionMutation],
  );

  const historyColumns = useMemo<ColumnsType<AccessRequestHistoryItem>>(
    () => [
      {
        title: 'Time',
        dataIndex: 'createdAt',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Action',
        dataIndex: 'action',
        width: 140,
      },
      {
        title: 'Status change',
        key: 'statusChange',
        width: 220,
        render: (_, record) => (
          <span>
            {record.previousStatus ?? '-'} → {record.newStatus ?? '-'}
          </span>
        ),
      },
      {
        title: 'Actor',
        dataIndex: 'actorUserId',
        render: (value: string | null) => value ?? 'System',
      },
      {
        title: 'Reason',
        key: 'reason',
        render: (_, record) => record.note ?? record.reason ?? '-',
      },
    ],
    [],
  );

  const applyFilters = () => {
    const values = form.getFieldsValue() as {
      status?: string;
      keyword?: string;
    };

    setFilters((current) => ({
      ...current,
      page: 1,
      status: values.status || undefined,
      keyword: values.keyword?.trim() || undefined,
    }));
  };

  const resetFilters = () => {
    form.resetFields();
    setFilters((current) => ({
      ...current,
      page: 1,
      status: 'pending',
      keyword: undefined,
    }));
  };

  const selectedRequest = detailQuery.data;

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <PageShell
        title="IP Access Requests"
        description="Review pending IP requests, shared-address risk, and approval history."
      >
        <QueryStateView kind="loading" title="Loading IP access requests..." />
      </PageShell>
    );
  }

  if (listQuery.isError) {
    return (
      <PageShell
        title="IP Access Requests"
        description="Review pending IP requests, shared-address risk, and approval history."
      >
        <QueryStateView
          kind="error"
          description="Unable to load IP access requests."
          onRetry={() => {
            void listQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  return (
    <>
      <PageShell
        title="IP Access Requests"
        description="Use this queue to approve, reject, or revoke IP-based access without losing user and audit context."
        headerExtra={
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching}
              onClick={() => {
                void listQuery.refetch();
              }}
            >
              Refresh
            </Button>
          </div>
        }
      >
        <FilterBar>
          <Form
            form={form}
            layout="inline"
            className="ds-toolbar-form"
            initialValues={{ status: filters.status }}
          >
            <Form.Item
              label="Status"
              name="status"
              className="ds-toolbar-field ds-toolbar-field--md"
            >
              <Select allowClear options={statusOptions} placeholder="All statuses" />
            </Form.Item>
            <Form.Item
              label="Search"
              name="keyword"
              className="ds-toolbar-field ds-toolbar-field--lg"
            >
              <Input allowClear placeholder="IP or user email" />
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
              {listQuery.data?.pagination.total ?? 0} matched request
              {(listQuery.data?.pagination.total ?? 0) === 1 ? '' : 's'}
            </span>
            <span>
              {activeFilterCount > 0
                ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}`
                : 'No active filters'}
            </span>
            <span>
              Last sync:{' '}
              {listQuery.dataUpdatedAt
                ? formatDateTime(new Date(listQuery.dataUpdatedAt).toISOString())
                : '-'}
            </span>
          </div>
        </FilterBar>

        <DataTableShell
          title="Approval queue"
          meta="Keep the risky requests visible, then open detail only when you need linked-user and history context."
          toolbar={
            <DataTableToolbar>
              <span className="ds-toolbar-summary">
                Page {listQuery.data?.pagination.page ?? 1} of{' '}
                {listQuery.data?.pagination.totalPages ?? 1}
              </span>
            </DataTableToolbar>
          }
        >
          <DataTable
            rowKey="id"
            columns={columns}
            minHeight={360}
            dataSource={listQuery.data?.items ?? []}
            emptyNode={<EmptyState description="No access requests matched the current filters." />}
            onRow={(record) => ({
              onClick: () => setSelectedId(record.id),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedId(record.id);
                }
              },
              tabIndex: 0,
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: listQuery.data?.pagination.page,
              pageSize: listQuery.data?.pagination.limit,
              total: listQuery.data?.pagination.total,
              showSizeChanger: true,
              onChange: (page, pageSize) => {
                setFilters((current) => ({ ...current, page, limit: pageSize }));
              },
            }}
          />
        </DataTableShell>
      </PageShell>

      <AppDrawer
        open={Boolean(selectedId)}
        onClose={() => {
          setSelectedId(null);
          setActionReason('');
        }}
        title="IP access review"
        width={840}
      >
        {!selectedId ? (
          <EmptyState description="Select a request to inspect approval context." />
        ) : detailQuery.isLoading && !selectedRequest ? (
          <QueryStateView kind="loading" compact title="Loading request detail..." />
        ) : detailQuery.isError ? (
          <QueryStateView
            kind="error"
            compact
            description="Unable to load request detail."
            onRetry={() => {
              void detailQuery.refetch();
            }}
          />
        ) : !selectedRequest ? (
          <EmptyState description="Request detail is unavailable." />
        ) : (
          <div className="ds-settings-stack">
            <div className="ds-detail-overview-grid">
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Request status</span>
                <div className="ds-summary-tile-value">
                  <StatusBadge status={selectedRequest.status} />
                </div>
                <span className="ds-summary-tile-meta">Current access-review decision state.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Linked users</span>
                <strong className="ds-summary-tile-value">
                  {selectedRequest.linkedUsers.length}
                </strong>
                <span className="ds-summary-tile-meta">Accounts seen from this IP.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Source</span>
                <strong className="ds-summary-tile-value">{selectedRequest.source}</strong>
                <span className="ds-summary-tile-meta">How this request entered the system.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Expires</span>
                <strong className="ds-summary-tile-value">
                  {selectedRequest.expiresAt ? formatDateTime(selectedRequest.expiresAt) : '-'}
                </strong>
                <span className="ds-summary-tile-meta">Empty means no expiry is currently set.</span>
              </div>
            </div>

            <SurfaceCard
              eyebrow="Request context"
              title={selectedRequest.normalizedIp}
              description="Keep scope, reason, and network metadata visible before you approve or revoke access."
              status={<StatusBadge status={selectedRequest.status} />}
            >
              <div className="ds-detail-list">
                <div className="ds-detail-list-item">
                  <span>Scope</span>
                  <strong>{selectedRequest.scope}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Original IP</span>
                  <strong>{selectedRequest.ipAddress}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>First seen</span>
                  <strong>{formatDateTime(selectedRequest.firstSeenAt)}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Last seen</span>
                  <strong>{formatDateTime(selectedRequest.lastSeenAt)}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Approved by</span>
                  <strong>{selectedRequest.approvedBy ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Rejected by</span>
                  <strong>{selectedRequest.rejectedBy ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Reason</span>
                  <strong>{selectedRequest.reason ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Note</span>
                  <strong>{selectedRequest.note ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Forwarded chain</span>
                  <strong>
                    {selectedRequest.lastForwardedChain.length > 0
                      ? selectedRequest.lastForwardedChain.join(', ')
                      : '-'}
                  </strong>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Risk review"
              title="Shared-address and expiry signals"
              description="These flags help prevent approving transient or multi-user IPs without enough context."
            >
              {renderRiskChips(selectedRequest)}
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Linked users"
              title="Accounts observed on this IP"
              description="Review the user footprint before approving a shared or unusual address."
            >
              {selectedRequest.linkedUsers.length > 0 ? (
                <div className="ds-detail-list">
                  {selectedRequest.linkedUsers.map((user) => (
                    <div key={user.userId} className="ds-detail-list-item">
                      <span>{user.email ?? user.username ?? user.userId}</span>
                      <strong>{formatDateTime(user.lastSeenAt)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState description="No linked users were returned for this request." />
              )}
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Review action"
              title="Apply the decision with explicit operator intent"
              description="Approvals and revocations affect access enforcement immediately. Log a reason before proceeding."
            >
              <div className="ds-settings-action-copy">
                The note below is written into the action payload so later reviewers can understand
                why this IP was approved, rejected, or revoked.
              </div>
              <Input.TextArea
                rows={3}
                value={actionReason}
                placeholder="Reason for this decision"
                onChange={(event) => setActionReason(event.target.value)}
              />
              <div className="ds-settings-action-bar">
                <div className="ds-settings-action-copy">
                  Safe actions stay secondary. Destructive actions remain visually separated.
                </div>
                <Space wrap>
                  <Button
                    type="primary"
                    disabled={!isActionAvailable(selectedRequest.status, 'approve')}
                    loading={
                      actionMutation.isPending &&
                      actionMutation.variables?.action === 'approve'
                    }
                    onClick={() => actionMutation.mutate({ action: 'approve', id: selectedRequest.id })}
                  >
                    Approve
                  </Button>
                  <Button
                    danger
                    disabled={!isActionAvailable(selectedRequest.status, 'reject')}
                    loading={
                      actionMutation.isPending &&
                      actionMutation.variables?.action === 'reject'
                    }
                    onClick={() => actionMutation.mutate({ action: 'reject', id: selectedRequest.id })}
                  >
                    Reject
                  </Button>
                  <Button
                    danger
                    disabled={!isActionAvailable(selectedRequest.status, 'revoke')}
                    loading={
                      actionMutation.isPending &&
                      actionMutation.variables?.action === 'revoke'
                    }
                    onClick={() => actionMutation.mutate({ action: 'revoke', id: selectedRequest.id })}
                  >
                    Revoke
                  </Button>
                </Space>
              </div>
            </SurfaceCard>

            <DataTableShell
              title="Decision history"
              meta="Use the audit trail to understand how the request changed over time."
            >
              {historyQuery.isError ? (
                <QueryStateView kind="error" compact description="Unable to load request history." />
              ) : (
                <DataTable
                  rowKey="id"
                  columns={historyColumns}
                  minHeight={220}
                  loading={historyQuery.isLoading}
                  dataSource={historyQuery.data?.items ?? []}
                  pagination={false}
                  emptyNode={<EmptyState description="No history entries were returned." />}
                  scroll={{ x: 'max-content', y: 320 }}
                />
              )}
            </DataTableShell>
          </div>
        )}
      </AppDrawer>
    </>
  );
};
