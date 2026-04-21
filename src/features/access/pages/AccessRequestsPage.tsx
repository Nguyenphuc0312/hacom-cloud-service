import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Select, Space, message } from 'antd';
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
  { label: 'Ưu tiên chờ duyệt', value: 'pending' },
  { label: 'Đã duyệt', value: 'approved' },
  { label: 'Đã từ chối', value: 'rejected' },
  { label: 'Đã thu hồi', value: 'revoked' },
  { label: 'Hết hạn', value: 'expired' },
];

const actionLabels: Record<AccessAction, string> = {
  approve: 'Duyệt yêu cầu',
  reject: 'Từ chối yêu cầu',
  revoke: 'Thu hồi truy cập',
};

const actionSuccessMessages: Record<AccessAction, string> = {
  approve: 'Đã duyệt yêu cầu.',
  reject: 'Đã từ chối yêu cầu.',
  revoke: 'Đã thu hồi truy cập.',
};

const actionFallbackReasons: Record<AccessAction, string> = {
  approve: 'approved_from_admin_panel',
  reject: 'rejected_from_admin_panel',
  revoke: 'revoked_from_admin_panel',
};

const renderRiskChips = (record: Pick<AccessRequestListItem, 'risk'>) => {
  if (!record.risk.sharedIp && !record.risk.expiringSoon) {
    return <span className="ds-shell-chip ds-shell-chip--ghost">Không có cờ rủi ro</span>;
  }

  return (
    <div className="ds-admin-chip-list">
      {record.risk.sharedIp ? <span className="ds-shell-chip ds-shell-chip--warning">IP dùng chung</span> : null}
      {record.risk.expiringSoon ? (
        <span className="ds-shell-chip ds-shell-chip--warning">Sắp hết hạn</span>
      ) : null}
    </div>
  );
};

const isActionAvailable = (status: AccessRequestListItem['status'], action: AccessAction) => {
  if (action === 'approve') return status === 'pending';
  if (action === 'reject') return status === 'pending';
  return status === 'approved';
};

