import { ReloadOutlined } from '@ant-design/icons';
import { Button, Input, Select, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import { AppTooltip } from '@/components/AppTooltip';
import { DataTableShell } from '@/components/DataTableShell';
import { DetailPanel } from '@/components/DetailPanel';
import { FilterBar } from '@/components/FilterBar';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/QueryStates';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { formatDateTime, formatRelativeTime } from '@/utils/date';

type LogLevel = 'info' | 'warning' | 'error' | 'success';

interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  host: string;
  summary: string;
  message: string;
  requestId: string;
  traceId: string;
  spanId: string;
  source: string;
  metadata: Record<string, unknown>;
}

const now = Date.now();

const LOG_ENTRIES: SystemLogEntry[] = [
  {
    id: 'log-1001',
    timestamp: new Date(now - 1000 * 60 * 3).toISOString(),
    level: 'error',
    service: 'chat-api',
    host: 'api-node-02',
    summary: 'Sender ACK exceeded threshold during persistence.',
    message:
      'Persistence completed after retry window. ACK p95 crossed threshold and queue drain was delayed by redis contention.',
    requestId: 'req_a1f92ce4',
    traceId: 'trace_7d31b182',
    spanId: 'span_209fa13d',
    source: 'runtime',
    metadata: {
      ackP95Ms: 1294,
      queue: 'message_sender',
      retryCount: 3,
      region: 'sgn-a',
    },
  },
  {
    id: 'log-1002',
    timestamp: new Date(now - 1000 * 60 * 11).toISOString(),
    level: 'warning',
    service: 'auth-service',
    host: 'auth-01',
    summary: 'Token validation latency trending up.',
    message:
      'Validation remained successful but the 95th percentile latency stayed above the warning baseline for 6 minutes.',
    requestId: 'req_91dc44bf',
    traceId: 'trace_11d03a77',
    spanId: 'span_33fa10ca',
    source: 'telemetry',
    metadata: {
      p95Ms: 462,
      baselineMs: 280,
      environment: 'production',
      region: 'sgn-a',
    },
  },
  {
    id: 'log-1003',
    timestamp: new Date(now - 1000 * 60 * 17).toISOString(),
    level: 'info',
    service: 'smtp-gateway',
    host: 'mailer-01',
    summary: 'SMTP draft activated successfully.',
    message:
      'Operator published the current SMTP draft and health checks completed without credential or transport errors.',
    requestId: 'req_238f8120',
    traceId: 'trace_f00297ce',
    spanId: 'span_c81992ef',
    source: 'admin_action',
    metadata: {
      actor: 'admin@hacom.vn',
      change: 'activate_smtp_draft',
      fromHost: 'smtp.old.local',
      toHost: 'smtp.prod.local',
    },
  },
  {
    id: 'log-1004',
    timestamp: new Date(now - 1000 * 60 * 26).toISOString(),
    level: 'error',
    service: 'conversation-worker',
    host: 'worker-03',
    summary: 'Moderation enrichment job failed for attachment payload.',
    message:
      'The worker skipped the attachment due to malformed metadata and moved the conversation into manual review.',
    requestId: 'req_140e1ab6',
    traceId: 'trace_1831d9bf',
    spanId: 'span_6d9cc0d8',
    source: 'background_job',
    metadata: {
      job: 'moderation_enrichment',
      conversationId: 'c-1002',
      attachmentType: 'application/json',
      resolution: 'manual_review',
    },
  },
  {
    id: 'log-1005',
    timestamp: new Date(now - 1000 * 60 * 41).toISOString(),
    level: 'success',
    service: 'access-control',
    host: 'acl-01',
    summary: 'Pending IP request approved.',
    message:
      'Approval propagated to the access-control cache and the request entered the active allow-list without rollback.',
    requestId: 'req_d43ef800',
    traceId: 'trace_bb0f4d20',
    spanId: 'span_e85b9342',
    source: 'admin_action',
    metadata: {
      actor: 'security.ops@hacom.vn',
      requestId: 'acl-4892',
      policy: 'temporary_allow',
      expiresAt: new Date(now + 1000 * 60 * 60 * 6).toISOString(),
    },
  },
  {
    id: 'log-1006',
    timestamp: new Date(now - 1000 * 60 * 70).toISOString(),
    level: 'warning',
    service: 'redis',
    host: 'redis-primary',
    summary: 'Blocked clients above comfort baseline.',
    message:
      'Redis stayed available but blocked clients and write amplification moved beyond the established comfort range.',
    requestId: 'req_f0ce8aa1',
    traceId: 'trace_44f78301',
    spanId: 'span_71a0dbaf',
    source: 'telemetry',
    metadata: {
      blockedClients: 12,
      opsPerSecond: 5821,
      memoryUsedBytes: 235721728,
    },
  },
];

