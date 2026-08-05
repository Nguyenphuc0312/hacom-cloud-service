import { Button, Progress, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { getApiErrorStatus, getErrorMessage } from '@/api/error/error';
import type { TimeRange } from '@/api/types/metrics/metrics';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DashboardCard } from '@/components/DashboardCard/DashboardCard';
import { PageShell } from '@/components/PageShell/PageShell';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker/TimeRangePicker';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState/ErrorState';
import { formatDateTime } from '@/utils/date/date';
import { formatNumber, formatPercent, formatRate } from '@/utils/formatters/formatters';
import { getFreshnessLabel, riskStateToStatus } from '@/features/monitoring/monitoringView/monitoringView';
import { DashboardHighchartsPanel } from '../../components/DashboardHighchartsPanel/DashboardHighchartsPanel';
import { useDashboardOverview } from '../../hooks/useDashboardOverview/useDashboardOverview';
import { buildActivityTimeline, buildInsights, summarizeTrend } from '../../utils/dashboardView/dashboardView';

import styles from './DashboardPage.module.css';

// Helper function to capitalize first letter
const capitalize = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1);

// Helper function to get tone class
const getToneClass = (tone: string): string => {
  switch (tone) {
    case 'success':
      return styles.toneHealthy;
    case 'warning':
      return styles.toneWarning;
    case 'danger':
      return styles.toneDanger;
    default:
      return '';
  }
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>('1h');
  const {
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
    pendingAdminAccessQuery,
    monitoringQuery,
    serviceHealthQuery,
    incidents,
  } = useDashboardOverview(range);

  // An unavailable aggregate is not the same thing as an empty aggregate.
  // Preserve null so the dashboard never presents a failed API as a real zero.
  const totalUsers = totalUsersQuery.data?.pagination.total ?? null;
  const activeUsers = activeUsersQuery.data?.pagination.total ?? null;
  const pendingUsers = pendingUsersQuery.data?.pagination.total ?? null;
  const pendingAdminAccess = pendingAdminAccessQuery.data?.pagination.total ?? null;
  const overview = monitoringQuery.data;
  const serviceHealth = serviceHealthQuery.data;
  const servicesSummary = serviceHealth?.summary;
  const activationRate =
    totalUsers !== null && activeUsers !== null && totalUsers > 0 ? activeUsers / totalUsers : null;

  const refetchDashboard = () => {
    void monitoringQuery.refetch();
    void serviceHealthQuery.refetch();
    void totalUsersQuery.refetch();
    void activeUsersQuery.refetch();
    void pendingUsersQuery.refetch();
    void pendingAdminAccessQuery.refetch();
  };

  const pageHeader = {
    eyebrow: 'Tổng quan',
    title: 'Tổng quan hệ thống',
    description: 'Theo dõi người dùng, truy cập, realtime và hoạt động hệ thống.',
  };

  const isInitialLoading =
    !overview &&
    !serviceHealth &&
    !totalUsersQuery.data &&
    !activeUsersQuery.data &&
    [
      monitoringQuery,
      serviceHealthQuery,
      totalUsersQuery,
      activeUsersQuery,
      pendingAdminAccessQuery,
    ].some((query) => query.isLoading);

  if (isInitialLoading) {
    return (
      <PageShell {...pageHeader}>
        <div className={styles.skeletonGrid} aria-hidden>
          <div className={`${styles.skeleton} ${styles.skeletonMetric}`} />
          <div className={`${styles.skeleton} ${styles.skeletonMetric}`} />
          <div className={`${styles.skeleton} ${styles.skeletonMetric}`} />
          <div className={`${styles.skeleton} ${styles.skeletonMetric}`} />
          <div className={`${styles.skeleton} ${styles.skeletonPanel}`} />
          <div className={`${styles.skeleton} ${styles.skeletonPanel}`} />
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
      <PageShell {...pageHeader}>
        <ErrorState
          title={
            monitoringStatus === 403
              ? 'Bạn không có quyền xem telemetry'
              : 'Không thể tải tổng quan hệ thống'
          }
          description={getErrorMessage(
            monitoringQuery.error ?? serviceHealthQuery.error,
            'Nguồn dữ liệu tổng quan tạm thời không khả dụng.',
          )}
          onRetry={refetchDashboard}
        />
      </PageShell>
    );
  }

  const trafficTrend = summarizeTrend(overview?.realtimeHealth.connectionsTrend ?? [], [
    'connection',
  ]);
  const insights = buildInsights({ overview, serviceHealth, incidents });
  const activityTimeline = buildActivityTimeline({ overview, serviceHealth, incidents });
  const servicesTotal = servicesSummary?.total ?? 0;
  const apiErrorRate = overview?.systemOverview.partialFailuresPerMinute ?? null;

  // Calculate system health status
  const getSystemHealthStatus = (): 'healthy' | 'warning' | 'danger' | 'unknown' => {
    if (!overview && !serviceHealth) return 'unknown';
    if (overview) {
      if (overview.freshness === 'unavailable') return 'danger';
      if (overview.systemOverview.services.down > 0) return 'danger';
      if (apiErrorRate && apiErrorRate > 5) return 'danger';
      if (overview.capacityBaseline.currentRiskState === 'near-breaking') return 'warning';
      if (overview.systemOverview.services.degraded > 0) return 'warning';
      if (apiErrorRate && apiErrorRate > 1) return 'warning';
    }
    if (serviceHealth?.summary.down && serviceHealth.summary.down > 0) return 'danger';
    if (serviceHealth?.summary.degraded && serviceHealth.summary.degraded > 0) return 'warning';
    return 'healthy';
  };

  const systemHealthStatus = getSystemHealthStatus();
  const systemHealthPercent =
    systemHealthStatus === 'healthy' ? 100
      : systemHealthStatus === 'warning' ? 70
      : systemHealthStatus === 'danger' ? 30
      : 0;

  const metrics = [
    {
      id: 'total-users',
      label: 'Tổng người dùng',
      value: formatNumber(totalUsers),
      meta: 'Từ API người dùng admin',
      tone: 'default' as const,
      route: '/users',
      icon: 'users' as const,
    },
    {
      id: 'active-users',
      label: 'Người dùng hoạt động',
      value: formatNumber(activeUsers),
      meta: `${activationRate === null ? '-' : formatPercent(activationRate * 100, 0)} tổng tài khoản`,
      tone: pendingUsers === null ? ('default' as const) : pendingUsers > 0 ? ('warning' as const) : ('success' as const),
      route: '/users',
      icon: 'check' as const,
    },
    {
      id: 'pending-access',
      label: 'Truy cập chờ duyệt',
      value: pendingAdminAccess === null ? '-' : formatNumber(pendingAdminAccess),
      meta: 'Hàng đợi duyệt IP',
      tone: (pendingAdminAccess ?? 0) > 0 ? ('warning' as const) : ('success' as const),
      route: '/access-requests',
      icon: 'access' as const,
    },
    {
      id: 'realtime-connections',
      label: 'Kết nối realtime',
      value: formatNumber(overview?.systemOverview.activeConnections),
      meta:
        trafficTrend.delta === null
          ? 'Chưa có dữ liệu xu hướng'
          : `Delta ${trafficTrend.delta >= 0 ? '+' : ''}${formatNumber(trafficTrend.delta)}`,
      tone: 'default' as const,
      route: '/realtime',
      icon: 'activity' as const,
    },
    {
      id: 'api-errors',
      label: 'Lỗi API',
      value: apiErrorRate === null ? '-' : formatRate(apiErrorRate, '/min'),
      meta: 'Tỷ lệ lỗi một phần',
      tone: (apiErrorRate ?? 0) > 0 ? ('danger' as const) : ('success' as const),
      route: '/realtime',
      icon: 'warning' as const,
    },
  ];

  const hasOverviewData =
    Boolean(overview) ||
    Boolean(serviceHealth) ||
    incidents.length > 0 ||
    totalUsers !== null ||
    activeUsers !== null ||
    pendingUsers !== null ||
    pendingAdminAccess !== null;

  // Count critical insights for alerts badge
  const criticalCount = insights.filter(i => i.tone === 'critical').length;
  const warningCount = insights.filter(i => i.tone === 'warning').length;

  // Health banner class
  const healthBannerClass = [
    styles.healthBanner,
    styles[`health${capitalize(systemHealthStatus)}`],
  ].join(' ');

  return (
    <PageShell
      {...pageHeader}
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <TimeRangePicker value={range} onChange={setRange} />
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<AppIcon name="refresh" size={16} aria-hidden />}
              loading={
                monitoringQuery.isFetching ||
                serviceHealthQuery.isFetching ||
                pendingAdminAccessQuery.isFetching
              }
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
      {!hasOverviewData ? (
        <div className={styles.emptyState}>
          <EmptyState description="Chưa có dữ liệu vận hành." />
        </div>
      ) : (
        <div className={styles.dashboardLayout}>
          {/* System Health Banner */}
          <div className={healthBannerClass}>
            <div className={styles.healthBannerContent}>
              <AppIcon
                name={systemHealthStatus === 'healthy' ? 'check' : systemHealthStatus === 'warning' ? 'alert' : 'alertCircle'}
                size={24}
                aria-hidden
              />
              <div className={styles.healthBannerText}>
                <Typography.Text strong>
                  {systemHealthStatus === 'healthy' && 'Hệ thống hoạt động ổn định'}
                  {systemHealthStatus === 'warning' && 'Hệ thống có cảnh báo'}
                  {systemHealthStatus === 'danger' && 'Hệ thống gặp sự cố'}
                  {systemHealthStatus === 'unknown' && 'Trạng thái không xác định'}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {servicesTotal > 0
                    ? `${servicesSummary?.up ?? 0}/${servicesTotal} dịch vụ online`
                    : overview?.systemOverview.services.total
                      ? `${overview.systemOverview.services.healthy}/${overview.systemOverview.services.total} dịch vụ`
                      : 'Đang theo dõi...'}
                </Typography.Text>
              </div>
            </div>
            <div className={styles.healthBannerActions}>
              <Button
                type="link"
                icon={<AppIcon name="activity" size={14} />}
                onClick={() => navigate('/realtime')}
              >
                Realtime
              </Button>
              {(criticalCount > 0 || warningCount > 0) && (
                <Button
                  type="link"
                  danger={criticalCount > 0}
                  icon={<AppIcon name="alert" size={14} />}
                  onClick={() => navigate('/alerts')}
                >
                  {criticalCount > 0 ? `${criticalCount} nghiêm trọng` : `${warningCount} cảnh báo`}
                </Button>
              )}
            </div>
            <Progress
              type="circle"
              percent={systemHealthPercent}
              size={56}
              strokeColor={
                systemHealthStatus === 'healthy'
                  ? 'var(--color-success)'
                  : systemHealthStatus === 'warning'
                    ? 'var(--color-warning)'
                    : systemHealthStatus === 'danger'
                      ? 'var(--color-danger)'
                      : 'var(--color-muted)'
              }
              format={() => `${systemHealthPercent}%`}
            />
          </div>

          {/* Summary Metrics Grid */}
          <section className={styles.summaryGrid} aria-label="Chỉ số vận hành chính">
            {metrics.map((metric) => (
              <button
                key={metric.id}
                type="button"
                className={`${styles.summaryCard} ${getToneClass(metric.tone)}`}
                onClick={() => navigate(metric.route)}
              >
                <span className={styles.summaryIcon} aria-hidden>
                  <AppIcon name={metric.icon} size={34} strokeWidth={1.6} className={styles.icon} />
                </span>
                <span className={styles.summaryLabel}>{metric.label}</span>
                <strong className={styles.summaryValue}>{metric.value}</strong>
                <span className={styles.summaryMeta}>{metric.meta}</span>
              </button>
            ))}
          </section>

          {/* Main Grid */}
          <div className={styles.mainGrid}>
            <DashboardCard
              title="Sức khỏe dịch vụ"
              action={<Button type="link" onClick={() => navigate('/services/health')}>Mở</Button>}
              className={styles.healthCard}
            >
              <div className={styles.healthVisual}>
                <DashboardHighchartsPanel type="health" summary={servicesSummary} />
                <div className={styles.healthCenter} aria-hidden>
                  <strong>
                    {servicesTotal > 0
                      ? formatPercent(((servicesSummary?.up ?? 0) / servicesTotal) * 100, 0)
                      : '-'}
                  </strong>
                  <span>Khỏe mạnh</span>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard
              title="Tổng quan lưu lượng"
              action={<Button type="link" onClick={() => navigate('/realtime')}>Mở</Button>}
              className={styles.trafficCard}
            >
              <DashboardHighchartsPanel
                type="traffic"
                series={overview?.realtimeHealth.connectionsTrend}
              />
            </DashboardCard>
          </div>

          {/* Bottom Grid */}
          <div className={styles.bottomGrid}>
            <DashboardCard
              title="Trạng thái Dịch vụ"
              action={<Button type="link" onClick={() => navigate('/services/health')}>Mở</Button>}
            >
              <div className={styles.serviceList}>
                {(serviceHealth?.items ?? []).slice(0, 4).map((service) => (
                  <button
                    key={service.name}
                    type="button"
                    className={styles.serviceRow}
                    onClick={() => navigate('/services/health')}
                  >
                    <span>{service.name}</span>
                    <StatusBadge
                      status={
                        service.status === 'up'
                          ? 'healthy'
                          : service.status === 'degraded'
                            ? 'warning'
                            : service.status === 'down'
                              ? 'down'
                              : 'unknown'
                      }
                    />
                  </button>
                ))}
                {!serviceHealth?.items?.length ? (
                  <div className={`${styles.serviceRow} ${styles.isStatic}`}>
                    <span>Telemetry</span>
                    <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                  </div>
                ) : null}
              </div>
            </DashboardCard>

            <DashboardCard
              title="Tỷ lệ Lỗi API"
              action={<Button type="link" onClick={() => navigate('/realtime')}>Mở</Button>}
              className={styles.apiCard}
            >
              <div className={styles.apiState}>
                <strong>{apiErrorRate === null ? '-' : formatRate(apiErrorRate, '/phút')}</strong>
                <span className={`${styles.apiStateIndicator} ${(apiErrorRate ?? 0) > 0 ? styles.isWarning : styles.isOk}`}>
                  <AppIcon name={(apiErrorRate ?? 0) > 0 ? 'warning' : 'check'} size={14} aria-hidden />
                  {(apiErrorRate ?? 0) > 0
                    ? 'Có lỗi cần kiểm tra'
                    : 'Hệ thống hoạt động ổn định'}
                </span>
                <dl className={styles.apiStateDl}>
                  <div>
                    <dt className={styles.apiStateDt}>Telemetry</dt>
                    <dd className={styles.apiStateDd}>
                      <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                    </dd>
                  </div>
                  <div>
                    <dt className={styles.apiStateDt}>Nền tải</dt>
                    <dd className={styles.apiStateDd}>
                      <StatusBadge
                        status={
                          overview
                            ? riskStateToStatus(overview.capacityBaseline.currentRiskState)
                            : 'unknown'
                        }
                      />
                    </dd>
                  </div>
                </dl>
              </div>
            </DashboardCard>
          </div>

          {/* Activity Timeline */}
          <DashboardCard title="Hoạt động vận hành gần đây" action={<Button type="link" onClick={() => navigate('/audit')}>Mở audit</Button>}>
            <div className={styles.activityList}>
              {activityTimeline.slice(0, 4).length > 0 ? (
                activityTimeline.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.activityRow} ${item.highlight ? styles.isHighlighted : ''}`}
                    onClick={() => navigate(item.route)}
                  >
                    <div className={styles.activityMain}>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                    <div className={styles.activitySide}>
                      <span>{formatDateTime(item.timestamp)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState description="Chưa có hoạt động gần đây." compact />
              )}
            </div>
          </DashboardCard>

          {/* Action Queue */}
          <DashboardCard title="Hàng đợi xử lý">
            <div className={styles.opsList}>
              {[
                ...(pendingUsers !== null && pendingUsers > 0
                  ? [
                      {
                        id: 'pending-users',
                        title: `${pendingUsers} tài khoản chờ xác minh`,
                        description: 'Rà soát trạng thái trước khi bật truy cập.',
                        route: '/users',
                        status: 'warning' as const,
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
                      ? 'down' as const
                      : item.tone === 'warning'
                        ? 'warning' as const
                        : 'healthy' as const,
                })),
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.listRow}
                  onClick={() => navigate(item.route)}
                >
                  <div className={styles.listMain}>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </button>
              ))}
              {pendingUsers !== null && pendingUsers === 0 && insights.length === 0 ? (
                <EmptyState description="Không có mục nào cần xử lý." compact />
              ) : null}
            </div>
          </DashboardCard>
        </div>
      )}
    </PageShell>
  );
};
