import {
  CheckCircleFilled,
  CloseCircleFilled,
  DashboardOutlined,
  ExclamationCircleFilled,
  FieldTimeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Col, Row, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { MonitoringOverviewResponse } from '@/api/types';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { WidgetCard } from '@/components/WidgetCard';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import {
  availabilityToStatus,
  formatMetricValue,
  getRiskStateLabel,
  riskStateToStatus,
} from '../monitoringView';
import { MonitoringSectionHeader } from './MonitoringSectionHeader';

const { Text } = Typography;

interface MonitoringSystemOverviewSectionProps {
  overview: MonitoringOverviewResponse;
  isRefreshing?: boolean;
}

export const MonitoringSystemOverviewSection = ({
  overview,
  isRefreshing = false,
}: MonitoringSystemOverviewSectionProps) => {
  const navigate = useNavigate();
  const services = overview.systemOverview.services;
  const availability = overview.dataQuality.systemOverview.status;
  const riskState = overview.capacityBaseline.currentRiskState;

  const overallTone =
    services.down > 0
      ? 'down'
      : riskState === 'near-breaking'
        ? 'down'
        : services.degraded > 0 ||
            availability !== 'available' ||
            overview.freshness !== 'live' ||
            riskState === 'warning'
        ? 'degraded'
        : 'healthy';

  return (
    <section>
      <MonitoringSectionHeader
        title="System Overview"
        description="5-second snapshot of system posture, sender experience, and current service pressure."
        deepLink={overview.links.realtime}
        secondaryAction={
          <Button type="link" onClick={() => navigate(overview.links.serviceHealth)}>
            Open service health
          </Button>
        }
      />

      <WidgetCard className={`dashboard-hero dashboard-hero--${overallTone}`}>
        <div className="dashboard-hero-body">
          <Text className="dashboard-hero-eyebrow">Monitoring posture</Text>
          <Text className="dashboard-hero-subtitle">
            {overallTone === 'healthy'
              ? 'Realtime path, correctness, and baseline context are stable.'
              : overallTone === 'degraded'
                ? 'One or more operational signals need attention before they turn customer-visible.'
                : 'There is an active dependency outage or health degradation.'}
          </Text>
          <Space size={8} wrap className="dashboard-hero-badges">
            <StatusBadge status={overallTone} />
            <StatusBadge status={availabilityToStatus(availability)} />
            <StatusBadge status={riskStateToStatus(riskState)} title={`Risk state: ${getRiskStateLabel(riskState)}`} />
          </Space>
        </div>
        <div className="monitoring-service-summary">
          <div className="monitoring-service-summary-item">
            <span>Healthy</span>
            <strong>{formatNumber(services.healthy)}</strong>
          </div>
          <div className="monitoring-service-summary-item">
            <span>Degraded</span>
            <strong>{formatNumber(services.degraded)}</strong>
          </div>
          <div className="monitoring-service-summary-item">
            <span>Down</span>
            <strong>{formatNumber(services.down)}</strong>
          </div>
        </div>
      </WidgetCard>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Active WS connections"
            value={formatMetricValue(formatNumber(overview.systemOverview.activeConnections), availability)}
            icon={<ThunderboltOutlined />}
            meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Current live WebSocket sessions'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Online users"
            value={formatMetricValue(formatNumber(overview.systemOverview.onlineUsers), availability)}
            icon={<CheckCircleFilled style={{ color: 'var(--state-success)' }} />}
            meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Distinct users currently online'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Messages / sec"
            value={formatMetricValue(formatRate(overview.systemOverview.messagesPerSecond, '/s'), availability)}
            icon={<DashboardOutlined />}
            meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Inbound realtime throughput'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Sender ACK p95"
            value={formatMetricValue(formatMs(overview.systemOverview.senderAckP95Ms), availability)}
            icon={<ExclamationCircleFilled style={{ color: 'var(--state-warning)' }} />}
            meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Sender-visible end-to-end latency'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Current risk state"
            value={<StatusBadge status={riskState} title={getRiskStateLabel(riskState)} />}
            icon={<DashboardOutlined />}
            meta={
              overview.capacityBaseline.status === 'configured'
                ? 'Live load compared with the measured baseline'
                : 'Baseline pending'
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Resync rate"
            value={formatMetricValue(formatRate(overview.systemOverview.resyncsPerMinute, '/min'), availability)}
            icon={<CloseCircleFilled style={{ color: 'var(--state-error)' }} />}
            meta={availability === 'unavailable' ? 'Metrics unavailable' : 'Client recovery requests'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Partial fail rate"
            value={formatMetricValue(formatRate(overview.systemOverview.partialFailuresPerMinute, '/min'), availability)}
            icon={<ExclamationCircleFilled style={{ color: 'var(--state-warning)' }} />}
            meta={
              availability === 'unavailable'
                ? 'Metrics unavailable'
                : 'Correctness issues needing investigation'
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Last updated"
            value={formatDateTime(overview.generatedAt)}
            icon={<FieldTimeOutlined />}
            meta={isRefreshing ? 'Refreshing…' : 'Latest admin overview refresh'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Top server CPU"
            value={formatMetricValue(
              formatPercent(overview.systemOverview.topCpuServer?.value, 1),
              availability,
            )}
            meta={availability === 'unavailable' ? 'Metrics unavailable' : overview.systemOverview.topCpuServer?.instance ?? 'No host sample'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Top server RAM"
            value={formatMetricValue(
              formatPercent(overview.systemOverview.topMemoryServer?.value, 1),
              availability,
            )}
            meta={availability === 'unavailable' ? 'Metrics unavailable' : overview.systemOverview.topMemoryServer?.instance ?? 'No host sample'}
          />
        </Col>
      </Row>
    </section>
  );
};