const LEVEL_OPTIONS = [
  { label: 'Mọi level', value: 'all' },
  { label: 'Error', value: 'error' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' },
  { label: 'Success', value: 'success' },
] as const;

const SERVICE_OPTIONS = [
  { label: 'Mọi service', value: 'all' },
  ...Array.from(new Set(LOG_ENTRIES.map((entry) => entry.service))).map((service) => ({
    label: service,
    value: service,
  })),
] as const;

const TIME_RANGE_OPTIONS = [
  { label: '15 phút', value: '15m' },
  { label: '1 giờ', value: '1h' },
  { label: '24 giờ', value: '24h' },
  { label: 'Tất cả', value: 'all' },
] as const;

const resolveRangeCutoff = (value: string) => {
  if (value === '15m') return now - 1000 * 60 * 15;
  if (value === '1h') return now - 1000 * 60 * 60;
  if (value === '24h') return now - 1000 * 60 * 60 * 24;
  return null;
};

export const SystemLogsPage = () => {
  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState<'all' | LogLevel>('all');
  const [service, setService] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'15m' | '1h' | '24h' | 'all'>('1h');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const cutoff = resolveRangeCutoff(timeRange);

    return LOG_ENTRIES.filter((entry) => {
      const entryTimestamp = new Date(entry.timestamp).getTime();

      if (cutoff !== null && entryTimestamp < cutoff) {
        return false;
      }

      if (level !== 'all' && entry.level !== level) {
        return false;
      }

      if (service !== 'all' && entry.service !== service) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return `${entry.service} ${entry.summary} ${entry.message} ${entry.requestId} ${entry.traceId}`
        .toLowerCase()
        .includes(normalizedKeyword);
    }).sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }, [keyword, level, service, timeRange]);

  const selectedLog = selectedLogId
    ? filteredLogs.find((entry) => entry.id === selectedLogId) ??
      LOG_ENTRIES.find((entry) => entry.id === selectedLogId) ??
      null
    : null;

  const activeFilterCount = [keyword.trim(), level !== 'all' ? level : null, service !== 'all' ? service : null]
    .filter(Boolean)
    .length;

  const columns = useMemo<ColumnsType<SystemLogEntry>>(
    () => [
      {
        title: 'Thời gian',
        dataIndex: 'timestamp',
        width: 168,
        render: (value: string) => (
          <AppTooltip title={formatDateTime(value)}>
            <span>{formatRelativeTime(value)}</span>
          </AppTooltip>
        ),
      },
      {
        title: 'Level',
        dataIndex: 'level',
        width: 120,
        render: (value: LogLevel) => <StatusBadge status={value} />,
      },
      {
        title: 'Service',
        dataIndex: 'service',
        width: 160,
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
      },
      {
        title: 'Message',
        key: 'message',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.summary}</strong>
            <span>{record.message}</span>
          </div>
        ),
      },
      {
        title: 'Host',
        dataIndex: 'host',
        width: 140,
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

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
    message.success('Đã copy giá trị tham chiếu.');
  };

  return (
    <PageShell
      eyebrow="Vận hành"
      title="System logs"
      description="Bề mặt log runtime ưu tiên scan nhanh theo level, service và correlation; metadata sâu chỉ mở ở inspector."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            Làm mới bộ lọc
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
                  value={keyword}
                  placeholder="Tìm message, request ID, trace ID"
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--sm">
                <Select value={level} options={LEVEL_OPTIONS as unknown as { label: string; value: string }[]} onChange={(value) => setLevel(value as 'all' | LogLevel)} />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--md">
                <Select value={service} options={SERVICE_OPTIONS as unknown as { label: string; value: string }[]} onChange={setService} />
              </div>
              <div className="ds-toolbar-field ds-toolbar-field--sm">
                <Select
                  value={timeRange}
                  options={TIME_RANGE_OPTIONS as unknown as { label: string; value: string }[]}
                  onChange={(value) => setTimeRange(value as '15m' | '1h' | '24h' | 'all')}
                />
              </div>
              <div className="ds-toolbar-field ds-toolbar-actions">
                <Button onClick={handleReset}>Đặt lại</Button>
              </div>
            </div>
            <div className="ds-filter-toolbar-meta">
              <span>{filteredLogs.length} bản ghi</span>
              <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc` : 'Không có bộ lọc'}</span>
              <span>Inspector dùng cho trace, request ID và payload chi tiết</span>
            </div>
          </FilterBar>

          <DataTableShell
            title="Runtime events"
            meta="Danh sách chính chỉ giữ level, service, message và host để operator đọc nhanh trong cùng một surface."
          >
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              dataSource={filteredLogs}
              emptyNode={<EmptyState description="Không có log nào khớp với bộ lọc hiện tại." />}
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
          title={selectedLog ? `${selectedLog.service} · ${selectedLog.level}` : 'Log detail'}
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
                    <p>{selectedLog.host}</p>
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
                    <dt>Service</dt>
                    <dd>{selectedLog.service}</dd>
                  </div>
                  <div>
                    <dt>Nguồn</dt>
                    <dd>{selectedLog.source}</dd>
                  </div>
                  <div>
                    <dt>Host</dt>
                    <dd>{selectedLog.host}</dd>
                  </div>
                </dl>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Correlation</h3>
                <div className="ds-ops-inline-list">
                  <Button size="small" onClick={() => void copyValue(selectedLog.requestId)}>
                    Request ID
                  </Button>
                  <Button size="small" onClick={() => void copyValue(selectedLog.traceId)}>
                    Trace ID
                  </Button>
                  <Button size="small" onClick={() => void copyValue(selectedLog.spanId)}>
                    Span ID
                  </Button>
                </div>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Request ID</dt>
                    <dd>{selectedLog.requestId}</dd>
                  </div>
                  <div>
                    <dt>Trace ID</dt>
                    <dd>{selectedLog.traceId}</dd>
                  </div>
                  <div>
                    <dt>Span ID</dt>
                    <dd>{selectedLog.spanId}</dd>
                  </div>
                </dl>
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
                  <pre>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                </div>
              </section>
            </div>
          ) : (
            <EmptyState description="Chọn một bản ghi để xem correlation và payload." />
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
