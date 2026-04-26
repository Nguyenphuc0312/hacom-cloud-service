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
    eyebrow: 'Dashboard',
    title: 'System Overview',
    description: 'Monitor users, access control, realtime health, and system activity.',
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
              ? 'You do not have permission to view telemetry'
              : 'Unable to load system overview'
          }
          description={getErrorMessage(
            monitoringQuery.error ?? serviceHealthQuery.error,
            'The overview datasource is temporarily unavailable.',
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
      label: 'Total Users',
      value: formatNumber(totalUsers),
      meta: 'Admin users API',
      tone: 'default' as const,
      route: '/users',
    },
    {
      id: 'active-users',
      label: 'Active Users',
      value: formatNumber(activeUsers),
      meta: `${formatPercent(activationRate * 100, 0)} of total accounts`,
      tone: pendingUsers > 0 ? ('warning' as const) : ('success' as const),
      route: '/users',
    },
    {
      id: 'pending-access',
      label: 'Pending Admin Access',
      value: pendingAdminAccess === null ? '-' : formatNumber(pendingAdminAccess),
      meta: 'IP approval queue',
      tone: (pendingAdminAccess ?? 0) > 0 ? ('warning' as const) : ('success' as const),
      route: '/access-requests',
    },
    {
      id: 'realtime-connections',
      label: 'Realtime Connections',
      value: formatNumber(overview?.systemOverview.activeConnections),
      meta:
        trafficTrend.delta === null
          ? 'No trend data'
          : `Delta ${trafficTrend.delta >= 0 ? '+' : ''}${formatNumber(trafficTrend.delta)}`,
      tone: 'default' as const,
      route: '/monitoring',
    },
    {
      id: 'failed-logins',
      label: 'Failed Logins',
      value: '-',
      meta: 'No metrics available yet',
      tone: 'default' as const,
      route: '/audit',
    },
    {
      id: 'api-errors',
      label: 'API Errors',
      value: apiErrorRate === null ? '-' : formatRate(apiErrorRate, '/min'),
      meta: 'Partial failure rate',
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
              Refresh
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
          <EmptyState description="No operational data is available yet." />
        </div>
      ) : (
        <div className="ds-ops-overview">
          <section className="ds-ops-summary-grid" aria-label="Key operating metrics">
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
              title="Service Health"
              meta="Live summary from the service health API."
              action={<Button type="link" onClick={() => navigate('/services/health')}>Open</Button>}
            >
              <dl className="ds-ops-fact-list">
                <div>
                  <dt>Healthy</dt>
                  <dd>{servicesSummary ? `${servicesSummary.up}/${servicesTotal}` : '-'}</dd>
                </div>
                <div>
                  <dt>Degraded</dt>
                  <dd>{servicesSummary?.degraded ?? '-'}</dd>
                </div>
                <div>
                  <dt>Down</dt>
                  <dd>{servicesSummary?.down ?? '-'}</dd>
                </div>
                <div>
                  <dt>Checked At</dt>
                  <dd>{serviceHealth?.checkedAt ? formatDateTime(serviceHealth.checkedAt) : '-'}</dd>
                </div>
              </dl>
            </DashboardCard>

            <DashboardCard
              title="Metrics Availability"
              meta="Charts are only rendered when a real metrics datasource is connected."
              action={<Button type="link" onClick={() => navigate('/monitoring')}>Open</Button>}
            >
              <dl className="ds-ops-fact-list">
                <div>
                  <dt>Telemetry</dt>
                  <dd>
                    <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                  </dd>
                </div>
                <div>
                  <dt>Capacity Baseline</dt>
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
                  <dt>Message Volume</dt>
                  <dd>
                    {overview?.systemOverview.messagesPerSecond === null ||
                    overview?.systemOverview.messagesPerSecond === undefined
                      ? 'No metrics available yet'
                      : formatRate(overview.systemOverview.messagesPerSecond, '/sec')}
                  </dd>
                </div>
              </dl>
            </DashboardCard>
          </div>

          <DashboardCard
            title="Recent Operational Activity"
            meta="Incidents, alerts, and recent changes for follow-up."
            action={<Button type="link" onClick={() => navigate('/audit')}>Open Audit Logs</Button>}
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
                <EmptyState description="No recent activity is available yet." compact />
              )}
            </div>
          </DashboardCard>

          <DashboardCard title="Operator Queue" meta="Items that need an admin decision.">
            <div className="ds-ops-list">
              {[
                ...(pendingUsers > 0
                  ? [
                      {
                        id: 'pending-users',
                        title: `${pendingUsers} accounts pending verification`,
                        description: 'Review account state before enabling access.',
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
                <EmptyState description="No queue items require action." compact />
              ) : null}
            </div>
          </DashboardCard>
        </div>
      )}
    </PageShell>
  );
};
