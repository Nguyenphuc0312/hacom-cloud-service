import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { systemLogsClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { SystemLogItem, SystemLogLevel, SystemLogQuery, SystemLogRange } from '@/api/types';
import { AppIcon } from '@/components/AppIcon';
import { AppTooltip } from '@/components/AppTooltip';
import { DataTableShell } from '@/components/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel';
import { FilterBar } from '@/components/FilterBar';
import { MetaCell } from '@/components/MetaCell';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/utils/date';

const LOG_FETCH_LIMIT = 200;
const KEYWORD_DEBOUNCE_MS = 250;

const LEVEL_OPTIONS = [
  { label: 'All levels', value: 'all' },
  { label: 'Error', value: 'error' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' },
  { label: 'Success', value: 'success' },
] as const;

const TIME_RANGE_OPTIONS = [
  { label: '15 minutes', value: '15m' },
  { label: '1 hour', value: '1h' },
  { label: '24 hours', value: '24h' },
  { label: 'All', value: 'all' },
] as const;

const renderOptionalValue = (value: string | null) => value ?? '-';

export const SystemLogsPage = () => {
  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState<'all' | SystemLogLevel>('all');
  const [service, setService] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<SystemLogRange>('1h');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
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
  });

  const logs = useMemo(() => query.data?.items ?? [], [query.data?.items]);

  useEffect(() => {
    if (selectedLogId && !logs.some((item) => item.id === selectedLogId)) {
      setSelectedLogId(null);
    }
  }, [logs, selectedLogId]);

  const selectedLog = selectedLogId ? logs.find((entry) => entry.id === selectedLogId) ?? null : null;

  const serviceOptions = useMemo(
    () => [
      { label: 'All services', value: 'all' },
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

  const copyValue = async (value: string | null) => {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    message.success('Copied reference value.');
  };

  const columns = useMemo<ColumnsType<SystemLogItem>>(
    () => [
      {
        title: 'Time',
        dataIndex: 'timestamp',
        width: 160,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Level',
        dataIndex: 'level',
        width: 120,
        render: (value: SystemLogLevel) => <StatusBadge status={value} />,
      },
      {
        title: 'Service',
        dataIndex: 'service',
        width: 180,
        ellipsis: true,
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
      },
      {
        title: 'Message',
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
            <AppTooltip title="Click to copy request ID">
              <button type="button" className="ds-inline-copy" onClick={() => void copyValue(value)}>
                {value}
              </button>
            </AppTooltip>
          ) : (
            '-'
          ),
      },
      {
        title: 'User/IP',
        dataIndex: 'host',
        width: 160,
        render: (value: string | null) => renderOptionalValue(value),
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
    eyebrow: 'Operations',
    title: 'System Logs',
    description: 'Track administrative actions, access decisions, and system events.',
  };

  if (query.isPending && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Loading system logs..." />
      </PageShell>
    );
  }

  if (query.isError && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description={getErrorMessage(query.error, 'Unable to load system logs.')}
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
          <Button
            icon={<AppIcon name="refresh" size={14} />}
            loading={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            Refresh
          </Button>
        </div>
      }
    >
      <div className="ds-page-with-detail">
        <div className="ds-page-main-stack">
          <FilterBar>
            <div className="ds-toolbar-form">
              <div className="ds-toolbar-field ds-toolbar-field--lg">
                <Input
                  allowClear
                  aria-label="System log keyword filter"
                  value={keyword}
                  placeholder="Search message, request ID, trace ID"
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--sm">
                <Select
                  aria-label="System log level filter"
                  value={level}
                  options={LEVEL_OPTIONS as unknown as { label: string; value: string }[]}
                  onChange={(value) => setLevel(value as 'all' | SystemLogLevel)}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--md">
                <Select
                  aria-label="System log service filter"
                  value={service}
                  options={serviceOptions}
                  onChange={setService}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--sm">
                <Select
                  aria-label="System log range filter"
                  value={timeRange}
                  options={TIME_RANGE_OPTIONS as unknown as { label: string; value: string }[]}
                  onChange={(value) => setTimeRange(value as SystemLogRange)}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-actions">
                <Button onClick={handleReset}>Reset</Button>
              </div>
            </div>
            <div className="ds-filter-toolbar-meta">
              <span>{logs.length} records</span>
              <span>{activeFilterCount > 0 ? `${activeFilterCount} active filters` : 'No filters'}</span>
              <span>
                Synced:{' '}
                {query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString()) : '-'}
              </span>
            </div>
          </FilterBar>

          <DataTableShell
            title="Runtime Events"
            meta="Long messages and JSON payloads are available in the detail panel, not in table rows."
          >
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={query.isFetching && !query.isPending}
              dataSource={logs}
              emptyNode={<EmptyState title="No records" description="No logs match the current filters." compact />}
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
              onRow={(record) => ({
                onClick: () => setSelectedLogId(record.id),
                style: { cursor: 'pointer' },
              })}
            />
          </DataTableShell>
        </div>

        <DetailPanel
          open={Boolean(selectedLog)}
          title={selectedLog ? `${selectedLog.service} / ${selectedLog.level}` : 'Log Detail'}
          onClose={() => setSelectedLogId(null)}
          width={420}
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
                <h3>Context</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Time</dt>
                    <dd>{formatDateTime(selectedLog.timestamp)}</dd>
                  </div>
                  <div>
                    <dt>Service</dt>
                    <dd>{selectedLog.service}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{renderOptionalValue(selectedLog.source)}</dd>
                  </div>
                  <div>
                    <dt>Host</dt>
                    <dd>{renderOptionalValue(selectedLog.host)}</dd>
                  </div>
                </dl>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Correlation</h3>
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
                <h3>Message</h3>
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
            <EmptyState title="No log selected" description="Select a record to inspect correlation and payload details." compact />
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
