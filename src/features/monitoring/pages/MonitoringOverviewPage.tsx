import { Button, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { getApiErrorStatus, getErrorMessage } from '@/api/error';
import type { TimeRange } from '@/api/types';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { formatDateTime } from '@/utils/date';
import { MonitoringBaselineSection } from '../components/MonitoringBaselineSection';
import { MonitoringCorrectnessSection } from '../components/MonitoringCorrectnessSection';
import { MonitoringDashboardLinks } from '../components/MonitoringDashboardLinks';
import { MonitoringInfrastructureSection } from '../components/MonitoringInfrastructureSection';
import { MonitoringRealtimeSection } from '../components/MonitoringRealtimeSection';
import { MonitoringSystemOverviewSection } from '../components/MonitoringSystemOverviewSection';
import { MonitoringWarnings } from '../components/MonitoringWarnings';
import { useMonitoringOverview } from '../hooks/useMonitoringOverview';
import { getFreshnessLabel } from '../monitoringView';

const { Text } = Typography;

export const MonitoringOverviewPage = () => {
  const [range, setRange] = useState<TimeRange>('1h');
  const overviewQuery = useMonitoringOverview(range);

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <PageShell
        title="Monitoring Overview"
        description="Operational snapshot for realtime health, correctness, and infra dependency posture."
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
        description="Operational snapshot for realtime health, correctness, and infra dependency posture."
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
        description="Operational snapshot for realtime health, correctness, and infra dependency posture."
      >
        <QueryStateView kind="empty" description="No monitoring data available yet." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Monitoring Overview"
      description="Operator-first snapshot of chat runtime, correctness drift, and dependency health without leaving the admin panel."
      headerExtra={
        <Space size={12} wrap>
          <TimeRangePicker value={range} onChange={setRange} />
          <StatusBadge status={getFreshnessLabel(overview.freshness)} title={`Overview freshness: ${overview.freshness}`} />
          <StatusBadge
            status={overview.capacityBaseline.currentRiskState}
            title={`Current risk zone: ${overview.capacityBaseline.currentRiskState}`}
          />
          <Button
            onClick={() => {
              void overviewQuery.refetch();
            }}
            loading={overviewQuery.isFetching}
            icon={<ReloadOutlined />}
          >
            Refresh
          </Button>
          <Text type="secondary">Last updated: {formatDateTime(overview.generatedAt)}</Text>
        </Space>
      }
    >
      <MonitoringWarnings overview={overview} />
      <MonitoringSystemOverviewSection overview={overview} isRefreshing={overviewQuery.isFetching} />
      <MonitoringBaselineSection overview={overview} />
      <MonitoringRealtimeSection overview={overview} />
      <MonitoringCorrectnessSection overview={overview} />
      <MonitoringInfrastructureSection overview={overview} />
      <MonitoringDashboardLinks overview={overview} />
    </PageShell>
  );
};
