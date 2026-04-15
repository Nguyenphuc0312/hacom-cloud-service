import { ReloadOutlined } from '@ant-design/icons';
import { Button, Space } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiErrorStatus, getErrorMessage } from '@/api/error';
import type { TimeRange } from '@/api/types';
import { appConfig } from '@/config/appConfig';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { MetricCard } from '@/components/ui/MetricCard';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { ChartWrapper } from '@/features/analytics/components/ChartWrapper';
import { useTheme } from '@/theme/theme-context';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import {
  availabilityToStatus,
  getFreshnessLabel,
  getRiskStateLabel,
  riskStateToStatus,
} from '@/features/monitoring/monitoringView';
import { DashboardActivityTimeline } from '../components/DashboardActivityTimeline';
import { DashboardHero } from '../components/DashboardHero';
import { DashboardInsightPanel } from '../components/DashboardInsightPanel';
import { DashboardLoadingState } from '../components/DashboardLoadingState';
import { DashboardQuickActions } from '../components/DashboardQuickActions';
import { useDashboardOverview } from '../hooks/useDashboardOverview';
import {
  buildActivityTimeline,
  buildInsights,
  buildSparkline,
  formatDeltaLabel,
  pickPrimarySeries,
  summarizeTrend,
} from '../utils/dashboardView';

type TrendMode = 'traffic' | 'latency' | 'reliability';
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

const TREND_COPY: Record<
  TrendMode,
  {
    label: string;
    description: string;
  }
