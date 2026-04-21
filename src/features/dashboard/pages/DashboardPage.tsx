import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiErrorStatus, getErrorMessage } from '@/api/error';
import type { TimeRange } from '@/api/types';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import { getFreshnessLabel, riskStateToStatus } from '@/features/monitoring/monitoringView';
import { useDashboardOverview } from '../hooks/useDashboardOverview';
import {
  buildActivityTimeline,
  buildInsights,
  formatDeltaLabel,
  summarizeTrend,
} from '../utils/dashboardView';

type SummaryMetric = {
  id: string;
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  route: string;
};

const toneToStatus = (tone: SummaryMetric['tone']) => {
  if (tone === 'danger') return 'down';
  if (tone === 'warning') return 'warning';
  if (tone === 'success') return 'healthy';
  return 'unknown';
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>('1h');
  const {
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
    monitoringQuery,
    serviceHealthQuery,
    incidents,
  } = useDashboardOverview(range);

  const totalUsers = totalUsersQuery.data?.pagination.total ?? 0;
  const activeUsers = activeUsersQuery.data?.pagination.total ?? 0;
  const pendingUsers = pendingUsersQuery.data?.pagination.total ?? 0;
  const overview = monitoringQuery.data;
  const serviceHealth = serviceHealthQuery.data;
  const servicesSummary = serviceHealth?.summary;
  const servicesTotal = servicesSummary?.total ?? 0;
  const adminActivationRate = totalUsers > 0 ? activeUsers / totalUsers : 0;

  const isInitialLoading =
    !overview &&
    !serviceHealth &&
    !totalUsersQuery.data &&
    !activeUsersQuery.data &&
    (monitoringQuery.isLoading ||
      serviceHealthQuery.isLoading ||
      totalUsersQuery.isLoading ||
      activeUsersQuery.isLoading);

  if (isInitialLoading) {
    return (
      <PageShell
        eyebrow="Tổng quan"
        title="Dashboard"
        description="Tình trạng hệ thống và hạng mục cần xử lý."
      >
        <div className="ds-ops-skeleton-grid" aria-hidden>
          <div className="ds-ops-skeleton ds-ops-skeleton--alert" />
          <div className="ds-ops-skeleton ds-ops-skeleton--metric" />
          <div className="ds-ops-skeleton ds-ops-skeleton--metric" />
          <div className="ds-ops-skeleton ds-ops-skeleton--metric" />
          <div className="ds-ops-skeleton ds-ops-skeleton--metric" />
          <div className="ds-ops-skeleton ds-ops-skeleton--panel" />
          <div className="ds-ops-skeleton ds-ops-skeleton--panel" />
        </div>
      </PageShell>
    );
  }

  const hasBlockingError =
    monitoringQuery.isError &&
    serviceHealthQuery.isError &&
    !overview &&
    !serviceHealth &&
    !totalUsersQuery.data;

  if (hasBlockingError) {
    const monitoringStatus = getApiErrorStatus(monitoringQuery.error);

    return (
      <PageShell
        eyebrow="Tổng quan"
        title="Dashboard"
        description="Tình trạng hệ thống và hạng mục cần xử lý."
      >
        <ErrorState
          title={
            monitoringStatus === 403
              ? 'Bạn không có quyền xem telemetry của dashboard'
              : 'Không thể tải dashboard vận hành'
          }
          description={getErrorMessage(
            monitoringQuery.error ?? serviceHealthQuery.error,
            'Nguồn dữ liệu tổng quan tạm thời không khả dụng.',
          )}
          onRetry={() => {
            void monitoringQuery.refetch();
            void serviceHealthQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const refetchDashboard = () => {
    void monitoringQuery.refetch();
    void serviceHealthQuery.refetch();
    void totalUsersQuery.refetch();
    void activeUsersQuery.refetch();
    void pendingUsersQuery.refetch();
  };

  const hasOverviewData =
    Boolean(overview) ||
    Boolean(serviceHealth) ||
    incidents.length > 0 ||
    totalUsers > 0 ||
    activeUsers > 0 ||
    pendingUsers > 0;

  if (!hasOverviewData) {
    return (
      <PageShell
        eyebrow="Tổng quan"
        title="Dashboard"
        description="Tình trạng hệ thống và hạng mục cần xử lý."
        headerExtra={
          <Button icon={<ReloadOutlined />} onClick={refetchDashboard}>
            Làm mới
          </Button>
        }
      >
        <div className="ds-ops-panel">
          <EmptyState description="Chưa có dữ liệu vận hành để hiển thị." />
        </div>
      </PageShell>
    );
  }

  const trafficTrend = summarizeTrend(overview?.realtimeHealth.connectionsTrend ?? [], ['connection']);
  const reliabilityTrend = summarizeTrend(
    overview?.realtimeHealth.reliabilityTrend ?? [],
    ['failure', 'resync', 'delivery'],
    true,
  );
  const insights = buildInsights({ overview, serviceHealth, incidents });
  const activityTimeline = buildActivityTimeline({ overview, serviceHealth, incidents });

  const primaryAlert =
    incidents.length > 0
      ? {
          tone: 'danger' as const,
          title: `${incidents.length} sự cố đang hoạt động`,
          description: incidents[0]?.summary || incidents[0]?.title || 'Có tín hiệu cần xử lý ngay.',
          actionLabel: 'Mở dịch vụ',
          actionTo: '/services/health',
        }
      : (servicesSummary?.down ?? 0) > 0
        ? {
            tone: 'danger' as const,
            title: `${servicesSummary?.down ?? 0} dịch vụ ngừng hoạt động`,
            description: 'Một hoặc nhiều phụ thuộc đang down trong lần kiểm tra gần nhất.',
            actionLabel: 'Xem sức khỏe dịch vụ',
            actionTo: '/services/health',
          }
        : (servicesSummary?.degraded ?? 0) > 0 || overview?.freshness === 'partial'
          ? {
              tone: 'warning' as const,
              title: 'Có tín hiệu suy giảm',
              description: 'Một phần telemetry hoặc phụ thuộc đang ngoài ngưỡng kỳ vọng.',
              actionLabel: 'Mở giám sát',
              actionTo: '/monitoring',
            }
          : {
              tone: 'success' as const,
              title: 'Hệ thống ổn định',
              description: 'Không có cảnh báo khẩn trong khung thời gian hiện tại.',
              actionLabel: 'Xem giám sát',
              actionTo: '/monitoring',
            };

  const metrics: SummaryMetric[] = [
    {
      id: 'admins',
      label: 'Admin hoạt động',
      value: formatNumber(activeUsers),
      hint: `${formatPercent(adminActivationRate * 100, 0)} trên tổng tài khoản`,
      tone: pendingUsers > 0 ? 'warning' : 'default',
      route: '/users',
    },
    {
      id: 'services',
      label: 'Dịch vụ ổn định',
      value: `${servicesSummary?.up ?? 0}/${servicesTotal}`,
      hint:
        (servicesSummary?.down ?? 0) > 0
          ? `${servicesSummary?.down ?? 0} dịch vụ down`
          : (servicesSummary?.degraded ?? 0) > 0
            ? `${servicesSummary?.degraded ?? 0} dịch vụ suy giảm`
            : 'Không có dịch vụ lỗi',
      tone:
        (servicesSummary?.down ?? 0) > 0
          ? 'danger'
          : (servicesSummary?.degraded ?? 0) > 0
            ? 'warning'
            : 'success',
      route: '/services/health',
    },
    {
      id: 'connections',
      label: 'Kết nối thời gian thực',
      value: formatNumber(overview?.systemOverview.activeConnections),
      hint: `Biến động ${formatDeltaLabel(trafficTrend.delta)}`,
      tone: 'default',
      route: '/monitoring',
    },
    {
      id: 'ack',
      label: 'Sender ACK p95',
      value: formatMs(overview?.systemOverview.senderAckP95Ms),
      hint: `Lỗi gửi ${formatRate(overview?.realtimeHealth.deliveryFailuresPerMinute, '/phút')}`,
      tone:
        (overview?.systemOverview.senderAckP95Ms ?? 0) > 900
          ? 'danger'
          : (overview?.systemOverview.senderAckP95Ms ?? 0) > 450
            ? 'warning'
            : 'success',
      route: '/monitoring',
    },
  ];

  return (
    <PageShell
      eyebrow="Tổng quan"
      title="Dashboard"
      description="Tình trạng hệ thống và hạng mục cần xử lý."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <TimeRangePicker value={range} onChange={setRange} />
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<ReloadOutlined />}
              loading={monitoringQuery.isFetching || serviceHealthQuery.isFetching}
              onClick={refetchDashboard}
            >
              Làm mới
            </Button>
            {overview?.generatedAt ? (
              <span className="ds-page-toolbar-meta">{formatDateTime(overview.generatedAt)}</span>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="ds-ops-overview">
        <section className={`ds-ops-alert-strip tone-${primaryAlert.tone}`}>
          <div className="ds-ops-alert-copy">
            <span className="ds-ops-alert-label">Ưu tiên hiện tại</span>
            <strong>{primaryAlert.title}</strong>
            <p>{primaryAlert.description}</p>
          </div>
          <div className="ds-ops-alert-actions">
            <StatusBadge
              status={
                primaryAlert.tone === 'danger'
                  ? 'down'
                  : primaryAlert.tone === 'warning'
                    ? 'warning'
                    : 'healthy'
              }
            />
            <Button type="primary" onClick={() => navigate(primaryAlert.actionTo)}>
              {primaryAlert.actionLabel}
            </Button>
          </div>
        </section>

        <section className="ds-ops-summary-grid" aria-label="Tóm tắt nhanh">
          {metrics.map((metric) => (
            <button
              key={metric.id}
              type="button"
              className="ds-ops-summary-item"
              onClick={() => navigate(metric.route)}
            >
              <span className="ds-ops-summary-label">{metric.label}</span>
              <strong className="ds-ops-summary-value">{metric.value}</strong>
              <span className="ds-ops-summary-meta">{metric.hint}</span>
              <StatusBadge status={toneToStatus(metric.tone)} />
            </button>
          ))}
        </section>

        <div className="ds-ops-grid ds-ops-grid--two-column">
          <section className="ds-ops-panel">
            <div className="ds-ops-panel-header">
              <div>
                <h2>Hàng đợi xử lý</h2>
                <p>Những mục ảnh hưởng trực tiếp tới vận hành.</p>
              </div>
            </div>
            <div className="ds-ops-list">
              {[
                ...(pendingUsers > 0
                  ? [
                      {
                        id: 'pending-users',
                        title: `${pendingUsers} tài khoản chờ xác minh`,
                        description: 'Kiểm tra danh sách tài khoản cần xử lý thủ công.',
                        route: '/users',
                        status: 'warning',
                      },
                    ]
                  : []),
                ...insights.map((item) => ({
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  route: item.ctaTo,
                  status:
                    item.tone === 'critical'
                      ? 'down'
                      : item.tone === 'warning'
                        ? 'warning'
                        : 'healthy',
                })),
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ds-ops-list-row"
                  onClick={() => navigate(item.route)}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </button>
              ))}
            </div>
          </section>

          <section className="ds-ops-panel">
            <div className="ds-ops-panel-header">
              <div>
                <h2>Trạng thái hệ thống</h2>
                <p>Chỉ số phụ trợ để đối chiếu nhanh trước khi điều tra sâu.</p>
              </div>
            </div>
            <dl className="ds-ops-fact-list">
              <div>
                <dt>Telemetry</dt>
                <dd>
                  <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                </dd>
              </div>
              <div>
                <dt>Capacity baseline</dt>
                <dd>
                  <StatusBadge
                    status={overview ? riskStateToStatus(overview.capacityBaseline.currentRiskState) : 'unknown'}
                  />
                </dd>
              </div>
              <div>
                <dt>Lỗi gửi tin</dt>
                <dd>{formatRate(overview?.realtimeHealth.deliveryFailuresPerMinute, '/phút')}</dd>
              </div>
              <div>
                <dt>Resync</dt>
                <dd>{formatRate(overview?.realtimeHealth.resyncsPerMinute, '/phút')}</dd>
              </div>
              <div>
                <dt>Biến động reliability</dt>
                <dd>{formatDeltaLabel(reliabilityTrend.delta)}</dd>
              </div>
              <div>
                <dt>Ảnh chụp gần nhất</dt>
                <dd>{overview?.generatedAt ? formatDateTime(overview.generatedAt) : '-'}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="ds-ops-panel">
          <div className="ds-ops-panel-header">
            <div>
              <h2>Hoạt động gần nhất</h2>
              <p>Luồng sự cố, cảnh báo và dịch vụ cần theo dõi.</p>
            </div>
            <Button type="link" onClick={() => navigate('/audit')}>
              Mở audit trail
            </Button>
          </div>
          <div className="ds-ops-activity-list">
            {activityTimeline.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ds-ops-activity-row ${item.highlight ? 'is-highlighted' : ''}`}
                onClick={() => navigate(item.route)}
              >
                <div className="ds-ops-activity-main">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <div className="ds-ops-activity-side">
                  <span>{formatDateTime(item.timestamp)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
};
