import { Button } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiErrorStatus, getErrorMessage } from '@/api/error';
import type { TimeRange } from '@/api/types';
import { AppIcon } from '@/components/AppIcon';
import { DashboardCard } from '@/components/DashboardCard';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatDateTime } from '@/utils/date';
import { formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import { getFreshnessLabel, riskStateToStatus } from '@/features/monitoring/monitoringView';
import { useDashboardOverview } from '../hooks/useDashboardOverview';
import { buildActivityTimeline, buildInsights, summarizeTrend } from '../utils/dashboardView';

const toneToStatus = (tone: 'default' | 'success' | 'warning' | 'danger') => {
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
    pendingAdminAccessQuery,
    monitoringQuery,
    serviceHealthQuery,
    incidents,
  } = useDashboardOverview(range);

  const totalUsers = totalUsersQuery.data?.pagination.total ?? 0;
  const activeUsers = activeUsersQuery.data?.pagination.total ?? 0;
  const pendingUsers = pendingUsersQuery.data?.pagination.total ?? 0;
  const pendingAdminAccess = pendingAdminAccessQuery.data?.pagination.total ?? null;
  const overview = monitoringQuery.data;
  const serviceHealth = serviceHealthQuery.data;
  const servicesSummary = serviceHealth?.summary;
  const activationRate = totalUsers > 0 ? activeUsers / totalUsers : 0;

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
        <div className="ds-ops-skeleton-grid" aria-hidden>
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

  const metrics = [
    {
      id: 'total-users',
      label: 'Tổng người dùng',
      value: formatNumber(totalUsers),
      meta: 'Từ API người dùng admin',
      tone: 'default' as const,
      route: '/users',
    },
    {
      id: 'active-users',
      label: 'Người dùng hoạt động',
      value: formatNumber(activeUsers),
      meta: `${formatPercent(activationRate * 100, 0)} tổng tài khoản`,
      tone: pendingUsers > 0 ? ('warning' as const) : ('success' as const),
      route: '/users',
    },
    {
      id: 'pending-access',
      label: 'Truy cập chờ duyệt',
      value: pendingAdminAccess === null ? '-' : formatNumber(pendingAdminAccess),
      meta: 'Hàng đợi duyệt IP',
      tone: (pendingAdminAccess ?? 0) > 0 ? ('warning' as const) : ('success' as const),
      route: '/access-requests',
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
      route: '/monitoring',
    },
    {
      id: 'failed-logins',
      label: 'Đăng nhập lỗi',
      value: '-',
      meta: 'Chưa có metric',
      tone: 'default' as const,
      route: '/audit',
    },
    {
      id: 'api-errors',
      label: 'Lỗi API',
      value: apiErrorRate === null ? '-' : formatRate(apiErrorRate, '/min'),
      meta: 'Tỷ lệ lỗi một phần',
      tone: (apiErrorRate ?? 0) > 0 ? ('danger' as const) : ('success' as const),
      route: '/monitoring',
    },
  ];

  const hasOverviewData =
    Boolean(overview) ||
    Boolean(serviceHealth) ||
    incidents.length > 0 ||
    totalUsers > 0 ||
    activeUsers > 0 ||
    pendingUsers > 0 ||
    pendingAdminAccess !== null;

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
        <div className="ds-ops-panel">
          <EmptyState description="Chưa có dữ liệu vận hành." />
        </div>
      ) : (
        <div className="ds-ops-overview">
          <section className="ds-ops-summary-grid" aria-label="Chỉ số vận hành chính">
            {metrics.map((metric) => (
              <button
                key={metric.id}
                type="button"
                className="ds-ops-summary-item"
                onClick={() => navigate(metric.route)}
              >
                <span className="ds-ops-summary-label">{metric.label}</span>
                <strong className="ds-ops-summary-value">{metric.value}</strong>
                <span className="ds-ops-summary-meta">{metric.meta}</span>
                <StatusBadge status={toneToStatus(metric.tone)} />
              </button>
            ))}
          </section>

          <div className="ds-ops-grid ds-ops-grid--two-column">
            <DashboardCard
              title="Sức khỏe dịch vụ"
              meta="Tóm tắt trực tiếp từ API service health."
              action={<Button type="link" onClick={() => navigate('/services/health')}>Mở</Button>}
            >
              <dl className="ds-ops-fact-list">
                <div>
                  <dt>Khỏe</dt>
                  <dd>{servicesSummary ? `${servicesSummary.up}/${servicesTotal}` : '-'}</dd>
                </div>
                <div>
                  <dt>Suy giảm</dt>
                  <dd>{servicesSummary?.degraded ?? '-'}</dd>
                </div>
                <div>
                  <dt>Ngừng</dt>
                  <dd>{servicesSummary?.down ?? '-'}</dd>
                </div>
                <div>
                  <dt>Kiểm tra lúc</dt>
                  <dd>{serviceHealth?.checkedAt ? formatDateTime(serviceHealth.checkedAt) : '-'}</dd>
                </div>
              </dl>
            </DashboardCard>

            <DashboardCard
              title="Tình trạng metric"
              meta="Chỉ hiển thị biểu đồ khi có nguồn metric thật."
              action={<Button type="link" onClick={() => navigate('/monitoring')}>Mở</Button>}
            >
              <dl className="ds-ops-fact-list">
                <div>
                  <dt>Telemetry</dt>
                  <dd>
                    <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                  </dd>
                </div>
                <div>
                  <dt>Nền tải</dt>
                  <dd>
                    <StatusBadge
                      status={
                        overview
                          ? riskStateToStatus(overview.capacityBaseline.currentRiskState)
                          : 'unknown'
                      }
                    />
                  </dd>
                </div>
                <div>
                  <dt>Lưu lượng tin nhắn</dt>
                  <dd>
                    {overview?.systemOverview.messagesPerSecond === null ||
                    overview?.systemOverview.messagesPerSecond === undefined
                      ? 'Chưa có metric'
                      : formatRate(overview.systemOverview.messagesPerSecond, '/sec')}
                  </dd>
                </div>
              </dl>
            </DashboardCard>
          </div>

          <DashboardCard
            title="Hoạt động vận hành gần đây"
            meta="Incident, cảnh báo và thay đổi cần theo dõi."
            action={<Button type="link" onClick={() => navigate('/audit')}>Mở audit</Button>}
          >
            <div className="ds-ops-activity-list">
              {activityTimeline.slice(0, 6).length > 0 ? (
                activityTimeline.slice(0, 6).map((item) => (
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
                ))
              ) : (
                <EmptyState description="Chưa có hoạt động gần đây." compact />
              )}
            </div>
          </DashboardCard>

          <DashboardCard title="Hàng đợi xử lý" meta="Mục cần admin ra quyết định.">
            <div className="ds-ops-list">
              {[
                ...(pendingUsers > 0
                  ? [
                      {
                        id: 'pending-users',
                        title: `${pendingUsers} tài khoản chờ xác minh`,
                        description: 'Rà soát trạng thái trước khi bật truy cập.',
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
              {pendingUsers === 0 && insights.length === 0 ? (
                <EmptyState description="Không có mục nào cần xử lý." compact />
              ) : null}
            </div>
          </DashboardCard>
        </div>
      )}
    </PageShell>
  );
};
