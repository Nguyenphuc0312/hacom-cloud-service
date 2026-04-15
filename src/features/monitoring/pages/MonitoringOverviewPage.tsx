import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';

import { getApiErrorStatus, getErrorMessage } from '@/api/error';
import type { TimeRange } from '@/api/types';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { MetricCard } from '@/components/ui/MetricCard';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import { MonitoringCorrectnessSection } from '../components/MonitoringCorrectnessSection';
import { MonitoringInfrastructureSection } from '../components/MonitoringInfrastructureSection';
import { MonitoringRealtimeSection } from '../components/MonitoringRealtimeSection';
import { MonitoringWarnings } from '../components/MonitoringWarnings';
import { useMonitoringOverview } from '../hooks/useMonitoringOverview';

export const MonitoringOverviewPage = () => {
  const [range, setRange] = useState<TimeRange>('1h');
  const overviewQuery = useMonitoringOverview(range);

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <PageShell
        title="Monitoring Overview"
        description="Operational snapshot for realtime health, correctness, and dependency posture."
      >
        <QueryStateView kind="loading" title="Loading monitoring overview..." />
      </PageShell>
    );
  }

  if (overviewQuery.isError && !overviewQuery.data) {
    const status = getApiErrorStatus(overviewQuery.error);
    const message = getErrorMessage(overviewQuery.error, 'Monitoring overview is unavailable.');

    return (
      <PageShell
        title="Monitoring Overview"
        description="Operational snapshot for realtime health, correctness, and dependency posture."
      >
        <QueryStateView
          kind={status === 403 ? 'permission' : 'error'}
          title={
            status === 403
              ? 'You do not have access to monitoring overview'
              : 'Unable to load monitoring overview'
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
        title="Monitoring Overview"
        description="Operational snapshot for realtime health, correctness, and dependency posture."
      >
        <QueryStateView kind="empty" description="No monitoring data available yet." />
      </PageShell>
    );
  }

  const services = overview.systemOverview.services;
  const healthyServiceRate =
    services.total > 0 ? (services.healthy / services.total) * 100 : null;

  return (
    <PageShell
      title="Monitoring Overview"
      description="Watch runtime health, delivery failures, and dependency posture from one operator cockpit."
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
              icon={<ReloadOutlined />}
            >
              Refresh
            </Button>
            <span className="ds-page-toolbar-meta">
              Last updated: {formatDateTime(overview.generatedAt)}
            </span>
          </div>
        </div>
      }
    >
      <div className="ds-monitoring-stack">
        <div className="ds-monitoring-kpi-grid">
          <MetricCard
            label="Online users"
            value={formatNumber(overview.systemOverview.onlineUsers)}
            changeLabel={formatNumber(overview.systemOverview.activeConnections)}
            trendCaption="active websocket connections"
            tone="default"
          />
          <MetricCard
            label="Sender ACK p95"
            value={formatMs(overview.systemOverview.senderAckP95Ms)}
            changeLabel={formatRate(overview.systemOverview.messagesPerSecond, '/s')}
            trendCaption="paired with current throughput"
            tone={
              (overview.systemOverview.senderAckP95Ms ?? 0) > 900
                ? 'danger'
                : (overview.systemOverview.senderAckP95Ms ?? 0) > 450
                  ? 'warning'
                  : 'success'
            }
          />
          <MetricCard
            label="Delivery failures"
            value={formatRate(overview.realtimeHealth.deliveryFailuresPerMinute, '/min')}
            changeLabel={formatRate(overview.realtimeHealth.resyncsPerMinute, '/min')}
            trendCaption="resync pressure"
            tone={
              (overview.realtimeHealth.deliveryFailuresPerMinute ?? 0) > 0 ? 'danger' : 'success'
            }
          />
          <MetricCard
            label="Healthy services"
            value={`${services.healthy}/${services.total}`}
            changeLabel={
              healthyServiceRate === null ? 'No data' : formatPercent(healthyServiceRate, 0)
            }
            trendCaption="dependency coverage"
            tone={services.down > 0 ? 'danger' : services.degraded > 0 ? 'warning' : 'success'}
          />
        </div>

        <MonitoringWarnings overview={overview} />
        <MonitoringRealtimeSection overview={overview} />
        <MonitoringCorrectnessSection overview={overview} />
        <MonitoringInfrastructureSection overview={overview} />
      </div>
    </PageShell>
  );
};