> = {
  traffic: {
    label: 'Traffic',
    description: 'Keep only the primary load lines so the trend stays readable.',
  },
  latency: {
    label: 'Latency',
    description: 'Watch sender-visible latency and cut noise from auxiliary metrics.',
  },
  reliability: {
    label: 'Reliability',
    description: 'Focus on failure and recovery pressure instead of every downstream event.',
  },
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { tokens } = useTheme();
  const [range, setRange] = useState<TimeRange>('1h');
  const [trendMode, setTrendMode] = useState<TrendMode>('traffic');
  const {
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
    monitoringQuery,
    serviceHealthQuery,
    incidentsQuery,
  } = useDashboardOverview(range);

  const totalUsers = totalUsersQuery.data?.pagination.total ?? 0;
  const activeUsers = activeUsersQuery.data?.pagination.total ?? 0;
  const pendingUsers = pendingUsersQuery.data?.pagination.total ?? 0;
  const overview = monitoringQuery.data;
  const serviceHealth = serviceHealthQuery.data;
  const incidents = incidentsQuery.data?.items ?? [];

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
        description="Production cockpit for admin operations, service posture, and realtime health."
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
        description="Production cockpit for admin operations, service posture, and realtime health."
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
            void incidentsQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const servicesSummary = serviceHealth?.summary;
  const servicesTotal = servicesSummary?.total ?? 0;
  const healthyServiceRate = servicesTotal > 0 ? (servicesSummary?.up ?? 0) / servicesTotal : null;
  const adminActivationRate = totalUsers > 0 ? activeUsers / totalUsers : 0;
  const pendingRate = totalUsers > 0 ? pendingUsers / totalUsers : 0;
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
  const latencyTrend = summarizeTrend(
    overview?.realtimeHealth.latencyTrend ?? [],
    ['ack', 'latency'],
    true,
  );
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

  const activityItems = buildActivityTimeline({
    overview,
    serviceHealth,
    incidents,
  });

  const trendSource =
    trendMode === 'traffic'
      ? overview?.realtimeHealth.connectionsTrend ?? []
      : trendMode === 'latency'
        ? overview?.realtimeHealth.latencyTrend ?? []
        : overview?.realtimeHealth.reliabilityTrend ?? [];

  const trendSeries = pickPrimarySeries(trendSource, 3);
  const trendCategories = trendSeries[0]?.points.map((point) => point.timestamp) ?? [];
  const trafficSparkline = buildSparkline(overview?.realtimeHealth.connectionsTrend ?? [], ['connection']);
  const latencySparkline = buildSparkline(
    overview?.realtimeHealth.latencyTrend ?? [],
    ['ack', 'latency'],
  );
  const reliabilitySparkline = buildSparkline(
    overview?.realtimeHealth.reliabilityTrend ?? [],
    ['failure', 'resync', 'delivery'],
  );

  const chartState =
    monitoringQuery.isLoading && !overview
      ? 'loading'
      : monitoringQuery.isError && !overview
        ? getApiErrorStatus(monitoringQuery.error) === 403
          ? 'permission'
          : 'error'
        : trendSeries.length === 0
          ? 'empty'
          : 'ready';

  const failureCategories =
    overview?.messageCorrectness.topFailureReasons.map((item) => item.reason) ?? [];
  const failureSeries =
    failureCategories.length > 0
      ? [
          {
            name: 'Failures / min',
            type: 'bar' as const,
            color: tokens.chartPalette[2],
            data:
              overview?.messageCorrectness.topFailureReasons.map(
                (item) => item.ratePerMinute,
              ) ?? [],
          },
        ]
      : [];

  const metricCards: DashboardMetricView[] = [
    {
      id: 'admins',
      label: 'Active admins',
      value: formatNumber(activeUsers),
      changeLabel: formatPercent(adminActivationRate * 100, 0),
      trendCaption: 'of all admin accounts',
      tone: pendingUsers > 0 ? 'warning' : 'default',
      onClick: () => navigate('/users'),
      sparkline: [Math.max(activeUsers - 4, 0), Math.max(activeUsers - 2, 0), activeUsers],
    },
    {
      id: 'pending',
      label: 'Pending verification',
      value: formatNumber(pendingUsers),
      changeLabel: formatPercent(pendingRate * 100, 0),
      trendCaption: 'still waiting on activation',
      tone: pendingUsers > 0 ? 'warning' : 'success',
      onClick: () => navigate('/users'),
      sparkline: [Math.max(pendingUsers + 2, 0), Math.max(pendingUsers + 1, 0), pendingUsers],
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
      sparkline: trafficSparkline,
    },
    {
      id: 'ack',
      label: 'Sender ACK p95',
      value: formatMs(overview?.systemOverview.senderAckP95Ms),
      changeLabel: formatDeltaLabel(latencyTrend.delta),
      trendDirection: latencyTrend.direction,
      trendCaption: 'vs start of window',
      tone:
        (overview?.systemOverview.senderAckP95Ms ?? 0) > 900
          ? 'danger'
          : (overview?.systemOverview.senderAckP95Ms ?? 0) > 450
            ? 'warning'
            : 'success',
      onClick: () => navigate('/monitoring'),
      sparkline: latencySparkline,
    },
    {
      id: 'services',
      label: 'Healthy services',
      value: `${servicesSummary?.up ?? 0}/${servicesTotal}`,
      changeLabel:
        healthyServiceRate === null ? 'No data' : formatPercent(healthyServiceRate * 100, 0),
      trendCaption: 'healthy service coverage',
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
      trendCaption: 'vs start of window',
      tone:
        (overview?.realtimeHealth.deliveryFailuresPerMinute ?? 0) > 0 ? 'danger' : 'success',
      onClick: () => navigate('/monitoring'),
      sparkline: reliabilitySparkline,
    },
  ];

  const refetchDashboard = () => {
    void monitoringQuery.refetch();
    void serviceHealthQuery.refetch();
    void incidentsQuery.refetch();
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

  return (
    <PageShell
      title="Dashboard"
      description="Operator-first control center for chat, realtime health, users, and system configuration."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <TimeRangePicker value={range} onChange={setRange} />
            <StatusBadge status={appConfig.liveUpdatesMode === 'live' ? 'live' : 'warning'} />
            {overview ? (
              <StatusBadge
                status={getFreshnessLabel(overview.freshness)}
                title={`Freshness: ${overview.freshness}`}
              />
            ) : null}
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<ReloadOutlined />}
              loading={
                monitoringQuery.isFetching ||
                serviceHealthQuery.isFetching ||
                incidentsQuery.isFetching
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
        <div className="ds-dashboard-layout">
          <div className="ds-dashboard-span-8">
            <DashboardHero
              eyebrow="Operations cockpit"
              title={
                heroTone === 'healthy'
                  ? 'System posture is stable'
                  : heroTone === 'degraded'
                    ? 'Some signals need operator attention'
                    : 'Immediate action is required'
              }
              description={
                heroTone === 'healthy'
                  ? 'The dashboard stays compact so operators can read health, trend movement, and the next action in a single pass.'
                  : heroTone === 'degraded'
                    ? 'The system is still serving traffic, but at least one dependency, signal, or freshness window is outside the expected range.'
                    : 'An outage, active incident, or near-breaking capacity signal is now affecting the operator experience.'
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
                    title={getRiskStateLabel(overview.capacityBaseline.currentRiskState)}
                  />
                ) : (
                  <StatusBadge status={serviceHealthQuery.isError ? 'warning' : 'unknown'} />
                )
              }
              stats={[
                { label: 'Active incidents', value: formatNumber(incidents.length) },
                {
                  label: 'Realtime freshness',
                  value: overview ? overview.freshness.toUpperCase() : 'UNKNOWN',
                },
                {
                  label: 'Live connections',
                  value: formatNumber(overview?.systemOverview.activeConnections),
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
              environmentLabel={appConfig.environmentLabel}
              liveUpdatesLabel={appConfig.liveUpdatesLabel}
              onCreateUser={() => navigate('/users')}
              onSendBroadcast={() => navigate('/services/email-templates')}
              onCreateGroup={() => navigate('/users')}
            />
          </div>

          {metricCards.map((metric) => (
            <div key={metric.id} className="ds-dashboard-span-2">
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

          <div className="ds-dashboard-span-8">
            <ChartWrapper
              eyebrow="Trend"
              title={`${TREND_COPY[trendMode].label} overview`}
              description={TREND_COPY[trendMode].description}
              status={
                overview ? (
                  <Space size={8} wrap>
                    <StatusBadge
                      status={availabilityToStatus(overview.dataQuality.realtimeHealth.status)}
                    />
                    <span className="ds-chart-status-copy">
                      {monitoringQuery.isFetching ? 'New data arriving...' : 'Realtime snapshot'}
                    </span>
                  </Space>
                ) : null
              }
              actions={
                <div className="ds-dashboard-segmented">
                  {(Object.keys(TREND_COPY) as TrendMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={trendMode === mode ? 'is-active' : undefined}
                      onClick={() => setTrendMode(mode)}
                    >
                      {TREND_COPY[mode].label}
                    </button>
                  ))}
                </div>
              }
              state={chartState}
              stateTitle={
                chartState === 'permission'
                  ? 'Monitoring data is restricted'
                  : chartState === 'error'
                    ? 'Monitoring trend is unavailable'
                    : undefined
              }
              stateDescription={
                chartState === 'error'
                  ? getErrorMessage(monitoringQuery.error, 'Unable to load trend data.')
                  : chartState === 'empty'
                    ? 'No trend data was returned for the selected range.'
                    : undefined
              }
              onRetry={() => {
                void monitoringQuery.refetch();
              }}
              categories={trendCategories}
              series={trendSeries.map((entry, index) => ({
                name: entry.label,
                color: tokens.chartPalette[index],
                data: entry.points.map((point) => point.value),
              }))}
              tooltipValueFormatter={(value) =>
                trendMode === 'latency'
                  ? formatMs(value)
                  : trendMode === 'reliability'
                    ? formatRate(value, '/min')
                    : value === null
                      ? '-'
                      : formatNumber(value)
              }
              yAxisFormatter={(value) =>
                trendMode === 'latency'
                  ? formatMs(value)
                  : trendMode === 'reliability'
                    ? formatRate(value, '/min')
                    : formatNumber(value)
              }
            />
          </div>

          <div className="ds-dashboard-span-4">
            <DashboardInsightPanel insights={insights} />
          </div>

          <div className="ds-dashboard-span-7">
            <ChartWrapper
              eyebrow="Failure breakdown"
              title="Top failure reasons"
              description="Bar view surfaces which correctness issues are driving operational cost in the current window."
              state={
                monitoringQuery.isLoading && !overview
                  ? 'loading'
                  : monitoringQuery.isError && !overview
                    ? 'error'
                    : failureSeries.length === 0
                      ? 'empty'
                      : 'ready'
              }
              stateDescription={
                monitoringQuery.isError
                  ? getErrorMessage(monitoringQuery.error, 'Unable to load failure reasons.')
                  : 'No failure reasons captured in the selected time range.'
              }
              onRetry={() => {
                void monitoringQuery.refetch();
              }}
              categories={failureCategories}
              series={failureSeries}
              tooltipValueFormatter={(value) => formatRate(value, '/min')}
              yAxisFormatter={(value) => formatRate(value, '/min')}
            />
          </div>

          <div className="ds-dashboard-span-5">
            <DashboardActivityTimeline
              items={activityItems}
              loading={
                incidentsQuery.isLoading && !incidentsQuery.data && !serviceHealth && !overview
              }
              error={Boolean(
                incidentsQuery.isError && !incidentsQuery.data && activityItems.length === 0,
              )}
              onRetry={() => {
                void incidentsQuery.refetch();
                void serviceHealthQuery.refetch();
                void monitoringQuery.refetch();
              }}
            />
          </div>
        </div>
      )}
    </PageShell>
  );
};
