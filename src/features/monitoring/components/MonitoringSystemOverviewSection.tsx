import {
  CheckCircleFilled,
  CloseCircleFilled,
  DashboardOutlined,
  ExclamationCircleFilled,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Col, Row, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { MonitoringOverviewResponse } from '@/api/types';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { WidgetCard } from '@/components/WidgetCard';
import { formatMs, formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import { MonitoringSectionHeader } from './MonitoringSectionHeader';

const { Text } = Typography;

interface MonitoringSystemOverviewSectionProps {
  overview: MonitoringOverviewResponse;
}

export const MonitoringSystemOverviewSection = ({
  overview,
}: MonitoringSystemOverviewSectionProps) => {
  const navigate = useNavigate();
  const services = overview.systemOverview.services;

  const overallTone =
    services.down > 0
      ? 'down'
      : services.degraded > 0 || overview.freshness !== 'live'
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
              ? 'Realtime path and correctness signals are stable.'
              : overallTone === 'degraded'
                ? 'One or more operational signals need attention.'
                : 'There is an active dependency outage or health degradation.'}
          </Text>
          <Space size={8} wrap className="dashboard-hero-badges">
            <StatusBadge status={overallTone} />
            <StatusBadge status={overview.freshness === 'live' ? 'healthy' : 'warning'} />
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
            value={formatNumber(overview.systemOverview.activeConnections)}
            icon={<ThunderboltOutlined />}
            meta="Current live WebSocket sessions"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Online users"
            value={formatNumber(overview.systemOverview.onlineUsers)}
            icon={<CheckCircleFilled style={{ color: 'var(--state-success)' }} />}
            meta="Distinct users currently online"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Messages / sec"
            value={formatRate(overview.systemOverview.messagesPerSecond, '/s')}
            icon={<DashboardOutlined />}
            meta="Inbound realtime throughput"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Sender ACK p95"
            value={formatMs(overview.systemOverview.senderAckP95Ms)}
            icon={<ExclamationCircleFilled style={{ color: 'var(--state-warning)' }} />}
            meta="Sender-visible end-to-end latency"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Resync rate"
            value={formatRate(overview.systemOverview.resyncsPerMinute, '/min')}
            icon={<CloseCircleFilled style={{ color: 'var(--state-error)' }} />}
            meta="Client recovery requests"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Partial fail rate"
            value={formatRate(overview.systemOverview.partialFailuresPerMinute, '/min')}
            icon={<ExclamationCircleFilled style={{ color: 'var(--state-warning)' }} />}
            meta="Correctness issues needing investigation"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Top server CPU"
            value={formatPercent(overview.systemOverview.topCpuServer?.value, 1)}
            meta={overview.systemOverview.topCpuServer?.instance ?? 'No host sample'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Top server RAM"
            value={formatPercent(overview.systemOverview.topMemoryServer?.value, 1)}
            meta={overview.systemOverview.topMemoryServer?.instance ?? 'No host sample'}
          />
        </Col>
      </Row>
    </section>
  );
};
