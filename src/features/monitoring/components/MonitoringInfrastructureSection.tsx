import { Button, Col, Row, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { MonitoringOverviewResponse } from '@/api/types';
import { StatusBadge } from '@/components/StatusBadge';
import { WidgetCard } from '@/components/WidgetCard';
import { formatBytes, formatMs, formatPercent, formatRate } from '@/utils/formatters';
import { MonitoringSectionHeader } from './MonitoringSectionHeader';

const { Text } = Typography;

interface MonitoringInfrastructureSectionProps {
  overview: MonitoringOverviewResponse;
}

export const MonitoringInfrastructureSection = ({
  overview,
}: MonitoringInfrastructureSectionProps) => {
  const navigate = useNavigate();
  const { redis, api, infrastructure, services } = overview.dependencySnapshot;
  const priorityServices = [...services]
    .sort((left, right) => {
      const weight = (status: string) => {
        if (status === 'down') return 0;
        if (status === 'degraded') return 1;
        return 2;
      };

      return weight(left.status) - weight(right.status);
    })
    .slice(0, 4);

  return (
    <section>
      <MonitoringSectionHeader
        title="Dependency / Infra Snapshot"
        description="Short operator view of Redis, API, and host pressure without opening Grafana first."
        deepLink={overview.links.server}
        secondaryAction={
          <Space size={8}>
            {overview.links.redis ? (
              <Button type="link" href={overview.links.redis} target="_blank" rel="noreferrer">
                Redis dashboard
              </Button>
            ) : null}
            <Button type="link" onClick={() => navigate(overview.links.serviceHealth)}>
              Service health
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <WidgetCard title="Redis">
            <div className="monitoring-summary-list">
              <div className="monitoring-summary-list-item">
                <span>Status</span>
                <StatusBadge status={redis.status} />
              </div>
              <div className="monitoring-summary-list-item">
                <span>Connected clients</span>
                <strong>{redis.connectedClients ?? '-'}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Memory used</span>
                <strong>{formatBytes(redis.memoryUsedBytes)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Ops / sec</span>
                <strong>{formatRate(redis.opsPerSecond, '/s')}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Blocked clients</span>
                <strong>{redis.blockedClients ?? '-'}</strong>
              </div>
            </div>
          </WidgetCard>
        </Col>
        <Col xs={24} lg={8}>
          <WidgetCard title="Chat API">
            <div className="monitoring-summary-list">
              <div className="monitoring-summary-list-item">
                <span>Status</span>
                <StatusBadge status={api.status} />
              </div>
              <div className="monitoring-summary-list-item">
                <span>Health latency</span>
                <strong>{formatMs(api.latencyMs)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Message write p95</span>
                <strong>{formatMs(api.messageWriteP95Ms)}</strong>
              </div>
            </div>
            <Text type="secondary">{api.summary}</Text>
          </WidgetCard>
        </Col>
        <Col xs={24} lg={8}>
          <WidgetCard title="Infrastructure">
            <div className="monitoring-summary-list">
              <div className="monitoring-summary-list-item">
                <span>Avg CPU</span>
                <strong>{formatPercent(infrastructure.aggregateCpuPercent, 1)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Avg RAM</span>
                <strong>{formatPercent(infrastructure.aggregateMemoryPercent, 1)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Network RX</span>
                <strong>{formatBytes(infrastructure.networkReceiveBytesPerSecond, true)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Network TX</span>
                <strong>{formatBytes(infrastructure.networkTransmitBytesPerSecond, true)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Top CPU host</span>
                <strong>{infrastructure.topCpuServer?.instance ?? '-'}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Top RAM host</span>
                <strong>{infrastructure.topMemoryServer?.instance ?? '-'}</strong>
              </div>
            </div>
          </WidgetCard>
        </Col>
        <Col xs={24}>
          <WidgetCard title="Core service snapshot">
            <div className="monitoring-service-list">
              {priorityServices.length > 0 ? (
                priorityServices.map((service) => (
                  <div key={service.name} className="monitoring-service-list-item">
                    <div>
                      <strong>{service.name}</strong>
                      <Text type="secondary">{service.summary}</Text>
                    </div>
                    <div className="monitoring-service-list-meta">
                      <StatusBadge status={service.status} />
                      <Text type="secondary">{formatMs(service.latencyMs)}</Text>
                    </div>
                  </div>
                ))
              ) : (
                <Text type="secondary">Service dependency data is not available yet.</Text>
              )}
            </div>
          </WidgetCard>
        </Col>
      </Row>
    </section>
  );
};
