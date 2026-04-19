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
        title: 'Yêu cầu',
        key: 'request',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.normalizedIp}</strong>
            <span>
              Phạm vi: {record.scope} / Nguồn: {record.source}
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
        width: 120,
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
                label: 'Mở chi tiết',
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
        title: 'Thời gian',
        dataIndex: 'createdAt',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Hành động',
        dataIndex: 'action',
        width: 140,
      },
      {
        title: 'Đổi trạng thái',
        key: 'statusChange',
        width: 220,
        render: (_, record) => (
          <span>
            {record.previousStatus ?? '-'}
            {' -> '}
            {record.newStatus ?? '-'}
          </span>
        ),
      },
      {
        title: 'Người thao tác',
        dataIndex: 'actorUserId',
        render: (value: string | null) => value ?? 'Hệ thống',
      },
      {
        title: 'Lý do',
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
        title="Yêu cầu truy cập IP"
        description="Duyệt yêu cầu IP đang chờ, rủi ro địa chỉ dùng chung và lịch sử phê duyệt."
      >
        <QueryStateView kind="loading" title="Đang tải yêu cầu truy cập IP..." />
      </PageShell>
    );
  }

  if (listQuery.isError) {
    return (
      <PageShell
        title="Yêu cầu truy cập IP"
        description="Duyệt yêu cầu IP đang chờ, rủi ro địa chỉ dùng chung và lịch sử phê duyệt."
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
        description="Dùng hàng đợi này để duyệt, từ chối hoặc thu hồi truy cập theo IP mà không mất ngữ cảnh người dùng và audit."
        headerExtra={
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<ReloadOutlined />}
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
            <span>
              {listQuery.data?.pagination.total ?? 0} yêu cầu phù hợp
            </span>
            <span>
              {activeFilterCount > 0
                ? `${activeFilterCount} bộ lọc đang hoạt động`
                : 'Không có bộ lọc đang hoạt động'}
            </span>
            <span>
              Đồng bộ gần nhất:{' '}
              {listQuery.dataUpdatedAt
                ? formatDateTime(new Date(listQuery.dataUpdatedAt).toISOString())
                : '-'}
            </span>
          </div>
        </FilterBar>

        <DataTableShell
          title="Hàng đợi phê duyệt"
          meta="Giữ các yêu cầu rủi ro luôn hiển thị, rồi chỉ mở chi tiết khi cần ngữ cảnh người dùng liên quan và lịch sử."
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
        width={840}
      >
        {!selectedId ? (
          <EmptyState description="Chọn một yêu cầu để xem ngữ cảnh phê duyệt." />
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
            <div className="ds-detail-overview-grid">
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Trạng thái yêu cầu</span>
                <div className="ds-summary-tile-value">
                  <StatusBadge status={selectedRequest.status} />
                </div>
                <span className="ds-summary-tile-meta">Trạng thái quyết định duyệt truy cập hiện tại.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Người dùng liên quan</span>
                <strong className="ds-summary-tile-value">
                  {selectedRequest.linkedUsers.length}
                </strong>
                <span className="ds-summary-tile-meta">Các tài khoản được ghi nhận từ IP này.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Nguồn</span>
                <strong className="ds-summary-tile-value">{selectedRequest.source}</strong>
                <span className="ds-summary-tile-meta">Cách yêu cầu này đi vào hệ thống.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Hết hạn</span>
                <strong className="ds-summary-tile-value">
                  {selectedRequest.expiresAt ? formatDateTime(selectedRequest.expiresAt) : '-'}
                </strong>
                <span className="ds-summary-tile-meta">Để trống nghĩa là hiện chưa đặt thời hạn hết hạn.</span>
              </div>
            </div>

            <SurfaceCard
              eyebrow="Ngữ cảnh yêu cầu"
              title={selectedRequest.normalizedIp}
              description="Giữ phạm vi, lý do và metadata mạng luôn hiển thị trước khi duyệt hoặc thu hồi truy cập."
              status={<StatusBadge status={selectedRequest.status} />}
            >
              <div className="ds-detail-list">
                <div className="ds-detail-list-item">
                  <span>Phạm vi</span>
                  <strong>{selectedRequest.scope}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>IP gốc</span>
                  <strong>{selectedRequest.ipAddress}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Lần thấy đầu tiên</span>
                  <strong>{formatDateTime(selectedRequest.firstSeenAt)}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Lần thấy gần nhất</span>
                  <strong>{formatDateTime(selectedRequest.lastSeenAt)}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Duyệt bởi</span>
                  <strong>{selectedRequest.approvedBy ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Từ chối bởi</span>
                  <strong>{selectedRequest.rejectedBy ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Lý do</span>
                  <strong>{selectedRequest.reason ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Ghi chú</span>
                  <strong>{selectedRequest.note ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Chuỗi forwarded</span>
                  <strong>
                    {selectedRequest.lastForwardedChain.length > 0
                      ? selectedRequest.lastForwardedChain.join(', ')
                      : '-'}
                  </strong>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Rà soát rủi ro"
              title="Tín hiệu địa chỉ dùng chung và hết hạn"
              description="Các cờ này giúp tránh duyệt IP tạm thời hoặc dùng cho nhiều người khi chưa đủ ngữ cảnh."
            >
              {renderRiskChips(selectedRequest)}
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Người dùng liên quan"
              title="Các tài khoản quan sát được trên IP này"
              description="Rà soát footprint người dùng trước khi duyệt địa chỉ dùng chung hoặc bất thường."
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
                <EmptyState description="Không có người dùng liên quan nào được trả về cho yêu cầu này." />
              )}
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Thao tác duyệt"
              title="Áp dụng quyết định với ý định rõ ràng của operator"
              description="Duyệt và thu hồi sẽ tác động ngay tới enforcement truy cập. Hãy ghi lý do trước khi tiếp tục."
            >
              <div className="ds-settings-action-copy">
                Ghi chú dưới đây sẽ được ghi vào payload thao tác để người rà soát sau hiểu vì sao IP này được duyệt, từ chối hoặc thu hồi.
              </div>
              <Input.TextArea
                rows={3}
                value={actionReason}
                placeholder="Lý do cho quyết định này"
                onChange={(event) => setActionReason(event.target.value)}
              />
              <div className="ds-settings-action-bar">
                <div className="ds-settings-action-copy">
                  Tác vụ an toàn giữ mức thứ cấp. Tác vụ phá hủy luôn được tách thị giác rõ ràng.
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
                    Duyệt
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
                    Từ chối
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
                    Thu hồi
                  </Button>
                </Space>
              </div>
            </SurfaceCard>

            <DataTableShell
              title="Lịch sử quyết định"
              meta="Dùng audit trail để hiểu yêu cầu này đã thay đổi theo thời gian như thế nào."
            >
              {historyQuery.isError ? (
                <QueryStateView kind="error" compact description="Không thể tải lịch sử yêu cầu." />
              ) : (
                <DataTable
                  rowKey="id"
                  columns={historyColumns}
                  minHeight={220}
                  loading={historyQuery.isLoading}
                  dataSource={historyQuery.data?.items ?? []}
                  pagination={false}
                  emptyNode={<EmptyState description="Không có bản ghi lịch sử nào được trả về." />}
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
