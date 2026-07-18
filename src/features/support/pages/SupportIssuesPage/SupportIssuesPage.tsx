import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Select, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import { supportClient } from '@/api/clients/supportClient/supportClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type {
  SupportIssuePriority,
  SupportIssueQuery,
  SupportIssueStatus,
  SupportIssueSummary,
} from '@/api/types/support/support';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel/DetailPanel';
import { FilterBar } from '@/components/FilterBar/FilterBar';
import { MetaCell } from '@/components/MetaCell/MetaCell';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { DataTable } from '@/components/ui/DataTable/DataTable';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { formatDateTime } from '@/utils/date/date';
import {
  PRIORITY_META,
  PRIORITY_OPTIONS,
  STATUS_META,
  STATUS_OPTIONS,
  formatBytes,
} from '@/features/support/supportPresentation';
import './SupportIssuesPage.css';

const PAGE_HEADER = {
  eyebrow: 'Hỗ trợ',
  title: 'Báo cáo sự cố',
  description: 'Ticket do người dùng gửi từ ứng dụng. Xem chi tiết, tệp đính kèm và cập nhật trạng thái xử lý.',
};

export const SupportIssuesPage = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<SupportIssueQuery>({ page: 1, limit: 20 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.supportIssues(filters),
    queryFn: () => supportClient.list(filters),
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery({
    queryKey: selectedId ? queryKeys.supportIssueDetail(selectedId) : queryKeys.supportIssueDetailRoot,
    queryFn: () => supportClient.detail(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: SupportIssueStatus; resolutionNote?: string | null }) =>
      supportClient.updateStatus(input.id, {
        status: input.status,
        resolutionNote: input.resolutionNote ?? null,
      }),
    onSuccess: (updated) => {
      message.success(`Đã cập nhật trạng thái ${updated.ticketCode}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.supportIssuesRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.supportIssueDetail(updated.id) });
    },
    onError: () => {
      message.error('Không cập nhật được trạng thái. Vui lòng thử lại.');
    },
  });

  const columns = useMemo<ColumnsType<SupportIssueSummary>>(
    () => [
      {
        title: 'Mã',
        dataIndex: 'ticketCode',
        width: 140,
        render: (value: string) => <MetaCell primary={value} />,
      },
      {
        title: 'Tiêu đề',
        dataIndex: 'title',
        ellipsis: true,
        render: (value: string, record) => (
          <MetaCell
            primary={value}
            secondary={record.attachmentCount > 0 ? `${record.attachmentCount} tệp đính kèm` : undefined}
          />
        ),
      },
      {
        title: 'Người báo',
        key: 'reporter',
        width: 200,
        render: (_, record) => (
          <MetaCell
            primary={record.reporter.displayName ?? record.reporter.username ?? 'Không rõ'}
            secondary={record.reporter.username ?? undefined}
          />
        ),
      },
      {
        title: 'Ưu tiên',
        dataIndex: 'priority',
        width: 110,
        render: (value: SupportIssuePriority) => (
          <Tag color={PRIORITY_META[value].color}>{PRIORITY_META[value].label}</Tag>
        ),
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        width: 130,
        render: (value: SupportIssueStatus) => (
          <Tag color={STATUS_META[value].color}>{STATUS_META[value].label}</Tag>
        ),
      },
      {
        title: 'Gửi lúc',
        dataIndex: 'createdAt',
        width: 170,
        render: (value: string) => <DateTimeCell value={value} />,
      },
    ],
    [],
  );

  if (listQuery.isPending && !listQuery.data) {
    return (
      <PageShell {...PAGE_HEADER}>
        <QueryStateView kind="loading" title="Đang tải danh sách báo cáo..." />
      </PageShell>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <PageShell {...PAGE_HEADER}>
        <QueryStateView
          kind="error"
          description="Không thể tải danh sách báo cáo sự cố."
          onRetry={() => void listQuery.refetch()}
        />
      </PageShell>
    );
  }

  const data = listQuery.data;
  const detail = detailQuery.data;

  return (
    <PageShell
      {...PAGE_HEADER}
      headerExtra={
        <Button
          icon={<AppIcon name="refresh" size={16} aria-hidden />}
          loading={listQuery.isFetching}
          onClick={() => void listQuery.refetch()}
        >
          Làm mới
        </Button>
      }
    >
      <div className="ds-page-with-detail">
        <div className="ds-page-main-stack">
          <FilterBar>
            <Form layout="inline" className="ds-toolbar-form">
              <Form.Item className="ds-toolbar-field ds-toolbar-field--sm">
                <Select
                  allowClear
                  placeholder="Trạng thái"
                  options={STATUS_OPTIONS}
                  value={filters.status}
                  onChange={(status?: SupportIssueStatus) =>
                    setFilters((prev) => ({ ...prev, page: 1, status }))
                  }
                  style={{ minWidth: 150 }}
                />
              </Form.Item>
              <Form.Item className="ds-toolbar-field ds-toolbar-field--sm">
                <Select
                  allowClear
                  placeholder="Ưu tiên"
                  options={PRIORITY_OPTIONS}
                  value={filters.priority}
                  onChange={(priority?: SupportIssuePriority) =>
                    setFilters((prev) => ({ ...prev, page: 1, priority }))
                  }
                  style={{ minWidth: 130 }}
                />
              </Form.Item>
            </Form>
            <div className="ds-filter-toolbar-meta">
              <span>{data?.pagination.total ?? 0} báo cáo</span>
            </div>
          </FilterBar>

          <DataTableShell title="Ticket sự cố" meta="Bấm một dòng để xem chi tiết và cập nhật trạng thái.">
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={listQuery.isFetching && !listQuery.isPending}
              dataSource={data?.items ?? []}
              emptyNode={<EmptyState description="Chưa có báo cáo sự cố nào khớp bộ lọc." />}
              onRow={(record) => ({
                onClick: () => setSelectedId(record.id),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: data?.pagination.page,
                pageSize: data?.pagination.limit,
                total: data?.pagination.total,
                showSizeChanger: true,
                onChange: (page, pageSize) =>
                  setFilters((prev) => ({ ...prev, page, limit: pageSize })),
              }}
            />
          </DataTableShell>
        </div>

        <DetailPanel
          open={Boolean(selectedId)}
          title={detail?.ticketCode ?? 'Chi tiết báo cáo'}
          onClose={() => setSelectedId(null)}
          width={720}
          className="ds-ops-detail-panel"
        >
          {detailQuery.isPending && selectedId ? (
            <QueryStateView kind="loading" title="Đang tải chi tiết..." />
          ) : detail ? (
            <div className="ds-ops-detail-stack">
              <section className="ds-ops-detail-section">
                <div className="ds-ops-detail-header">
                  <div>
                    <strong>{detail.title}</strong>
                    <p>
                      {detail.reporter.displayName ?? detail.reporter.username ?? 'Không rõ người báo'}
                    </p>
                  </div>
                  <Space>
                    <Tag color={PRIORITY_META[detail.priority].color}>
                      {PRIORITY_META[detail.priority].label}
                    </Tag>
                    <Tag color={STATUS_META[detail.status].color}>
                      {STATUS_META[detail.status].label}
                    </Tag>
                  </Space>
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Cập nhật trạng thái</h3>
                <Space>
                  <Select
                    value={detail.status}
                    options={STATUS_OPTIONS}
                    style={{ minWidth: 180 }}
                    loading={statusMutation.isPending}
                    onChange={(status: SupportIssueStatus) =>
                      statusMutation.mutate({ id: detail.id, status })
                    }
                  />
                </Space>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Các bước tái hiện</h3>
                <div className="ds-ops-code-block">
                  <pre>{detail.stepsToReproduce}</pre>
                </div>
              </section>

              {(detail.expectedResult || detail.actualResult) && (
                <section className="ds-ops-detail-section">
                  <h3>Mong đợi vs thực tế</h3>
                  <dl className="ds-ops-fact-list">
                    <div>
                      <dt>Mong đợi</dt>
                      <dd>{detail.expectedResult ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Thực tế</dt>
                      <dd>{detail.actualResult ?? '-'}</dd>
                    </div>
                  </dl>
                </section>
              )}

              {detail.attachments.length > 0 && (
                <section className="ds-ops-detail-section">
                  <h3>Tệp đính kèm ({detail.attachments.length})</h3>
                  <ul className="ds-ops-attachment-list">
                    {detail.attachments.map((file) => (
                      <li key={file.fileId}>
                        {file.downloadUrl ? (
                          <a href={file.downloadUrl} target="_blank" rel="noreferrer">
                            {file.filename}
                          </a>
                        ) : (
                          <span>{file.filename}</span>
                        )}
                        <span className="ds-ops-attachment-size">{formatBytes(file.sizeBytes)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="ds-ops-detail-section">
                <h3>Môi trường</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Trang lỗi</dt>
                    <dd>{detail.environment.url ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Trình duyệt</dt>
                    <dd>{detail.environment.userAgent ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Kích thước</dt>
                    <dd>{detail.environment.viewport ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Ngôn ngữ</dt>
                    <dd>{detail.environment.locale ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Gửi lúc</dt>
                    <dd>{formatDateTime(detail.createdAt)}</dd>
                  </div>
                </dl>
              </section>

              {detail.resolutionNote && (
                <section className="ds-ops-detail-section">
                  <h3>Ghi chú xử lý</h3>
                  <p>{detail.resolutionNote}</p>
                </section>
              )}
            </div>
          ) : (
            <EmptyState description="Không tải được chi tiết báo cáo." />
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
