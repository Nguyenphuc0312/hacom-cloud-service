import { Alert, Col, Row, Space, Typography } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { WidgetCard } from '@/components/WidgetCard';
import { formatDateTime } from '@/utils/date';
import { formatNumber, formatRate } from '@/utils/formatters';
import {
  describeRatioState,
  formatRatioValue,
  getRiskStateLabel,
  riskStateToStatus,
} from '../monitoringView';
import { MonitoringSectionHeader } from './MonitoringSectionHeader';

const { Text } = Typography;

interface MonitoringBaselineSectionProps {
  overview: MonitoringOverviewResponse;
}

export const MonitoringBaselineSection = ({ overview }: MonitoringBaselineSectionProps) => {
  const baseline = overview.capacityBaseline;
  const riskTone = riskStateToStatus(baseline.currentRiskState);

  return (
    <section>
      <MonitoringSectionHeader
        title="Baseline Context"
        description="Current load with measured operator context, so raw numbers stay understandable without opening Grafana."
        deepLink={overview.links.capacityBaseline}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <WidgetCard className={`monitoring-baseline-hero monitoring-baseline-hero--${riskTone}`}>
            <div className="monitoring-baseline-hero-body">
              <Text className="dashboard-hero-eyebrow">Current zone</Text>
              <div className="monitoring-baseline-hero-row">
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {getRiskStateLabel(baseline.currentRiskState)}
                </Typography.Title>
                <StatusBadge status={baseline.currentRiskState} />
              </div>
              <Text className="dashboard-hero-subtitle">
                {baseline.currentRiskState === 'comfortable'
                  ? 'Current live load is within the tested comfortable zone.'
                  : baseline.currentRiskState === 'warning'
                    ? 'Current live load is above the comfortable zone and should be watched closely.'
                    : baseline.currentRiskState === 'near-breaking'
                      ? 'Current live load is at or above the tested warning line.'
                      : 'Baseline is pending. Current load is visible but not yet classified.'}
              </Text>
              <Space size={8} wrap className="dashboard-hero-badges">
                <StatusBadge status={overview.freshness === 'live' ? 'live' : overview.freshness} />
                <StatusBadge status={baseline.status} />
              </Space>
            </div>
            <div className="monitoring-summary-list">
              <div className="monitoring-summary-list-item">
                <span>Current active WS</span>
                <strong>{formatNumber(overview.systemOverview.activeConnections)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Current msg/sec</span>
                <strong>{formatRate(overview.systemOverview.messagesPerSecond, '/s')}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Baseline generated</span>
                <strong>{formatDateTime(baseline.generatedAt ?? undefined)}</strong>
              </div>
            </div>
            {baseline.status !== 'configured' ? (
              <Alert
                type="info"
                showIcon
                message="Measured baseline pending"
                description="Run the Phase 5B capture/export workflow to classify current load against tested ranges."
              />
            ) : null}
          </WidgetCard>
        </Col>

        <Col xs={24} xl={14}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Tested comfortable WS"
                value={formatNumber(baseline.testedComfortableWs)}
                meta="Measured active websocket occupancy"
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Current WS ratio"
                value={formatRatioValue(baseline.currentWsLoadRatio)}
                meta={describeRatioState(baseline.currentWsLoadRatio)}
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Tested warning WS"
                value={formatNumber(baseline.testedWarningWs)}
                meta="Watch this line before operator action escalates"
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Tested comfortable msg/sec"
                value={formatRate(baseline.testedComfortableMsgRate, '/s')}
                meta="Measured sustained write throughput"
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Current msg ratio"
                value={formatRatioValue(baseline.currentMsgLoadRatio)}
                meta={describeRatioState(baseline.currentMsgLoadRatio)}
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Current latency vs baseline"
                value={formatRatioValue(baseline.currentLatencyVsBaseline)}
                meta={describeRatioState(baseline.currentLatencyVsBaseline)}
              />
            </Col>
          </Row>
        </Col>

        <Col xs={24}>
          <WidgetCard title="Measured ranges">
            <div className="monitoring-baseline-grid">
              <div className="monitoring-baseline-grid-item">
                <span>WS comfortable / warning / near-breaking</span>
                <strong>
                  {formatNumber(baseline.testedComfortableWs)} / {formatNumber(baseline.testedWarningWs)} /{' '}
                  {formatNumber(baseline.testedNearBreakingWs)}
                </strong>
              </div>
              <div className="monitoring-baseline-grid-item">
                <span>Msg/sec comfortable / warning / near-breaking</span>
                <strong>
                  {formatRate(baseline.testedComfortableMsgRate, '/s')} /{' '}
                  {formatRate(baseline.testedWarningMsgRate, '/s')} /{' '}
                  {formatRate(baseline.testedNearBreakingMsgRate, '/s')}
                </strong>
              </div>
            </div>
          </WidgetCard>
        </Col>
      </Row>
    </section>
  );
};
