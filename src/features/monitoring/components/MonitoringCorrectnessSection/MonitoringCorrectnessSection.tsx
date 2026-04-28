import { Col, List, Row, Typography } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';
import { StatCard } from '@/components/StatCard/StatCard';
import { WidgetCard } from '@/components/WidgetCard/WidgetCard';
import { formatNumber, formatRate } from '@/utils/formatters/formatters';
import { formatMetricValue } from '../../monitoringView/monitoringView';
import { MonitoringSectionHeader } from '../MonitoringSectionHeader/MonitoringSectionHeader';
import { MonitoringTrendChart } from '../MonitoringTrendChart/MonitoringTrendChart';

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
      title="Độ đúng của tin nhắn"
      description="Góc nhìn gọn về thành công, lỗi một phần, áp lực reconcile và độ lệch projection."
      deepLink={overview.links.correctness}
    />

    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={4}>
        <StatCard
          title="Tin nhắn thành công"
          value={formatMetricValue(formatNumber(overview.messageCorrectness.messageSuccessTotal), availability)}
          meta={availability === 'unavailable' ? 'Metric không khả dụng' : 'Tổng số luồng tạo thành công'}
        />
      </Col>
      <Col xs={24} sm={12} xl={4}>
        <StatCard
          title="Lỗi một phần"
          value={formatMetricValue(formatNumber(overview.messageCorrectness.partialFailureTotal), availability)}
          meta={availability === 'unavailable' ? 'Metric không khả dụng' : 'Đã lưu nhưng chưa sạch hoàn toàn'}
        />
      </Col>
      <Col xs={24} sm={12} xl={4}>
        <StatCard
          title="Lỗi cuối cùng"
          value={formatMetricValue(formatNumber(overview.messageCorrectness.terminalFailureTotal), availability)}
          meta={availability === 'unavailable' ? 'Metric không khả dụng' : 'Luồng tạo thất bại hoàn toàn'}
        />
      </Col>
      <Col xs={24} sm={12} xl={4}>
        <StatCard
          title="Cần reconcile"
          value={formatMetricValue(formatNumber(overview.messageCorrectness.reconcileRequiredCurrent), availability)}
          meta={availability === 'unavailable' ? 'Metric không khả dụng' : 'Backlog hiện tại'}
        />
      </Col>
      <Col xs={24} xl={14}>
        <WidgetCard title="Xu hướng kết quả">
          <MonitoringTrendChart
            series={overview.messageCorrectness.outcomeTrend}
            availability={availability}
            formatter={(value) => formatRate(value, '/min')}
          />
        </WidgetCard>
      </Col>
      <Col xs={24} xl={10}>
        <WidgetCard title="Nguyên nhân lỗi hàng đầu">
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
            <Text type="secondary">Không ghi nhận nguyên nhân lỗi nào trong khoảng đã chọn.</Text>
          )}
        </WidgetCard>
      </Col>
      <Col xs={24}>
        <WidgetCard title="Xu hướng reconcile">
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
