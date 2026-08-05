import { Button, Drawer, Input, Segmented, Select } from 'antd';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiErrorStatus, getErrorMessage } from '@/api/error/error';
import type { TimeRange } from '@/api/types/metrics/metrics';
import type { MonitoringServiceItem } from '@/api/types/monitoring/monitoring';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker/TimeRangePicker';
import { MetricCard } from '@/components/ui/MetricCard/MetricCard';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import { formatDateTime } from '@/utils/date/date';
import './MonitoringOverviewPage.css';
import {
  formatMs,
  formatNumber,
  formatPercent,
  formatRate,
} from '@/utils/formatters/formatters';
import { MonitoringAvailabilityBanner } from '../../components/MonitoringAvailabilityBanner/MonitoringAvailabilityBanner';
import { useMonitoringOverview } from '../../hooks/useMonitoringOverview/useMonitoringOverview';

const MonitoringTrendChart = lazy(async () => {
  const module = await import('../../components/MonitoringTrendChart/MonitoringTrendChart');
  return { default: module.MonitoringTrendChart };
});

const formatOptional = (
  value: number | null | undefined,
  formatter: (input: number) => string,
  fallback = 'Chưa có dữ liệu',
) => (typeof value === 'number' ? formatter(value) : fallback);

export const MonitoringOverviewPage = () => {
  const [range, setRange] = useState<TimeRange>('1h');
  const [trendMetric, setTrendMetric] = useState<'connections' | 'latency' | 'reliability'>('connections');
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceStatus, setServiceStatus] = useState<'all' | MonitoringServiceItem['status']>('all');
  const [selectedService, setSelectedService] = useState<MonitoringServiceItem | null>(null);
  const navigate = useNavigate();
  const overviewQuery = useMonitoringOverview(range);

  // No data yet - show loading
  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <PageShell
        title="Giám sát vận hành"
        description="Console theo dõi runtime, phụ thuộc và các điểm cần xử lý ngay."
      >
        <QueryStateView kind="loading" title="Đang tải dữ liệu giám sát..." />
      </PageShell>
    );
  }

  // Data exists - render even if partial
  const overview = overviewQuery.data;

  if (overview) {
    const services = overview.systemOverview.services;
    const problematicServices = overview.dependencySnapshot.services.filter(
      (service) => service.status !== 'up',
    );
    const topSignals = [
      ...overview.warnings.map((warning) => ({
        key: warning.key,
        title: warning.message,
        meta: `${warning.source} · ${warning.code}`,
        level: warning.severity,
      })),
      ...overview.messageCorrectness.topFailureReasons
        .filter((reason) => typeof reason.ratePerMinute === 'number' && reason.ratePerMinute > 0)
        .map((reason) => ({
          key: reason.reason,
          title: reason.reason,
          meta: `${formatRate(reason.ratePerMinute ?? 0, '/min')} lỗi cần theo dõi`,
          level: 'warning' as const,
        })),
    ].slice(0, 6);

    const healthyServiceRate = services.total > 0 ? (services.healthy / services.total) * 100 : null;
    const overallStatus = services.down > 0 ? 'down' : services.degraded > 0 ? 'warning' : 'healthy';
    const selectedSeries = trendMetric === 'connections'
      ? overview.realtimeHealth.connectionsTrend
      : trendMetric === 'latency'
        ? overview.realtimeHealth.latencyTrend
        : overview.realtimeHealth.reliabilityTrend;
    const bottlenecks = [
      { label: 'API latency', value: overview.dependencySnapshot.api.latencyMs, format: formatMs, status: overview.dependencySnapshot.api.status },
      { label: 'Redis blocked clients', value: overview.dependencySnapshot.redis.blockedClients, format: formatNumber, status: overview.dependencySnapshot.redis.status },
      { label: 'WebSocket → API p95', value: overview.realtimeHealth.wsToApiP95Ms, format: formatMs, status: overview.realtimeHealth.wsToApiP95Ms === null ? 'unknown' : overview.realtimeHealth.wsToApiP95Ms > 900 ? 'down' : 'up' },
      { label: 'Projection missing', value: overview.messageCorrectness.projectionMissingCurrent, format: formatNumber, status: (overview.messageCorrectness.projectionMissingCurrent ?? 0) > 0 ? 'degraded' : 'up' },
      { label: 'Reconcile required', value: overview.messageCorrectness.reconcileRequiredCurrent, format: formatNumber, status: (overview.messageCorrectness.reconcileRequiredCurrent ?? 0) > 0 ? 'degraded' : 'up' },
    ];
    const visibleServices = overview.dependencySnapshot.services
      .filter((service) => serviceStatus === 'all' || service.status === serviceStatus)
      .filter((service) => service.name.toLocaleLowerCase().includes(serviceSearch.trim().toLocaleLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name));

    return (
      <PageShell
        title="Giám sát vận hành"
        description="Sức khỏe runtime, điểm nghẽn và tác động cần operator xử lý ngay."
        headerExtra={
          <div className="ds-page-toolbar-stack">
            <div className="ds-page-toolbar-group"><TimeRangePicker value={range} onChange={setRange} /></div>
            <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
              <Button
                onClick={() => {
                  void overviewQuery.refetch();
                }}
                loading={overviewQuery.isFetching}
                icon={<AppIcon name="refresh" size={14} />}
              >
                Làm mới
              </Button>
              <span className="ds-page-toolbar-meta">
                Cập nhật: {formatDateTime(overview.generatedAt)}
              </span>
            </div>
          </div>
        }
      >
        <div className="ds-operations-page-status">
          <StatusBadge status={overallStatus} />
          <span>{services.healthy} healthy · {services.degraded} degraded · {services.down} down</span>
          <span>Freshness: <StatusBadge status={overview.freshness} /></span>
        </div>
        <MonitoringAvailabilityBanner
          freshness={overview.freshness}
          warnings={overview.warnings}
          prometheusStatus={overview.sources.prometheus.status}
          lokiStatus={overview.sources.loki?.status}
        />
        <div className="ds-monitoring-stack">
          <div className="ds-monitoring-kpi-grid ds-monitoring-kpi-grid--compact">
            <MetricCard
              label="Overall health"
              value={`${services.healthy} healthy`}
              changeLabel={`${services.degraded} degraded · ${services.down} down`}
              trendCaption="service health"
              tone={services.down > 0 ? 'danger' : services.degraded > 0 ? 'warning' : 'success'}
              onClick={() => navigate('/services/health')}
              compact
            />
            <MetricCard
              label="Người dùng online"
              value={formatOptional(overview.systemOverview.onlineUsers, formatNumber)}
              changeLabel={formatOptional(overview.systemOverview.activeConnections, formatNumber)}
              trendCaption="kết nối đang mở"
              tone="default"
              compact
            />
            <MetricCard
              label="WebSocket connections"
              value={formatOptional(overview.systemOverview.activeConnections, formatNumber)}
              changeLabel={formatOptional(overview.realtimeHealth.resyncsPerMinute, (value) => formatRate(value, '/min'))}
              trendCaption="resync mỗi phút"
              tone={
                (overview.realtimeHealth.resyncsPerMinute ?? 0) > 0 ? 'warning' : 'success'
              }
              compact
            />
            <MetricCard
              label="Traffic chat"
              value={formatOptional(overview.systemOverview.messagesPerSecond, (value) => formatRate(value, '/s'))}
              changeLabel={formatOptional(overview.systemOverview.messagesPerSecond, (value) =>
                formatRate(value, '/s'),
              )}
              trendCaption="tin nhắn / giây"
              tone={
                (overview.systemOverview.senderAckP95Ms ?? 0) > 900
                  ? 'danger'
                  : (overview.systemOverview.senderAckP95Ms ?? 0) > 450
                    ? 'warning'
                    : 'success'
              }
              compact
            />
            <MetricCard
              label="Lỗi một phần"
              value={formatOptional(overview.systemOverview.partialFailuresPerMinute, (value) =>
                formatRate(value, '/min'),
              )}
              changeLabel={formatOptional(overview.realtimeHealth.resyncsPerMinute, (value) =>
                formatRate(value, '/min'),
              )}
              trendCaption="resync mỗi phút"
              tone={
                (overview.systemOverview.partialFailuresPerMinute ?? 0) > 0 ? 'danger' : 'success'
              }
              compact
            />
            <MetricCard
              label="P95 API latency"
              value={formatOptional(overview.dependencySnapshot.api.latencyMs, formatMs)}
              changeLabel={
                overview.dependencySnapshot.api.summary || 'Chưa có dữ liệu canonical'
              }
              trendCaption={healthyServiceRate === null ? 'service health chưa có dữ liệu' : `${formatPercent(healthyServiceRate, 0)} healthy`}
              tone={overview.dependencySnapshot.api.status === 'down' ? 'danger' : overview.dependencySnapshot.api.status === 'degraded' ? 'warning' : 'success'}
              compact
            />
            <MetricCard
              label="Queue / consumer lag"
              value="Chưa có dữ liệu"
              changeLabel="Backend chưa có contract lag canonical"
              trendCaption="không suy diễn từ metric khác"
              tone="default"
              compact
            />
            <MetricCard
              label="Incident đang mở"
              value={topSignals.length > 0 ? formatNumber(topSignals.length) : 'Không có'}
              changeLabel={topSignals.length > 0 ? 'Cần điều tra' : 'Không có cảnh báo mở'}
              trendCaption="signals từ nguồn canonical"
              tone={topSignals.some((signal) => signal.level === 'error') ? 'danger' : topSignals.length ? 'warning' : 'success'}
              onClick={() => navigate('/logs')}
              compact
            />
          </div>

          <div className="ds-ops-grid ds-ops-grid--two-column">
            <SurfaceCard
              eyebrow="Traffic và hiệu năng"
              title="Xu hướng runtime"
              description="Chuyển metric để so sánh trong cùng time window; dữ liệu không có không được suy diễn."
              status={<StatusBadge status={overview.freshness} />}
              className="ds-ops-panel"
            >
              <Segmented value={trendMetric} onChange={(value) => setTrendMetric(value as typeof trendMetric)} options={[{ label: 'Connections', value: 'connections' }, { label: 'Latency', value: 'latency' }, { label: 'Reliability', value: 'reliability' }]} />
              <Suspense fallback={<QueryStateView kind="loading" title="Đang tải biểu đồ xu hướng" />}>
                <MonitoringTrendChart series={selectedSeries} availability={overview.dataQuality.realtimeHealth.status} formatter={trendMetric === 'latency' ? (value) => formatMs(value ?? 0) : (value) => formatNumber(value ?? 0)} />
              </Suspense>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Sự cố cần xử lý"
              title="Incident và tín hiệu ưu tiên"
              description="System health và monitoring gap được hiển thị riêng; một datasource lỗi không đồng nghĩa system down."
              status={<StatusBadge status={overview.dependencySnapshot.redis.status} />}
              className="ds-ops-panel"
            >
              {topSignals.length > 0 ? <div className="ds-monitoring-signal-list">{topSignals.map((signal) => <button type="button" key={signal.key} className="ds-ops-list-row ds-ops-list-row--action" onClick={() => navigate('/logs')}><div><strong>{signal.title}</strong><p>{signal.meta}</p></div><StatusBadge status={signal.level} /></button>)}</div> : <QueryStateView kind="empty" description="Không có sự cố đang mở. Monitoring source có thể vẫn có gap riêng." />}
              <div className="ds-monitoring-inline-meta">
                <span className="ds-shell-chip ds-shell-chip--ghost">
                  {problematicServices.length > 0
                    ? `${problematicServices.length} dịch vụ cần chú ý`
                    : 'Không có dịch vụ suy giảm'}
                </span>
                <span className="ds-shell-chip ds-shell-chip--ghost">
                  Nguồn Prometheus: {overview.sources.prometheus.status}
                </span>
                <span className="ds-shell-chip ds-shell-chip--ghost">
                  Sức khỏe dịch vụ: {overview.sources.serviceHealth.status}
                </span>
              </div>
            </SurfaceCard>
          </div>

          <div className="ds-ops-grid ds-ops-grid--two-column">
            <SurfaceCard eyebrow="Điểm nghẽn" title="Top tín hiệu hiện tại" className="ds-ops-panel">
              <div className="ds-monitoring-signal-list">
                {bottlenecks.map((item) => (
                  <button type="button" key={item.label} className="ds-ops-list-row ds-ops-list-row--action" onClick={() => navigate('/monitoring')}>
                    <div><strong>{item.label}</strong><p>{formatOptional(item.value, item.format)}</p></div>
                    <StatusBadge status={item.status} />
                  </button>
                ))}
              </div>
            </SurfaceCard>
            <SurfaceCard eyebrow="Logs cần chú ý" title="Điều tra theo request context" className="ds-ops-panel">
              {topSignals.length > 0 ? <p>Các incident phía trên có thể mở Log Explorer đã filter theo service hoặc request context.</p> : <QueryStateView kind="empty" description="Chưa có signal canonical để tạo log preview trong range này." />}
              <Button type="link" onClick={() => navigate('/logs')}>Mở Log Explorer</Button>
            </SurfaceCard>
          </div>

          <SurfaceCard eyebrow="Service health" title="Dịch vụ và readiness" className="ds-ops-panel">
            <div className="ds-monitoring-service-tools">
              <Input value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Tìm service" aria-label="Tìm service" />
              <Select value={serviceStatus} onChange={(value) => setServiceStatus(value)} aria-label="Lọc trạng thái service" options={[{ value: 'all', label: 'Tất cả trạng thái' }, { value: 'up', label: 'Healthy' }, { value: 'degraded', label: 'Degraded' }, { value: 'down', label: 'Unavailable' }, { value: 'unknown', label: 'Unknown' }]} />
            </div>
            <div className="ds-monitoring-service-table" role="table" aria-label="Service health overview">
              <div className="ds-monitoring-service-row ds-monitoring-service-row--header" role="row"><span>Service</span><span>Status</span><span>Latency</span><span>Version</span><span>Last check</span><span>Action</span></div>
              {visibleServices.map((service) => (
                <div className="ds-monitoring-service-row" role="row" key={service.name}>
                  <strong>{service.name}</strong><StatusBadge status={service.status} /><span>{formatOptional(service.latencyMs, formatMs)}</span><span>{service.version ?? 'Chưa có dữ liệu'}</span><span>{formatDateTime(service.checkedAt)}</span><Button type="link" onClick={() => setSelectedService(service)}>Chi tiết</Button>
                </div>
              ))}
            </div>
            {visibleServices.length === 0 ? <QueryStateView kind="empty" description="Không có service phù hợp với bộ lọc hiện tại." /> : null}
          </SurfaceCard>
          <Drawer title={selectedService ? `Service: ${selectedService.name}` : 'Service health'} open={selectedService !== null} onClose={() => setSelectedService(null)}>
            {selectedService ? <div className="ds-monitoring-service-diagnostics"><p><strong>Status:</strong> {selectedService.status}</p><p><strong>Readiness:</strong> {selectedService.summary || 'Chưa có dữ liệu canonical'}</p><p><strong>P95 latency:</strong> {formatOptional(selectedService.latencyMs, formatMs)}</p><p><strong>Version:</strong> {selectedService.version ?? 'Chưa có dữ liệu'}</p><p><strong>Last check:</strong> {formatDateTime(selectedService.checkedAt)}</p><p><strong>Metrics:</strong> {selectedService.metricsStatus ?? 'Chưa có dữ liệu'}</p>{selectedService.degradedReason?.length ? <><strong>Signals:</strong><ul>{selectedService.degradedReason.map((reason) => <li key={reason}>{reason}</li>)}</ul></> : <p>Chưa có error hoặc dependency detail trong response canonical.</p>}<Button type="link" onClick={() => navigate(`/services/health?service=${encodeURIComponent(selectedService.name)}`)}>Mở trang service đầy đủ</Button></div> : null}
          </Drawer>
        </div>
      </PageShell>
    );
  }

  // No data and error - show error state
  const status = getApiErrorStatus(overviewQuery.error);
  const message = getErrorMessage(overviewQuery.error, 'Tổng quan giám sát hiện không khả dụng.');

  return (
    <PageShell
      title="Giám sát vận hành"
      description="Console theo dõi runtime, phụ thuộc và các điểm cần xử lý ngay."
    >
      <QueryStateView
        kind={status === 403 ? 'permission' : 'error'}
        title={
          status === 403 ? 'Bạn không có quyền xem dữ liệu giám sát' : 'Không thể tải dữ liệu giám sát'
        }
        description={message}
        onRetry={() => {
          void overviewQuery.refetch();
        }}
      />
    </PageShell>
  );
};