const renderLinkedUsers = (request: AccessRequestDetail) => {
  if (request.linkedUsers.length === 0) {
    return <EmptyState description="Không có tài khoản liên quan nào được trả về cho IP này." />;
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
          <span>Tài khoản còn lại</span>
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

  const activeFilterCount = [filters.status, filters.keyword].filter(Boolean).length;

  const columns = useMemo<ColumnsType<AccessRequestListItem>>(
    () => [
      {
        title: 'Yêu cầu',
        key: 'request',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.normalizedIp}</strong>
            <span>
              Phạm vi: {record.scope} · Nguồn: {record.source}
            </span>
          </div>
        ),
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        width: 140,
        render: (value: AccessRequestListItem['status']) => <StatusBadge status={value} />,
      },
      {
        title: 'Người dùng liên quan',
        dataIndex: 'requestUserCount',
        width: 140,
      },
      {
        title: 'Lần thấy gần nhất',
        dataIndex: 'lastSeenAt',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Hết hạn',
        dataIndex: 'expiresAt',
        width: 180,
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: 'Rủi ro',
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
                label: 'Mở duyệt nhanh',
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
        title="Yêu cầu truy cập IP"
        description="Hàng đợi duyệt nhanh cho các IP cần quyết định thủ công."
      >
        <QueryStateView kind="loading" title="Đang tải yêu cầu truy cập IP..." />
      </PageShell>
    );
  }

  if (listQuery.isError) {
    return (
      <PageShell
        title="Yêu cầu truy cập IP"
        description="Hàng đợi duyệt nhanh cho các IP cần quyết định thủ công."
      >
        <QueryStateView
          kind="error"
          description="Không thể tải yêu cầu truy cập IP."
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
        title="Yêu cầu truy cập IP"
        description="Page này chỉ làm một việc: xếp hàng, sàng lọc và quyết định truy cập IP."
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
        <FilterBar>
          <Form
            form={form}
            layout="inline"
            className="ds-toolbar-form"
            initialValues={{ status: filters.status }}
          >
            <Form.Item
              label="Trạng thái"
              name="status"
              className="ds-toolbar-field ds-toolbar-field--md"
            >
              <Select allowClear options={statusOptions} placeholder="Tất cả trạng thái" />
            </Form.Item>
            <Form.Item
              label="Tìm kiếm"
              name="keyword"
              className="ds-toolbar-field ds-toolbar-field--lg"
            >
              <Input allowClear placeholder="IP hoặc email người dùng" />
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
            <span>{listQuery.data?.pagination.total ?? 0} yêu cầu phù hợp</span>
            <span>
              {activeFilterCount > 0
                ? `${activeFilterCount} bộ lọc đang hoạt động`
                : 'Không có bộ lọc đang hoạt động'}
            </span>
            <span>
              Đồng bộ:{' '}
              {listQuery.dataUpdatedAt
                ? formatDateTime(new Date(listQuery.dataUpdatedAt).toISOString())
                : '-'}
            </span>
          </div>
        </FilterBar>

        <DataTableShell
          title="Hàng đợi phê duyệt"
          meta="Bảng là trọng tâm. Drawer chỉ giữ ngữ cảnh đủ để quyết định nhanh, không mang theo lịch sử dài."
          toolbar={
            <DataTableToolbar>
              <span className="ds-toolbar-summary">
                Trang {listQuery.data?.pagination.page ?? 1} /{' '}
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
            emptyNode={<EmptyState description="Không có yêu cầu truy cập nào khớp với bộ lọc hiện tại." />}
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
        title="Duyệt truy cập IP"
        width={620}
      >
        {!selectedId ? (
          <EmptyState description="Chọn một yêu cầu để duyệt nhanh." />
        ) : detailQuery.isLoading && !selectedRequest ? (
          <QueryStateView kind="loading" compact title="Đang tải chi tiết yêu cầu..." />
        ) : detailQuery.isError ? (
          <QueryStateView
            kind="error"
            compact
            description="Không thể tải chi tiết yêu cầu."
            onRetry={() => {
              void detailQuery.refetch();
            }}
          />
        ) : !selectedRequest ? (
          <EmptyState description="Chi tiết yêu cầu hiện không khả dụng." />
        ) : (
          <div className="ds-settings-stack">
            <SurfaceCard
              eyebrow="Ngữ cảnh duyệt"
              title={selectedRequest.normalizedIp}
              description="Giữ đủ nhận diện, rủi ro và footprint trước khi ra quyết định."
              status={<StatusBadge status={selectedRequest.status} />}
            >
              <div className="ds-detail-list">
                <div className="ds-detail-list-item">
                  <span>Phạm vi</span>
                  <strong>{selectedRequest.scope}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Nguồn</span>
                  <strong>{selectedRequest.source}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>IP gốc</span>
                  <strong>{selectedRequest.ipAddress}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Lần yêu cầu gần nhất</span>
                  <strong>
                    {selectedRequest.lastRequestedAt
                      ? formatDateTime(selectedRequest.lastRequestedAt)
                      : '-'}
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Lần thấy gần nhất</span>
                  <strong>{formatDateTime(selectedRequest.lastSeenAt)}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Hết hạn</span>
                  <strong>
                    {selectedRequest.expiresAt ? formatDateTime(selectedRequest.expiresAt) : '-'}
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Rủi ro</span>
                  <strong>{renderRiskChips(selectedRequest)}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>User agent</span>
                  <strong>{selectedRequest.lastUserAgent ?? '-'}</strong>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Footprint"
              title="Tài khoản liên quan"
              description="Chỉ giữ footprint ngắn để quyết định nhanh; lịch sử sâu không ở drawer này."
            >
              {renderLinkedUsers(selectedRequest)}
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Quyết định"
              title="Duyệt, từ chối hoặc thu hồi"
              description="Ghi lý do ngắn gọn để audit sau này đọc được quyết định."
            >
              <Input.TextArea
                rows={3}
                value={actionReason}
                placeholder="Lý do cho quyết định này"
                onChange={(event) => setActionReason(event.target.value)}
              />
              <div className="ds-settings-action-bar">
                <span className="ds-settings-action-copy">
                  Chỉ giữ thao tác quyết định trong drawer. Điều tra sâu nên đi qua audit hoặc page chuyên trách.
                </span>
                <Space wrap>
                  <Button
                    type="primary"
                    disabled={!isActionAvailable(selectedRequest.status, 'approve')}
                    loading={
                      actionMutation.isPending && actionMutation.variables?.action === 'approve'
                    }
                    onClick={() => actionMutation.mutate({ action: 'approve', id: selectedRequest.id })}
                  >
                    Duyệt
                  </Button>
                  <Button
                    danger
                    disabled={!isActionAvailable(selectedRequest.status, 'reject')}
                    loading={
                      actionMutation.isPending && actionMutation.variables?.action === 'reject'
                    }
                    onClick={() => actionMutation.mutate({ action: 'reject', id: selectedRequest.id })}
                  >
                    Từ chối
                  </Button>
                  <Button
                    danger
                    disabled={!isActionAvailable(selectedRequest.status, 'revoke')}
                    loading={
                      actionMutation.isPending && actionMutation.variables?.action === 'revoke'
                    }
                    onClick={() => actionMutation.mutate({ action: 'revoke', id: selectedRequest.id })}
                  >
                    Thu hồi
                  </Button>
                </Space>
              </div>
            </SurfaceCard>
          </div>
        )}
      </AppDrawer>
    </>
  );
};
