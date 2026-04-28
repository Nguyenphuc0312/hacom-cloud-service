import { Alert, Col, Row } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';
import { WidgetCard } from '@/components/WidgetCard/WidgetCard';
import { formatMs, formatRate } from '@/utils/formatters/formatters';
import { formatMetricValue } from '../../monitoringView/monitoringView';
import { MonitoringSectionHeader } from '../MonitoringSectionHeader/MonitoringSectionHeader';
import { MonitoringTrendChart } from '../MonitoringTrendChart/MonitoringTrendChart';

interface MonitoringRealtimeSectionProps {
  overview: MonitoringOverviewResponse;
}

export const MonitoringRealtimeSection = ({ overview }: MonitoringRealtimeSectionProps) => (
  <section>
    <MonitoringSectionHeader
      title="Sức khỏe thời gian thực"
      description="Tải kết nối, độ trễ qua API, hành vi sender ACK và áp lực phục hồi."
      deepLink={overview.links.realtime}
    />

    <Row gutter={[16, 16]}>
      <Col xs={24} xl={14}>
        <WidgetCard title="Xu hướng kết nối">
          <MonitoringTrendChart
            series={overview.realtimeHealth.connectionsTrend}
            availability={overview.dataQuality.realtimeHealth.status}
          />
        </WidgetCard>
      </Col>
      <Col xs={24} xl={10}>
        <WidgetCard title="Tóm tắt thời gian thực">
          <div className="monitoring-summary-list">
            <div className="monitoring-summary-list-item">
              <span>WS tới API p95</span>
              <strong>
                {formatMetricValue(
                  formatMs(overview.realtimeHealth.wsToApiP95Ms),
                  overview.dataQuality.realtimeHealth.status,
                )}
              </strong>
            </div>
            <div className="monitoring-summary-list-item">
              <span>Sender ACK p95</span>
              <strong>
                {formatMetricValue(
                  formatMs(overview.realtimeHealth.senderAckP95Ms),
                  overview.dataQuality.realtimeHealth.status,
                )}
              </strong>
            </div>
            <div className="monitoring-summary-list-item">
              <span>Lỗi gửi tin</span>
              <strong>
                {formatMetricValue(
                  formatRate(overview.realtimeHealth.deliveryFailuresPerMinute, '/min'),
                  overview.dataQuality.realtimeHealth.status,
                )}
              </strong>
            </div>
            <div className="monitoring-summary-list-item">
              <span>Cần resync</span>
              <strong>
                {formatMetricValue(
                  formatRate(overview.realtimeHealth.resyncsPerMinute, '/min'),
                  overview.dataQuality.realtimeHealth.status,
                )}
              </strong>
            </div>
          </div>

          {(overview.realtimeHealth.deliveryFailuresPerMinute ?? 0) > 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Phát hiện lỗi gửi tin"
              description="Hãy mở dashboard thời gian thực chi tiết nếu chỉ số này tiếp tục khác 0 sau vài chu kỳ làm mới."
            />
          ) : null}
        </WidgetCard>
      </Col>
      <Col xs={24} xl={12}>
        <WidgetCard title="Xu hướng độ trễ">
          <MonitoringTrendChart
            series={overview.realtimeHealth.latencyTrend}
            availability={overview.dataQuality.realtimeHealth.status}
            formatter={(value) => formatMs(value)}
          />
        </WidgetCard>
      </Col>
      <Col xs={24} xl={12}>
        <WidgetCard title="Xu hướng lỗi gửi và phục hồi">
          <MonitoringTrendChart
            series={overview.realtimeHealth.reliabilityTrend}
            availability={overview.dataQuality.realtimeHealth.status}
            formatter={(value) => formatRate(value, '/min')}
          />
        </WidgetCard>
      </Col>
    </Row>
  </section>
);
