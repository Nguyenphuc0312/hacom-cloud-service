import { Button } from 'antd';
import { useState } from 'react';

import { getApiErrorStatus, getErrorMessage } from '@/api/error/error';
import type { TimeRange } from '@/api/types/metrics/metrics';
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
  formatBytes,
  formatMs,
  formatNumber,
  formatPercent,
  formatRate,
} from '@/utils/formatters/formatters';
import { useMonitoringOverview } from '../../hooks/useMonitoringOverview/useMonitoringOverview';

const formatOptional = (
  value: number | null | undefined,
  formatter: (input: number) => string,
  fallback = '-',
) => (typeof value === 'number' ? formatter(value) : fallback);

export const MonitoringOverviewPage = () => {
  const [range, setRange] = useState<TimeRange>('1h');
  const overviewQuery = useMonitoringOverview(range);

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

  if (overviewQuery.isError && !overviewQuery.data) {
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
  }

  const overview = overviewQuery.data;

  if (!overview) {
    return (
      <PageShell
        title="Giám sát vận hành"
        description="Console theo dõi runtime, phụ thuộc và các điểm cần xử lý ngay."
      >
        <QueryStateView kind="empty" description="Chưa có dữ liệu giám sát." />
      </PageShell>
    );
  }

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

  return (
    <PageShell
      title="Giám sát vận hành"
      description="Giữ trọng tâm vào sức khỏe runtime, phụ thuộc và các tín hiệu buộc operator phải quyết định."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <TimeRangePicker value={range} onChange={setRange} />
          </div>
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
      <div className="ds-monitoring-stack">
        <div className="ds-monitoring-kpi-grid">
          <MetricCard
            label="Người dùng trực tuyến"
            value={formatOptional(overview.systemOverview.onlineUsers, formatNumber)}
            changeLabel={formatOptional(overview.systemOverview.activeConnections, formatNumber)}
            trendCaption="kết nối đang mở"
            tone="default"
          />
          <MetricCard
            label="Sender ACK p95"
            value={formatOptional(overview.systemOverview.senderAckP95Ms, formatMs)}
            changeLabel={formatOptional(overview.systemOverview.messagesPerSecond, (value) =>
              formatRate(value, '/s'),
            )}
            trendCaption="throughput hiện tại"
            tone={
              (overview.systemOverview.senderAckP95Ms ?? 0) > 900
                ? 'danger'
                : (overview.systemOverview.senderAckP95Ms ?? 0) > 450
                  ? 'warning'
                  : 'success'
            }
          />
          <MetricCard
            label="Lỗi gửi tin"
            value={formatOptional(overview.realtimeHealth.deliveryFailuresPerMinute, (value) =>
              formatRate(value, '/min'),
            )}
            changeLabel={formatOptional(overview.realtimeHealth.resyncsPerMinute, (value) =>
              formatRate(value, '/min'),
            )}
            trendCaption="resync mỗi phút"
            tone={
              (overview.realtimeHealth.deliveryFailuresPerMinute ?? 0) > 0 ? 'danger' : 'success'
            }
          />
          <MetricCard
            label="Dịch vụ ổn định"
            value={`${services.healthy}/${services.total}`}
            changeLabel={
              healthyServiceRate === null ? 'Chưa có dữ liệu' : formatPercent(healthyServiceRate, 0)
            }
            trendCaption="tỷ lệ dịch vụ khỏe"
            tone={services.down > 0 ? 'danger' : services.degraded > 0 ? 'warning' : 'success'}
          />
        </div>

        <div className="ds-ops-grid ds-ops-grid--two-column">
          <SurfaceCard
            eyebrow="Runtime"
            title="Tín hiệu cần theo dõi"
            description="Chỉ giữ những số liệu trực tiếp ảnh hưởng quyết định vận hành."
            status={<StatusBadge status={overview.freshness} />}
            className="ds-ops-panel"
          >
            <div className="ds-detail-list">
              <div className="ds-detail-list-item">
                <span>WebSocket tới API p95</span>
                <strong>{formatOptional(overview.realtimeHealth.wsToApiP95Ms, formatMs)}</strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Lỗi một phần</span>
                <strong>
                  {formatOptional(overview.systemOverview.partialFailuresPerMinute, (value) =>
                    formatRate(value, '/min'),
                  )}
                </strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Khôi phục yêu cầu</span>
                <strong>
                  {formatOptional(overview.messageCorrectness.reconcileRequiredCurrent, formatNumber)}
                </strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Thiếu projection</span>
                <strong>
                  {formatOptional(overview.messageCorrectness.projectionMissingCurrent, formatNumber)}
                </strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Bản ghi mồ côi</span>
                <strong>
                  {formatOptional(overview.messageCorrectness.orphanMongoCurrent, formatNumber)}
                </strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Rủi ro tải hiện tại</span>
                <strong>
                  <StatusBadge status={overview.capacityBaseline.currentRiskState} />
                </strong>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Phụ thuộc"
            title="API, Redis và hạ tầng"
            description="Giữ đủ ngữ cảnh để xác định nghẽn chính mà không biến page thành analytics dashboard."
            status={<StatusBadge status={overview.dependencySnapshot.redis.status} />}
            className="ds-ops-panel"
          >
            <div className="ds-detail-list">
              <div className="ds-detail-list-item">
                <span>API latency</span>
                <strong>{formatOptional(overview.dependencySnapshot.api.latencyMs, formatMs)}</strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Redis ops/s</span>
                <strong>
                  {formatOptional(overview.dependencySnapshot.redis.opsPerSecond, formatNumber)}
                </strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Redis blocked clients</span>
                <strong>
                  {formatOptional(overview.dependencySnapshot.redis.blockedClients, formatNumber)}
                </strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Bộ nhớ Redis</span>
                <strong>
                  {formatOptional(overview.dependencySnapshot.redis.memoryUsedBytes, formatBytes)}
                </strong>
              </div>
              <div className="ds-detail-list-item">
                <span>CPU hạ tầng</span>
                <strong>
                  {formatOptional(
                    overview.dependencySnapshot.infrastructure.aggregateCpuPercent,
                    (value) => formatPercent(value, 0),
                  )}
                </strong>
              </div>
              <div className="ds-detail-list-item">
                <span>Bộ nhớ hạ tầng</span>
                <strong>
                  {formatOptional(
                    overview.dependencySnapshot.infrastructure.aggregateMemoryPercent,
                    (value) => formatPercent(value, 0),
                  )}
                </strong>
              </div>
            </div>
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

        <SurfaceCard
          eyebrow="Ưu tiên xử lý"
          title="Cảnh báo và lỗi nổi bật"
          description="Danh sách này thay cho nhiều block rời rạc. Nếu một tín hiệu không dẫn tới hành động, nó không ở đây."
          className="ds-ops-panel"
        >
          {topSignals.length > 0 ? (
            <div className="ds-monitoring-signal-list">
              {topSignals.map((signal) => (
                <div key={signal.key} className="ds-ops-list-row">
                  <div>
                    <strong>{signal.title}</strong>
                    <p>{signal.meta}</p>
                  </div>
                  <StatusBadge status={signal.level} />
                </div>
              ))}
            </div>
          ) : (
            <QueryStateView
              kind="empty"
              description="Không có cảnh báo hoặc failure hotspot nào cần xử lý trong khoảng thời gian này."
            />
          )}
        </SurfaceCard>
      </div>
    </PageShell>
  );
};
