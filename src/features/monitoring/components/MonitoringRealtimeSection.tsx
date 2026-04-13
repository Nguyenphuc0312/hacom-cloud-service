import { Alert, Col, Row } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types';
import { WidgetCard } from '@/components/WidgetCard';
import { formatMs, formatRate } from '@/utils/formatters';
import { MonitoringSectionHeader } from './MonitoringSectionHeader';
import { MonitoringTrendChart } from './MonitoringTrendChart';

interface MonitoringRealtimeSectionProps {
  overview: MonitoringOverviewResponse;
}

export const MonitoringRealtimeSection = ({ overview }: MonitoringRealtimeSectionProps) => (
  <section>
    <MonitoringSectionHeader
      title="Realtime Health"
      description="Connection load, API hop latency, sender ACK behavior, and recovery pressure."
      deepLink={overview.links.realtime}
    />

    <Row gutter={[16, 16]}>
      <Col xs={24} xl={14}>
        <WidgetCard title="Connections trend">
          <MonitoringTrendChart series={overview.realtimeHealth.connectionsTrend} />
        </WidgetCard>
      </Col>
      <Col xs={24} xl={10}>
        <WidgetCard title="Realtime summary">
          <div className="monitoring-summary-list">
            <div className="monitoring-summary-list-item">
              <span>WS to API p95</span>
              <strong>{formatMs(overview.realtimeHealth.wsToApiP95Ms)}</strong>
            </div>
            <div className="monitoring-summary-list-item">
              <span>Sender ACK p95</span>
              <strong>{formatMs(overview.realtimeHealth.senderAckP95Ms)}</strong>
            </div>
            <div className="monitoring-summary-list-item">
              <span>Delivery failures</span>
              <strong>{formatRate(overview.realtimeHealth.deliveryFailuresPerMinute, '/min')}</strong>
            </div>
            <div className="monitoring-summary-list-item">
              <span>Resync required</span>
              <strong>{formatRate(overview.realtimeHealth.resyncsPerMinute, '/min')}</strong>
            </div>
          </div>

          {(overview.realtimeHealth.deliveryFailuresPerMinute ?? 0) > 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Delivery failures detected"
              description="Open the detailed realtime dashboard if this stays non-zero for more than a few refresh cycles."
            />
          ) : null}
        </WidgetCard>
      </Col>
      <Col xs={24} xl={12}>
        <WidgetCard title="Latency trend">
          <MonitoringTrendChart
            series={overview.realtimeHealth.latencyTrend}
            formatter={(value) => formatMs(value)}
          />
        </WidgetCard>
      </Col>
      <Col xs={24} xl={12}>
        <WidgetCard title="Delivery and recovery trend">
          <MonitoringTrendChart
            series={overview.realtimeHealth.reliabilityTrend}
            formatter={(value) => formatRate(value, '/min')}
          />
        </WidgetCard>
      </Col>
    </Row>
  </section>
);
