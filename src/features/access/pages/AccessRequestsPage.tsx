import { keepPreviousData, useQueries, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Popconfirm, Select, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import { accessClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { AccessRequestDetail, AccessRequestListItem } from '@/api/types';
import { AppDrawer } from '@/components/AppDrawer';
import { AppIcon } from '@/components/AppIcon';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { DateTimeCell } from '@/components/DateTimeCell';
import { FilterBar } from '@/components/FilterBar';
import { MetaCell } from '@/components/MetaCell';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { SourceBadge } from '@/components/SourceBadge';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatDateTime } from '@/utils/date';

type AccessAction = 'approve' | 'reject' | 'revoke';

const statusOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Revoked', value: 'revoked' },
  { label: 'Expired', value: 'expired' },
];

const actionLabels: Record<AccessAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  revoke: 'Revoke',
};

const actionSuccessMessages: Record<AccessAction, string> = {
  approve: 'Access request approved.',
  reject: 'Access request rejected.',
  revoke: 'Access request revoked.',
};

const actionFallbackReasons: Record<AccessAction, string> = {
  approve: 'approved_from_admin_panel',
  reject: 'rejected_from_admin_panel',
  revoke: 'revoked_from_admin_panel',
};

const isActionAvailable = (status: AccessRequestListItem['status'], action: AccessAction) => {
  if (action === 'approve') return status === 'pending';
  if (action === 'reject') return status === 'pending';
  return status === 'approved';
};

