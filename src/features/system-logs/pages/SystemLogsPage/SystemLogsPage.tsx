import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Switch, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { systemLogsClient } from '@/api/clients/systemLogsClient/systemLogsClient';
import { getErrorMessage } from '@/api/error/error';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { SystemLogItem, SystemLogLevel, SystemLogQuery, SystemLogRange } from '@/api/types/system-logs/system-logs';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { AppTooltip } from '@/components/AppTooltip/AppTooltip';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel/DetailPanel';
import { FilterBar } from '@/components/FilterBar/FilterBar';
import { MetaCell } from '@/components/MetaCell/MetaCell';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { DataTable } from '@/components/ui/DataTable/DataTable';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { formatDateTime } from '@/utils/date/date';
import './SystemLogsPage.css';

const LOG_FETCH_LIMIT = 200;
const KEYWORD_DEBOUNCE_MS = 250;
const AUTO_REFRESH_INTERVAL_MS = 30000; // 30 seconds

const LEVEL_OPTIONS = [
  { label: 'Tất cả cấp độ', value: 'all' },
  { label: 'Lỗi', value: 'error' },
  { label: 'Cảnh báo', value: 'warning' },
  { label: 'Info', value: 'info' },
  { label: 'Thành công', value: 'success' },
] as const;

const TIME_RANGE_OPTIONS = [
  { label: '15 phút', value: '15m' },
  { label: '1 giờ', value: '1h' },
  { label: '24 giờ', value: '24h' },
  { label: 'Tất cả', value: 'all' },
] as const;

const renderOptionalValue = (value: string | null) => value ?? '-';

