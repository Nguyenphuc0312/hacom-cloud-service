import { Button, Col, Row, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { MonitoringOverviewResponse } from '@/api/types';
import { AppIcon } from '@/components/AppIcon';
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
        title="Tổng quan hệ thống"
        description="Ảnh chụp 5 giây về tư thế vận hành, trải nghiệm gửi tin và áp lực dịch vụ hiện tại."
        deepLink={overview.links.realtime}
        secondaryAction={
          <Button type="link" onClick={() => navigate(overview.links.serviceHealth)}>
            Mở sức khỏe dịch vụ
          </Button>
        }
      />

      <WidgetCard className={`dashboard-hero dashboard-hero--${overallTone}`}>
        <div className="dashboard-hero-body">
          <Text className="dashboard-hero-eyebrow">Tư thế giám sát</Text>
          <Text className="dashboard-hero-subtitle">
            {overallTone === 'healthy'
              ? 'Luồng realtime, độ đúng và ngữ cảnh baseline đang ổn định.'
              : overallTone === 'degraded'
                ? 'Một hoặc nhiều tín hiệu vận hành cần được xử lý trước khi ảnh hưởng ra ngoài.'
                : 'Đang có sự cố phụ thuộc hoặc suy giảm sức khỏe dịch vụ.'}
          </Text>
          <Space size={8} wrap className="dashboard-hero-badges">
            <StatusBadge status={overallTone} />
            <StatusBadge status={availabilityToStatus(availability)} />
            <StatusBadge status={riskStateToStatus(riskState)} title={`Mức rủi ro: ${getRiskStateLabel(riskState)}`} />
          </Space>
        </div>
        <div className="monitoring-service-summary">
          <div className="monitoring-service-summary-item">
            <span>Ổn định</span>
            <strong>{formatNumber(services.healthy)}</strong>
          </div>
          <div className="monitoring-service-summary-item">
            <span>Suy giảm</span>
            <strong>{formatNumber(services.degraded)}</strong>
          </div>
          <div className="monitoring-service-summary-item">
            <span>Gián đoạn</span>
            <strong>{formatNumber(services.down)}</strong>
          </div>
        </div>
      </WidgetCard>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Kết nối WS hoạt động"
            value={formatMetricValue(formatNumber(overview.systemOverview.activeConnections), availability)}
            icon={<AppIcon name="activity" size={16} />}
            meta={availability === 'unavailable' ? 'Không có số liệu' : 'Số phiên WebSocket đang hoạt động'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Người dùng trực tuyến"
            value={formatMetricValue(formatNumber(overview.systemOverview.onlineUsers), availability)}
            icon={<AppIcon name="check" size={16} />}
            meta={availability === 'unavailable' ? 'Không có số liệu' : 'Số người dùng riêng biệt đang trực tuyến'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Tin nhắn / giây"
            value={formatMetricValue(formatRate(overview.systemOverview.messagesPerSecond, '/s'), availability)}
            icon={<AppIcon name="dashboard" size={16} />}
            meta={availability === 'unavailable' ? 'Không có số liệu' : 'Thông lượng realtime đầu vào'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Sender ACK p95"
            value={formatMetricValue(formatMs(overview.systemOverview.senderAckP95Ms), availability)}
            icon={<AppIcon name="warning" size={16} />}
            meta={availability === 'unavailable' ? 'Không có số liệu' : 'Độ trễ end-to-end nhìn từ phía sender'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Mức rủi ro hiện tại"
            value={<StatusBadge status={riskState} title={getRiskStateLabel(riskState)} />}
            icon={<AppIcon name="dashboard" size={16} />}
            meta={
              overview.capacityBaseline.status === 'configured'
                ? 'Tải realtime được so với baseline đã đo'
                : 'Đang chờ baseline'
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Tốc độ resync"
            value={formatMetricValue(formatRate(overview.systemOverview.resyncsPerMinute, '/min'), availability)}
            icon={<AppIcon name="close" size={16} />}
            meta={availability === 'unavailable' ? 'Không có số liệu' : 'Số yêu cầu khôi phục từ client'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Tốc độ lỗi cục bộ"
            value={formatMetricValue(formatRate(overview.systemOverview.partialFailuresPerMinute, '/min'), availability)}
            icon={<AppIcon name="warning" size={16} />}
            meta={
              availability === 'unavailable'
                ? 'Không có số liệu'
                : 'Các vấn đề độ đúng cần điều tra'
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Cập nhật lần cuối"
            value={formatDateTime(overview.generatedAt)}
            icon={<AppIcon name="history" size={16} />}
            meta={isRefreshing ? 'Đang làm mới…' : 'Lần làm mới tổng quan gần nhất'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Máy chủ CPU cao nhất"
            value={formatMetricValue(
              formatPercent(overview.systemOverview.topCpuServer?.value, 1),
              availability,
            )}
            meta={availability === 'unavailable' ? 'Không có số liệu' : overview.systemOverview.topCpuServer?.instance ?? 'Chưa có mẫu máy chủ'}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Máy chủ RAM cao nhất"
            value={formatMetricValue(
              formatPercent(overview.systemOverview.topMemoryServer?.value, 1),
              availability,
            )}
            meta={availability === 'unavailable' ? 'Không có số liệu' : overview.systemOverview.topMemoryServer?.instance ?? 'Chưa có mẫu máy chủ'}
          />
        </Col>
      </Row>
    </section>
  );
};