const renderLinkedUsers = (request: AccessRequestDetail) => {
  if (request.linkedUsers.length === 0) {
    return <EmptyState description="No linked users were returned for this IP." compact />;
  }

  return (
    <div className="ds-detail-list">
      {request.linkedUsers.slice(0, 5).map((user) => (
        <div key={user.userId} className="ds-detail-list-item">
          <span>{user.email ?? user.username ?? user.userId}</span>
          <strong>{formatDateTime(user.lastSeenAt)}</strong>
        </div>
      ))}
      {request.linkedUsers.length > 5 ? (
        <div className="ds-detail-list-item">
          <span>Other users</span>
          <strong>+{request.linkedUsers.length - 5}</strong>
        </div>
      ) : null}
    </div>
  );
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

  const summaryQueries = useQueries({
    queries: ['approved', 'pending', 'rejected', 'expired'].map((status) => ({
      queryKey: queryKeys.accessIpRequests(`summary-${status}`),
      queryFn: () => accessClient.listRequests({ page: 1, limit: 1, status }),
      placeholderData: keepPreviousData,
    })),
  });

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
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery({
    queryKey: selectedId
      ? queryKeys.accessIpRequestDetail(selectedId)
      : ['access-ip-request-detail-empty'],
    queryFn: () => accessClient.getRequestDetail(selectedId ?? ''),
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
      ]);
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const columns = useMemo<ColumnsType<AccessRequestListItem>>(
    () => [
      {
        title: 'IP Address',
        dataIndex: 'ipAddress',
        width: 170,
        fixed: 'left',
        render: (value: string) => <MetaCell primary={value} />,
      },
      {
        title: 'Normalized IP',
        dataIndex: 'normalizedIp',
        width: 170,
        render: (value: string) => <MetaCell primary={value} />,
      },
      {
        title: 'Scope',
        dataIndex: 'scope',
        width: 130,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        width: 130,
        render: (value: AccessRequestListItem['status']) => <StatusBadge status={value} />,
      },
      {
        title: 'Source',
        dataIndex: 'source',
        width: 140,
        render: (value: AccessRequestListItem['source']) => <SourceBadge source={value} />,
      },
      {
        title: 'Matched Rule',
        key: 'matchedRule',
        width: 220,
        ellipsis: true,
        render: (_, record) => <MetaCell primary={record.reason ?? record.note ?? '-'} />,
      },
      {
        title: 'First Seen',
        dataIndex: 'firstSeenAt',
        width: 170,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Last Seen',
        dataIndex: 'lastSeenAt',
        width: 170,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Expires At',
        dataIndex: 'expiresAt',
        width: 170,
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
                onClick: () => setSelectedId(record.id),
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
  const activeFilterCount = [filters.status, filters.keyword].filter(Boolean).length;
  const summary = {
    approved: summaryQueries[0].data?.pagination.total ?? '-',
    pending: summaryQueries[1].data?.pagination.total ?? '-',
    rejected: summaryQueries[2].data?.pagination.total ?? '-',
    expired: summaryQueries[3].data?.pagination.total ?? '-',
  };

  const pageHeader = {
    eyebrow: 'Access Control',
    title: 'Admin Access Control',
    description: 'Review IP approvals, access requests, and admin console access state.',
  };

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Loading access requests..." />
      </PageShell>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description="Unable to load admin access requests."
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
        {...pageHeader}
        headerExtra={
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<AppIcon name="refresh" size={14} />}
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
        <section className="ds-ops-summary-grid" aria-label="Access request summary">
          <StatCard title="Approved" value={summary.approved} meta="Approved IP access" />
          <StatCard title="Pending" value={summary.pending} meta="Needs operator review" />
          <StatCard title="Rejected" value={summary.rejected} meta="Rejected requests" />
          <StatCard title="Expiring Soon" value={summary.expired} meta="Expired or expiring queue" />
        </section>

        <FilterBar>
          <Form
            form={form}
            layout="inline"
            className="ds-toolbar-form"
            initialValues={{ status: filters.status }}
          >
            <Form.Item label="Status" name="status" className="ds-toolbar-field ds-toolbar-field--md">
              <Select allowClear options={statusOptions} placeholder="All statuses" />
            </Form.Item>
            <Form.Item label="Search" name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
              <Input allowClear placeholder="IP address or user email" />
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
            <span>{listQuery.data?.pagination.total ?? 0} matching requests</span>
            <span>{activeFilterCount > 0 ? `${activeFilterCount} active filters` : 'No filters'}</span>
          </div>
        </FilterBar>

        <DataTableShell
          title="IP Approval Queue"
          meta="Raw access details stay in the drawer so long values do not break table scanning."
          toolbar={
            <DataTableToolbar>
              <span className="ds-toolbar-summary">
                Page {listQuery.data?.pagination.page ?? 1} / {listQuery.data?.pagination.totalPages ?? 1}
              </span>
            </DataTableToolbar>
          }
        >
          <DataTable
            rowKey="id"
            columns={columns}
            minHeight={420}
            dataSource={listQuery.data?.items ?? []}
            loading={listQuery.isFetching && !listQuery.isLoading}
            emptyNode={<EmptyState description="No access requests match the current filters." />}
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
        title="Access Request Detail"
        width={620}
      >
        {!selectedId ? (
          <EmptyState description="Select a request to inspect." />
        ) : detailQuery.isLoading && !selectedRequest ? (
          <QueryStateView kind="loading" compact title="Loading access detail..." />
        ) : detailQuery.isError ? (
          <QueryStateView
            kind="error"
            compact
            description="Unable to load access detail."
            onRetry={() => {
              void detailQuery.refetch();
            }}
          />
        ) : !selectedRequest ? (
          <EmptyState description="Access detail is not available." />
        ) : (
          <div className="ds-settings-stack">
            <SurfaceCard
              eyebrow="Review Context"
              title={selectedRequest.normalizedIp}
              status={<StatusBadge status={selectedRequest.status} />}
            >
              <div className="ds-detail-list">
                <div className="ds-detail-list-item">
                  <span>Scope</span>
                  <strong>{selectedRequest.scope}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Source</span>
                  <strong>
                    <SourceBadge source={selectedRequest.source} />
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>IP Address</span>
                  <strong>{selectedRequest.ipAddress}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Last Requested</span>
                  <strong>
                    {selectedRequest.lastRequestedAt
                      ? formatDateTime(selectedRequest.lastRequestedAt)
                      : '-'}
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Last Seen</span>
                  <strong>{formatDateTime(selectedRequest.lastSeenAt)}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Expires At</span>
                  <strong>
                    {selectedRequest.expiresAt ? formatDateTime(selectedRequest.expiresAt) : '-'}
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>User Agent</span>
                  <strong>{selectedRequest.lastUserAgent ?? '-'}</strong>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard eyebrow="Footprint" title="Linked Users">
              {renderLinkedUsers(selectedRequest)}
            </SurfaceCard>

            <SurfaceCard eyebrow="Decision" title="Approve, reject, or revoke">
              <Input.TextArea
                rows={3}
                value={actionReason}
                placeholder="Reason for this decision"
                onChange={(event) => setActionReason(event.target.value)}
              />
              <div className="ds-settings-action-bar">
                <span className="ds-settings-action-copy">
                  Dangerous access decisions require confirmation and are audited by the backend.
                </span>
                <Space wrap>
                  <Popconfirm
                    title="Approve this access request?"
                    okText="Approve"
                    cancelText="Cancel"
                    onConfirm={() => actionMutation.mutate({ action: 'approve', id: selectedRequest.id })}
                    disabled={!isActionAvailable(selectedRequest.status, 'approve')}
                  >
                    <Button
                      type="primary"
                      disabled={!isActionAvailable(selectedRequest.status, 'approve')}
                      loading={actionMutation.isPending && actionMutation.variables?.action === 'approve'}
                    >
                      {actionLabels.approve}
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    title="Reject this access request?"
                    okText="Reject"
                    cancelText="Cancel"
                    onConfirm={() => actionMutation.mutate({ action: 'reject', id: selectedRequest.id })}
                    disabled={!isActionAvailable(selectedRequest.status, 'reject')}
                  >
                    <Button
                      danger
                      disabled={!isActionAvailable(selectedRequest.status, 'reject')}
                      loading={actionMutation.isPending && actionMutation.variables?.action === 'reject'}
                    >
                      {actionLabels.reject}
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    title="Revoke this access request?"
                    okText="Revoke"
                    cancelText="Cancel"
                    onConfirm={() => actionMutation.mutate({ action: 'revoke', id: selectedRequest.id })}
                    disabled={!isActionAvailable(selectedRequest.status, 'revoke')}
                  >
                    <Button
                      danger
                      disabled={!isActionAvailable(selectedRequest.status, 'revoke')}
                      loading={actionMutation.isPending && actionMutation.variables?.action === 'revoke'}
                    >
                      {actionLabels.revoke}
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
            </SurfaceCard>
          </div>
        )}
      </AppDrawer>
    </>
  );
};
