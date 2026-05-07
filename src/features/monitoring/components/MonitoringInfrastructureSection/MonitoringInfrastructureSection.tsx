import { Button, Col, Row, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { WidgetCard } from '@/components/WidgetCard/WidgetCard';
import { formatBytes, formatMs, formatPercent, formatRate } from '@/utils/formatters/formatters';
import { availabilityToStatus, formatMetricValue } from '../../monitoringView/monitoringView';
import { MonitoringSectionHeader } from '../MonitoringSectionHeader/MonitoringSectionHeader';

const { Text } = Typography;

interface MonitoringInfrastructureSectionProps {
  overview: MonitoringOverviewResponse;
}

export const MonitoringInfrastructureSection = ({
  overview,
}: MonitoringInfrastructureSectionProps) => {
  const navigate = useNavigate();
  const { redis, api, infrastructure, services } = overview.dependencySnapshot;
  const availability = overview.dataQuality.dependencySnapshot.status;
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
        title="Ảnh chụp phụ thuộc / hạ tầng"
        description="Góc nhìn ngắn cho operator về Redis, API và áp lực host mà chưa cần mở Grafana."
        deepLink={overview.links.server}
        secondaryAction={
          <Space size={8}>
            {overview.links.redis ? (
              <Button type="link" href={overview.links.redis} target="_blank" rel="noreferrer">
                Dashboard Redis
              </Button>
            ) : null}
            <Button type="link" onClick={() => navigate(overview.links.serviceHealth)}>
              Sức khỏe dịch vụ
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <WidgetCard title="Redis">
            <div className="monitoring-summary-list">
              <div className="monitoring-summary-list-item">
                <span>Dịch vụ Redis</span>
                <StatusBadge status={redis.status} />
              </div>
              <div className="monitoring-summary-list-item">
                <span>Pipeline metric</span>
                <StatusBadge status={availabilityToStatus(redis.metricsStatus)} />
              </div>
              <div className="monitoring-summary-list-item">
                <span>Trạng thái exporter</span>
                <StatusBadge status={redis.exporterStatus === 'up' ? 'healthy' : redis.exporterStatus === 'down' ? 'down' : 'unknown'} />
              </div>
              <div className="monitoring-summary-list-item">
                <span>Client đang kết nối</span>
                <strong>{formatMetricValue(`${redis.connectedClients ?? '-'}`, redis.metricsStatus)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Bộ nhớ đã dùng</span>
                <strong>{formatMetricValue(formatBytes(redis.memoryUsedBytes), redis.metricsStatus)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Ops / giây</span>
                <strong>{formatMetricValue(formatRate(redis.opsPerSecond, '/s'), redis.metricsStatus)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Client bị chặn</span>
                <strong>{formatMetricValue(`${redis.blockedClients ?? '-'}`, redis.metricsStatus)}</strong>
              </div>
            </div>
            {redis.diagnosticMessage ? <Text type="secondary">{redis.diagnosticMessage}</Text> : null}
          </WidgetCard>
        </Col>
        <Col xs={24} lg={8}>
          <WidgetCard title="API chat">
            <div className="monitoring-summary-list">
              <div className="monitoring-summary-list-item">
                <span>Trạng thái</span>
                <StatusBadge status={api.status} />
              </div>
              <div className="monitoring-summary-list-item">
                <span>Độ trễ health</span>
                <strong>{formatMs(api.latencyMs)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Ghi tin nhắn p95</span>
                <strong>{formatMetricValue(formatMs(api.messageWriteP95Ms), availability)}</strong>
              </div>
            </div>
            <Text type="secondary">{api.summary}</Text>
          </WidgetCard>
        </Col>
        <Col xs={24} lg={8}>
          <WidgetCard title="Hạ tầng">
            <div className="monitoring-summary-list">
              <div className="monitoring-summary-list-item">
                <span>CPU trung bình</span>
                <strong>{formatMetricValue(formatPercent(infrastructure.aggregateCpuPercent, 1), availability)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>RAM trung bình</span>
                <strong>{formatMetricValue(formatPercent(infrastructure.aggregateMemoryPercent, 1), availability)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Lưu lượng vào mạng</span>
                <strong>{formatMetricValue(formatBytes(infrastructure.networkReceiveBytesPerSecond, true), availability)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Lưu lượng ra mạng</span>
                <strong>{formatMetricValue(formatBytes(infrastructure.networkTransmitBytesPerSecond, true), availability)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Máy chủ CPU cao nhất</span>
                <strong>{infrastructure.topCpuServer?.instance ?? '-'}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Máy chủ RAM cao nhất</span>
                <strong>{infrastructure.topMemoryServer?.instance ?? '-'}</strong>
              </div>
            </div>
          </WidgetCard>
        </Col>
        <Col xs={24}>
          <WidgetCard title="Ảnh chụp dịch vụ cốt lõi">
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
                <Text type="secondary">Chưa có dữ liệu phụ thuộc dịch vụ.</Text>
              )}
            </div>
          </WidgetCard>
        </Col>
      </Row>
    </section>
  );
};
