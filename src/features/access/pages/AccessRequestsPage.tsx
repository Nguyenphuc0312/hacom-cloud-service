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
  { label: 'Chờ duyệt', value: 'pending' },
  { label: 'Đã duyệt', value: 'approved' },
  { label: 'Đã từ chối', value: 'rejected' },
  { label: 'Đã thu hồi', value: 'revoked' },
  { label: 'Hết hạn', value: 'expired' },
];

const actionLabels: Record<AccessAction, string> = {
  approve: 'Duyệt',
  reject: 'Từ chối',
  revoke: 'Thu hồi',
};

const actionSuccessMessages: Record<AccessAction, string> = {
  approve: 'Đã duyệt yêu cầu truy cập.',
  reject: 'Đã từ chối yêu cầu truy cập.',
  revoke: 'Đã thu hồi yêu cầu truy cập.',
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
    return <EmptyState description="Không có người dùng liên kết được trả về cho IP này." compact />;
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
          <span>Người dùng khác</span>
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
        title: 'Địa chỉ IP',
        dataIndex: 'ipAddress',
        width: 170,
        fixed: 'left',
        render: (value: string) => <MetaCell primary={value} />,
      },
      {
        title: 'IP chuẩn hóa',
        dataIndex: 'normalizedIp',
        width: 170,
        render: (value: string) => <MetaCell primary={value} />,
      },
      {
        title: 'Phạm vi',
        dataIndex: 'scope',
        width: 130,
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        width: 130,
        render: (value: AccessRequestListItem['status']) => <StatusBadge status={value} />,
      },
      {
        title: 'Nguồn',
        dataIndex: 'source',
        width: 140,
        render: (value: AccessRequestListItem['source']) => <SourceBadge source={value} />,
      },
      {
        title: 'Rule khớp',
        key: 'matchedRule',
        width: 220,
        ellipsis: true,
        render: (_, record) => <MetaCell primary={record.reason ?? record.note ?? '-'} />,
      },
      {
        title: 'Thấy lần đầu',
        dataIndex: 'firstSeenAt',
        width: 170,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Thấy lần cuối',
        dataIndex: 'lastSeenAt',
        width: 170,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Hết hạn lúc',
        dataIndex: 'expiresAt',
        width: 170,
        render: (value: string | null) => <DateTimeCell value={value} />,
      },
      {
        title: 'Thao tác',
        key: 'actions',
        width: 84,
        fixed: 'right',
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Xem chi tiết',
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
    eyebrow: 'Kiểm soát truy cập',
    title: 'Kiểm soát truy cập admin',
    description: 'Duyệt IP, yêu cầu truy cập và trạng thái vào console admin.',
  };

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Đang tải yêu cầu truy cập..." />
      </PageShell>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description="Không thể tải yêu cầu truy cập admin."
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
              Làm mới
            </Button>
          </div>
        }
      >
        <section className="ds-ops-summary-grid" aria-label="Access request summary">
          <StatCard title="Đã duyệt" value={summary.approved} meta="IP được phép truy cập" />
          <StatCard title="Chờ duyệt" value={summary.pending} meta="Cần operator rà soát" />
          <StatCard title="Đã từ chối" value={summary.rejected} meta="Yêu cầu bị từ chối" />
          <StatCard title="Sắp hết hạn" value={summary.expired} meta="Hết hạn hoặc sắp hết hạn" />
        </section>

        <FilterBar>
          <Form
            form={form}
            layout="inline"
            className="ds-toolbar-form"
            initialValues={{ status: filters.status }}
          >
            <Form.Item label="Trạng thái" name="status" className="ds-toolbar-field ds-toolbar-field--md">
              <Select allowClear options={statusOptions} placeholder="Tất cả trạng thái" />
            </Form.Item>
            <Form.Item label="Tìm kiếm" name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
              <Input allowClear placeholder="Địa chỉ IP hoặc email người dùng" />
            </Form.Item>
            <Form.Item className="ds-toolbar-field ds-toolbar-actions">
              <Space>
                <Button type="primary" onClick={applyFilters}>
                  Áp dụng
                </Button>
                <Button onClick={resetFilters}>Đặt lại</Button>
              </Space>
            </Form.Item>
          </Form>
          <div className="ds-filter-toolbar-meta">
            <span>{listQuery.data?.pagination.total ?? 0} yêu cầu khớp</span>
            <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang bật` : 'Chưa lọc'}</span>
          </div>
        </FilterBar>

        <DataTableShell
          title="Hàng đợi duyệt IP"
          meta="Chi tiết truy cập nằm trong drawer để bảng luôn dễ quét."
          toolbar={
            <DataTableToolbar>
              <span className="ds-toolbar-summary">
                Trang {listQuery.data?.pagination.page ?? 1} / {listQuery.data?.pagination.totalPages ?? 1}
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
            emptyNode={<EmptyState description="Không có yêu cầu truy cập khớp bộ lọc hiện tại." />}
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
        title="Chi tiết yêu cầu truy cập"
        width={620}
      >
        {!selectedId ? (
          <EmptyState description="Chọn một yêu cầu để xem chi tiết." />
        ) : detailQuery.isLoading && !selectedRequest ? (
          <QueryStateView kind="loading" compact title="Đang tải chi tiết truy cập..." />
        ) : detailQuery.isError ? (
          <QueryStateView
            kind="error"
            compact
            description="Không thể tải chi tiết truy cập."
            onRetry={() => {
              void detailQuery.refetch();
            }}
          />
        ) : !selectedRequest ? (
          <EmptyState description="Không có chi tiết truy cập." />
        ) : (
          <div className="ds-settings-stack">
            <SurfaceCard
              eyebrow="Ngữ cảnh duyệt"
              title={selectedRequest.normalizedIp}
              status={<StatusBadge status={selectedRequest.status} />}
            >
              <div className="ds-detail-list">
                <div className="ds-detail-list-item">
                  <span>Phạm vi</span>
                  <strong>{selectedRequest.scope}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Nguồn</span>
                  <strong>
                    <SourceBadge source={selectedRequest.source} />
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Địa chỉ IP</span>
                  <strong>{selectedRequest.ipAddress}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Yêu cầu gần nhất</span>
                  <strong>
                    {selectedRequest.lastRequestedAt
                      ? formatDateTime(selectedRequest.lastRequestedAt)
                      : '-'}
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Thấy lần cuối</span>
                  <strong>{formatDateTime(selectedRequest.lastSeenAt)}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Hết hạn lúc</span>
                  <strong>
                    {selectedRequest.expiresAt ? formatDateTime(selectedRequest.expiresAt) : '-'}
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Thông tin trình duyệt</span>
                  <strong>{selectedRequest.lastUserAgent ?? '-'}</strong>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard eyebrow="Dấu vết" title="Người dùng liên kết">
              {renderLinkedUsers(selectedRequest)}
            </SurfaceCard>

            <SurfaceCard eyebrow="Quyết định" title="Duyệt, từ chối hoặc thu hồi">
              <Input.TextArea
                rows={3}
                value={actionReason}
                placeholder="Lý do cho quyết định này"
                onChange={(event) => setActionReason(event.target.value)}
              />
              <div className="ds-settings-action-bar">
                <span className="ds-settings-action-copy">
                  Quyết định truy cập nhạy cảm cần xác nhận và được backend audit.
                </span>
                <Space wrap>
                  <Popconfirm
                    title="Duyệt yêu cầu truy cập này?"
                    okText="Duyệt"
                    cancelText="Hủy"
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
                    title="Từ chối yêu cầu truy cập này?"
                    okText="Từ chối"
                    cancelText="Hủy"
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
                    title="Thu hồi yêu cầu truy cập này?"
                    okText="Thu hồi"
                    cancelText="Hủy"
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
