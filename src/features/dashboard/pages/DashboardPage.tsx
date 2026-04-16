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
import { IncidentBanner } from '@/components/ui/IncidentBanner';
import { MetricCard } from '@/components/ui/MetricCard';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import { getFreshnessLabel, riskStateToStatus } from '@/features/monitoring/monitoringView';
import { DashboardHero } from '../components/DashboardHero';
import { DashboardInsightPanel } from '../components/DashboardInsightPanel';
import { DashboardLoadingState } from '../components/DashboardLoadingState';
import { DashboardQuickActions } from '../components/DashboardQuickActions';
import { useDashboardOverview } from '../hooks/useDashboardOverview';
import {
  buildInsights,
  buildSparkline,
  formatDeltaLabel,
  summarizeTrend,
} from '../utils/dashboardView';

type DashboardMetricView = {
  id: string;
  label: string;
  value: string;
  changeLabel: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  trendCaption: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
  onClick: () => void;
  sparkline?: Array<number | null>;
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
        title="Dashboard"
        description="Fast production snapshot for system posture and next actions."
      >
        <DashboardLoadingState />
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
        title="Dashboard"
        description="Fast production snapshot for system posture and next actions."
      >
        <ErrorState
          title={
            monitoringStatus === 403
              ? 'Dashboard telemetry is restricted'
              : 'Unable to load the dashboard'
          }
          description={getErrorMessage(
            monitoringQuery.error ?? serviceHealthQuery.error,
            'The dashboard sources are temporarily unavailable.',
          )}
          onRetry={() => {
            void monitoringQuery.refetch();
            void serviceHealthQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const servicesSummary = serviceHealth?.summary;
  const servicesTotal = servicesSummary?.total ?? 0;
  const healthyServiceRate = servicesTotal > 0 ? (servicesSummary?.up ?? 0) / servicesTotal : null;
  const adminActivationRate = totalUsers > 0 ? activeUsers / totalUsers : 0;
  const heroTone =
    (servicesSummary?.down ?? 0) > 0 ||
    incidents.length > 0 ||
    overview?.capacityBaseline.currentRiskState === 'near-breaking'
      ? 'critical'
      : (servicesSummary?.degraded ?? 0) > 0 ||
          monitoringQuery.isError ||
          overview?.freshness === 'partial' ||
          overview?.capacityBaseline.currentRiskState === 'warning'
        ? 'degraded'
        : 'healthy';

  const trafficTrend = summarizeTrend(overview?.realtimeHealth.connectionsTrend ?? [], ['connection']);
  const reliabilityTrend = summarizeTrend(
    overview?.realtimeHealth.reliabilityTrend ?? [],
    ['failure', 'resync', 'delivery'],
    true,
  );

  const insights = buildInsights({
    overview,
    serviceHealth,
    incidents,
  });
  const criticalInsights = insights.filter((item) => item.tone !== 'good');

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

  const metricCards: DashboardMetricView[] = [
    {
      id: 'admins',
      label: 'Active admins',
      value: formatNumber(activeUsers),
      changeLabel: formatPercent(adminActivationRate * 100, 0),
      trendCaption: 'of all admin accounts',
      tone: pendingUsers > 0 ? 'warning' : 'default',
      onClick: () => navigate('/users'),
      sparkline: [Math.max(activeUsers - 3, 0), Math.max(activeUsers - 1, 0), activeUsers],
    },
    {
      id: 'online',
      label: 'Online users',
      value: formatNumber(overview?.systemOverview.onlineUsers),
      changeLabel: formatDeltaLabel(trafficTrend.delta),
      trendDirection: trafficTrend.direction,
      trendCaption: 'vs start of window',
      tone: 'default',
      onClick: () => navigate('/monitoring'),
      sparkline: buildSparkline(overview?.realtimeHealth.connectionsTrend ?? [], ['connection']),
    },
    {
      id: 'services',
      label: 'Healthy services',
      value: `${servicesSummary?.up ?? 0}/${servicesTotal}`,
      changeLabel:
        healthyServiceRate === null ? 'No data' : formatPercent(healthyServiceRate * 100, 0),
      trendCaption: 'service coverage',
      tone:
        (servicesSummary?.down ?? 0) > 0
          ? 'danger'
          : (servicesSummary?.degraded ?? 0) > 0
            ? 'warning'
            : 'success',
      onClick: () => navigate('/services/health'),
      sparkline: [
        Math.max((servicesSummary?.up ?? 0) - 2, 0),
        Math.max((servicesSummary?.up ?? 0) - 1, 0),
        servicesSummary?.up ?? 0,
      ],
    },
    {
      id: 'failures',
      label: 'Delivery failures',
      value: formatRate(overview?.realtimeHealth.deliveryFailuresPerMinute, '/min'),
      changeLabel: formatDeltaLabel(reliabilityTrend.delta),
      trendDirection: reliabilityTrend.direction,
      trendCaption: 'failure pressure',
      tone:
        (overview?.realtimeHealth.deliveryFailuresPerMinute ?? 0) > 0 ? 'danger' : 'success',
      onClick: () => navigate('/monitoring'),
      sparkline: buildSparkline(
        overview?.realtimeHealth.reliabilityTrend ?? [],
        ['failure', 'resync', 'delivery'],
      ),
    },
  ];

  return (
    <PageShell
      title="Dashboard"
      description="Fast production snapshot for system posture, active issues, and next actions."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <TimeRangePicker value={range} onChange={setRange} />
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<ReloadOutlined />}
              loading={
                monitoringQuery.isFetching ||
                serviceHealthQuery.isFetching
              }
              onClick={refetchDashboard}
            >
              Refresh
            </Button>
            {overview?.generatedAt ? (
              <span className="ds-page-toolbar-meta">
                Last sync: {formatDateTime(overview.generatedAt)}
              </span>
            ) : null}
          </div>
        </div>
      }
    >
      {!hasOverviewData ? (
        <SurfaceCard
          eyebrow="Dashboard"
          title="No operational data yet"
          description="The shell is ready, but the dashboard has not received its first telemetry payload."
        >
          <EmptyState
            title="No data available"
            description="Wait for the next refresh window or verify that monitoring and service health endpoints are enabled."
            action={<Button onClick={refetchDashboard}>Refresh dashboard</Button>}
          />
        </SurfaceCard>
      ) : (
        <div className="ds-dashboard-layout ds-dashboard-layout--snapshot">
          <div className="ds-dashboard-span-8">
            <DashboardHero
              eyebrow="System status"
              title={
                heroTone === 'healthy'
                  ? 'System posture is stable'
                  : heroTone === 'degraded'
                    ? 'Some signals need attention'
                    : 'Immediate action is required'
              }
              description={
                heroTone === 'healthy'
                  ? 'The system is serving normally. Use monitoring only when you need deeper diagnostics.'
                  : heroTone === 'degraded'
                    ? 'At least one dependency, feed, or freshness window is outside the expected range.'
                    : 'A service outage, active incident, or near-breaking capacity signal is affecting operations.'
              }
              tone={heroTone}
              status={
                <StatusBadge
                  status={
                    heroTone === 'critical'
                      ? 'down'
                      : heroTone === 'degraded'
                        ? 'degraded'
                        : 'healthy'
                  }
                />
              }
              secondaryStatus={
                overview ? (
                  <StatusBadge
                    status={riskStateToStatus(overview.capacityBaseline.currentRiskState)}
                  />
                ) : null
              }
              stats={[
                { label: 'Active incidents', value: formatNumber(incidents.length) },
                {
                  label: 'Telemetry freshness',
                  value: overview ? getFreshnessLabel(overview.freshness).toUpperCase() : 'UNKNOWN',
                },
                {
                  label: 'Sender ACK p95',
                  value: formatMs(overview?.systemOverview.senderAckP95Ms),
                },
              ]}
              primaryActionLabel="Open monitoring"
              onPrimaryAction={() => navigate('/monitoring')}
              secondaryActionLabel="Service health"
              onSecondaryAction={() => navigate('/services/health')}
            />
          </div>

          <div className="ds-dashboard-span-4">
            <DashboardQuickActions
              onCreateUser={() => navigate('/users')}
              onSendBroadcast={() => navigate('/services/email-templates')}
              onCreateGroup={() => navigate('/users')}
            />
          </div>

          {metricCards.map((metric) => (
            <div key={metric.id} className="ds-dashboard-span-3">
              <MetricCard
                label={metric.label}
                value={metric.value}
                changeLabel={metric.changeLabel}
                trendDirection={metric.trendDirection}
                trendCaption={metric.trendCaption}
                tone={metric.tone}
                onClick={metric.onClick}
                sparkline={metric.sparkline}
              />
            </div>
          ))}

          <div className="ds-dashboard-span-12">
            {criticalInsights.length > 0 ? (
              <IncidentBanner
                title={criticalInsights[0].title}
                description={criticalInsights[0].description}
                tone={criticalInsights[0].tone === 'critical' ? 'danger' : 'warning'}
                status={
                  <div className="ds-page-toolbar-group">
                    <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                    <StatusBadge
                      status={
                        (servicesSummary?.down ?? 0) > 0
                          ? 'down'
                          : (servicesSummary?.degraded ?? 0) > 0
                            ? 'degraded'
                            : 'healthy'
                      }
                    />
                  </div>
                }
                actions={
                  <Button type="primary" onClick={() => navigate(criticalInsights[0].ctaTo)}>
                    {criticalInsights[0].ctaLabel}
                  </Button>
                }
              >
                {criticalInsights.length > 1 ? (
                  <div className="monitoring-warning-group-list">
                    {criticalInsights.slice(1).map((item) => (
                      <div key={item.id} className="monitoring-warning-group-item">
                        <span>{item.title}</span>
                        <strong>{item.tone === 'critical' ? 'Escalate' : 'Review'}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </IncidentBanner>
            ) : (
              <DashboardInsightPanel insights={insights} />
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
};
