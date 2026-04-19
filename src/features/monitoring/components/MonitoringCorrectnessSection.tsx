import { Col, List, Row, Typography } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types';
import { StatCard } from '@/components/StatCard';
import { WidgetCard } from '@/components/WidgetCard';
import { formatNumber, formatRate } from '@/utils/formatters';
import { formatMetricValue } from '../monitoringView';
import { MonitoringSectionHeader } from './MonitoringSectionHeader';
import { MonitoringTrendChart } from './MonitoringTrendChart';

const { Text } = Typography;

interface MonitoringCorrectnessSectionProps {
  overview: MonitoringOverviewResponse;
}

export const MonitoringCorrectnessSection = ({
  overview,
}: MonitoringCorrectnessSectionProps) => {
  const availability = overview.dataQuality.messageCorrectness.status;

  return (
    <section>
    <MonitoringSectionHeader
      title="Message Correctness"
      description="Compact view of success, partial failure, reconcile pressure, and projection drift."
      deepLink={overview.links.correctness}
    />

    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={4}>
        <StatCard
          title="Message success"
          value={formatMetricValue(formatNumber(overview.messageCorrectness.messageSuccessTotal), availability)}
          meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Total successful create path'}
        />
      </Col>
      <Col xs={24} sm={12} xl={4}>
        <StatCard
          title="Partial fail"
          value={formatMetricValue(formatNumber(overview.messageCorrectness.partialFailureTotal), availability)}
          meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Persisted but not fully clean'}
        />
      </Col>
      <Col xs={24} sm={12} xl={4}>
        <StatCard
          title="Terminal fail"
          value={formatMetricValue(formatNumber(overview.messageCorrectness.terminalFailureTotal), availability)}
          meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Create path failed hard'}
        />
      </Col>
      <Col xs={24} sm={12} xl={4}>
        <StatCard
          title="Reconcile required"
          value={formatMetricValue(formatNumber(overview.messageCorrectness.reconcileRequiredCurrent), availability)}
          meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Current backlog'}
        />
      </Col>
      <Col xs={24} xl={14}>
        <WidgetCard title="Outcome trend">
          <MonitoringTrendChart
            series={overview.messageCorrectness.outcomeTrend}
            availability={availability}
            formatter={(value) => formatRate(value, '/min')}
          />
        </WidgetCard>
      </Col>
      <Col xs={24} xl={10}>
        <WidgetCard title="Top failure reasons">
          {overview.messageCorrectness.topFailureReasons.length > 0 ? (
            <List
              dataSource={overview.messageCorrectness.topFailureReasons}
              renderItem={(item) => (
                <List.Item className="monitoring-failure-item">
                  <span className="monitoring-failure-label">{item.reason}</span>
                  <strong>{formatRate(item.ratePerMinute, '/min')}</strong>
                </List.Item>
              )}
            />
          ) : (
            <Text type="secondary">No failure reasons captured in the selected range.</Text>
          )}
        </WidgetCard>
      </Col>
      <Col xs={24}>
        <WidgetCard title="Reconcile trend">
          <MonitoringTrendChart
            series={overview.messageCorrectness.reconcileTrend}
            availability={availability}
            formatter={(value) => formatRate(value, '/min')}
          />
        </WidgetCard>
      </Col>
    </Row>
    </section>
  );
};