export const SystemLogsPage = () => {
  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState<'all' | SystemLogLevel>('all');
  const [service, setService] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<SystemLogRange>('1h');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isAtLatest, setIsAtLatest] = useState(true);
  const deferredKeyword = useDeferredValue(keyword.trim());
  const [debouncedKeyword, setDebouncedKeyword] = useState(deferredKeyword);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedKeyword(deferredKeyword);
    }, KEYWORD_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deferredKeyword]);

  const queryParams = useMemo<SystemLogQuery>(
    () => ({
      keyword: debouncedKeyword || undefined,
      level: level === 'all' ? undefined : level,
      service: service === 'all' ? undefined : service,
      range: timeRange,
      limit: LOG_FETCH_LIMIT,
    }),
    [debouncedKeyword, level, service, timeRange],
  );

  const query = useQuery({
    queryKey: queryKeys.systemLogs(queryParams),
    queryFn: () => systemLogsClient.list(queryParams),
    placeholderData: keepPreviousData,
    refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });

  const logs = useMemo(() => query.data?.items ?? [], [query.data?.items]);

  // Track if we're at the latest log based on auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      setIsAtLatest(true);
    }
  }, [autoRefresh, query.dataUpdatedAt]);

  const jumpToLatest = () => {
    setIsAtLatest(true);
    setSelectedLogId(null);
  };

  const selectedLog = selectedLogId ? logs.find((entry) => entry.id === selectedLogId) ?? null : null;

  const serviceOptions = useMemo(
    () => [
      { label: 'Tất cả dịch vụ', value: 'all' },
      ...Array.from(
        new Set(
          logs
            .map((entry) => entry.service)
            .filter(Boolean)
            .concat(service !== 'all' ? [service] : []),
        ),
      ).map((value) => ({ label: value, value })),
    ],
    [logs, service],
  );

  const activeFilterCount = [
    debouncedKeyword,
    level !== 'all' ? level : null,
    service !== 'all' ? service : null,
    timeRange !== '1h' ? timeRange : null,
  ].filter(Boolean).length;

  // Count errors in current logs
  const errorCount = useMemo(
    () => logs.filter((log) => log.level === 'error').length,
    [logs],
  );

  const copyValue = async (value: string | null) => {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    message.success('Đã sao chép giá trị tham chiếu.');
  };

  const columns = useMemo<ColumnsType<SystemLogItem>>(
    () => [
      {
        title: 'Thời gian',
        dataIndex: 'timestamp',
        width: 160,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Cấp độ',
        dataIndex: 'level',
        width: 120,
        render: (value: SystemLogLevel) => <StatusBadge status={value} />,
      },
      {
        title: 'Dịch vụ',
        dataIndex: 'service',
        width: 180,
        ellipsis: true,
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
      },
      {
        title: 'Thông điệp',
        key: 'message',
        width: 420,
        ellipsis: true,
        render: (_, record) => <MetaCell primary={record.summary} secondary={record.message} />,
      },
      {
        title: 'Request ID',
        dataIndex: 'requestId',
        width: 180,
        ellipsis: true,
        render: (value: string | null) =>
          value ? (
            <AppTooltip title="Bấm để sao chép request ID">
              <button type="button" className="ds-inline-copy" onClick={() => void copyValue(value)}>
                {value}
              </button>
            </AppTooltip>
          ) : (
            '-'
          ),
      },
      {
        title: 'Người dùng/IP',
        dataIndex: 'host',
        width: 160,
        render: (value: string | null) => renderOptionalValue(value),
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
                onClick: () => setSelectedLogId(record.id),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  const handleReset = () => {
    setKeyword('');
    setLevel('all');
    setService('all');
    setTimeRange('1h');
    setSelectedLogId(null);
  };

  const pageHeader = {
    eyebrow: 'Vận hành',
    title: 'Nhật ký hệ thống',
    description: 'Theo dõi log runtime theo dịch vụ, cấp độ và mã đối chiếu.',
  };

  if (query.isPending && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Đang tải nhật ký hệ thống..." />
      </PageShell>
    );
  }

  if (query.isError && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description={getErrorMessage(query.error, 'Không thể tải nhật ký hệ thống.')}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      {...pageHeader}
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          {/* Jump to Latest button - shown when not at latest */}
          {!isAtLatest && autoRefresh && (
            <Button
              type="primary"
              icon={<AppIcon name="arrowDown" size={14} />}
              onClick={jumpToLatest}
              size="small"
            >
              Mới nhất
            </Button>
          )}

          {/* Auto-refresh toggle */}
          <div className="system-logs-auto-refresh">
            <AppTooltip title="Tự động làm mới mỗi 30 giây">
              <Switch
                checked={autoRefresh}
                onChange={setAutoRefresh}
                size="small"
              />
            </AppTooltip>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Auto refresh
            </Typography.Text>
            {autoRefresh && query.isFetching && (
              <AppIcon name="refresh" size={14} className="system-logs-refreshing" aria-hidden />
            )}
          </div>

          <Button
            icon={<AppIcon name="refresh" size={14} />}
            loading={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      <div className="ds-page-with-detail">
        <div className="ds-page-main-stack">
          <FilterBar className="system-logs-page-filter">
            <div className="ds-toolbar-form">
              <div className="ds-toolbar-field ds-toolbar-field--lg">
                <Input
                  allowClear
                  aria-label="Lọc từ khóa nhật ký hệ thống"
                  value={keyword}
                  placeholder="Tìm thông điệp, request ID, trace ID"
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--sm">
                <Select
                  aria-label="Lọc cấp độ nhật ký hệ thống"
                  value={level}
                  options={LEVEL_OPTIONS as unknown as { label: string; value: string }[]}
                  onChange={(value) => setLevel(value as 'all' | SystemLogLevel)}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--md">
                <Select
                  aria-label="Lọc dịch vụ nhật ký hệ thống"
                  value={service}
                  options={serviceOptions}
                  onChange={setService}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--sm">
                <Select
                  aria-label="Lọc khoảng thời gian nhật ký hệ thống"
                  value={timeRange}
                  options={TIME_RANGE_OPTIONS as unknown as { label: string; value: string }[]}
                  onChange={(value) => setTimeRange(value as SystemLogRange)}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-actions">
                <Button onClick={handleReset}>Đặt lại</Button>
              </div>
            </div>
            <div className="ds-filter-toolbar-meta">
              <span>
                {logs.length} bản ghi
                {errorCount > 0 && (
                  <Typography.Text type="danger" style={{ marginLeft: 8 }}>
                    ({errorCount} lỗi)
                  </Typography.Text>
                )}
              </span>
              <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang bật` : 'Chưa lọc'}</span>
              <span>
                Đồng bộ:{' '}
                {query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString()) : '-'}
              </span>
            </div>
          </FilterBar>

          <DataTableShell
            title="Sự kiện runtime"
            meta="Thông điệp dài và JSON payload nằm trong panel chi tiết, không nằm trong dòng bảng."
          >
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={query.isFetching && !query.isPending}
              dataSource={logs}
              emptyNode={<EmptyState title="Chưa có bản ghi" description="Không có log khớp bộ lọc hiện tại." compact />}
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
              onRow={(record) => ({
                onClick: () => setSelectedLogId(record.id),
                style: { cursor: 'pointer' },
                className: record.level === 'error' ? 'system-logs-row-error' : '',
              })}
            />
          </DataTableShell>
        </div>

        <DetailPanel
          open={Boolean(selectedLog)}
          title={selectedLog ? `${selectedLog.service} / ${selectedLog.level}` : 'Chi tiết log'}
          onClose={() => setSelectedLogId(null)}
          width={760}
          className="ds-ops-detail-panel"
        >
          {selectedLog ? (
            <div className="ds-ops-detail-stack">
              <section className="ds-ops-detail-section">
                <div className="ds-ops-detail-header">
                  <div>
                    <strong>{selectedLog.summary}</strong>
                    <p>{renderOptionalValue(selectedLog.host)}</p>
                  </div>
                  <StatusBadge status={selectedLog.level} />
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Ngữ cảnh</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Thời gian</dt>
                    <dd>{formatDateTime(selectedLog.timestamp)}</dd>
                  </div>
                  <div>
                    <dt>Dịch vụ</dt>
                    <dd>{selectedLog.service}</dd>
                  </div>
                  <div>
                    <dt>Nguồn</dt>
                    <dd>{renderOptionalValue(selectedLog.source)}</dd>
                  </div>
                  <div>
                    <dt>Host</dt>
                    <dd>{renderOptionalValue(selectedLog.host)}</dd>
                  </div>
                </dl>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Đối chiếu</h3>
                <div className="ds-ops-inline-list">
                  <Button size="small" disabled={!selectedLog.requestId} onClick={() => void copyValue(selectedLog.requestId)}>
                    <AppIcon name="copy" size={12} />
                    Request ID
                  </Button>
                  <Button size="small" disabled={!selectedLog.traceId} onClick={() => void copyValue(selectedLog.traceId)}>
                    <AppIcon name="copy" size={12} />
                    Trace ID
                  </Button>
                  <Button size="small" disabled={!selectedLog.spanId} onClick={() => void copyValue(selectedLog.spanId)}>
                    <AppIcon name="copy" size={12} />
                    Span ID
                  </Button>
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Thông điệp</h3>
                <div className="ds-ops-code-block">
                  <pre>{selectedLog.message}</pre>
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Metadata</h3>
                <div className="ds-ops-code-block">
                  <pre>{JSON.stringify(selectedLog.metadata ?? {}, null, 2)}</pre>
                </div>
              </section>
            </div>
          ) : (
            <EmptyState title="Chưa chọn log" description="Chọn một bản ghi để xem mã đối chiếu và payload." compact />
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
