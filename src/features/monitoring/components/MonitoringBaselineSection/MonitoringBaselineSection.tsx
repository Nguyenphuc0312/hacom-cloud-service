import { Alert, Col, Row, Space, Typography } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';
import { StatCard } from '@/components/StatCard/StatCard';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { WidgetCard } from '@/components/WidgetCard/WidgetCard';
import { formatDateTime } from '@/utils/date/date';
import { formatNumber, formatRate } from '@/utils/formatters/formatters';
import {
  describeRatioState,
  formatRatioValue,
  getRiskStateLabel,
  riskStateToStatus,
} from '../../monitoringView/monitoringView';
import { MonitoringSectionHeader } from '../MonitoringSectionHeader/MonitoringSectionHeader';

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
        title="Ngữ cảnh baseline"
        description="Đặt tải hiện tại vào ngữ cảnh đo đạc để operator hiểu số liệu thô mà không cần mở Grafana ngay."
        deepLink={overview.links.capacityBaseline}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <WidgetCard className={`monitoring-baseline-hero monitoring-baseline-hero--${riskTone}`}>
            <div className="monitoring-baseline-hero-body">
              <Text className="dashboard-hero-eyebrow">Vùng hiện tại</Text>
              <div className="monitoring-baseline-hero-row">
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {getRiskStateLabel(baseline.currentRiskState)}
                </Typography.Title>
                <StatusBadge status={baseline.currentRiskState} />
              </div>
              <Text className="dashboard-hero-subtitle">
                {baseline.currentRiskState === 'comfortable'
                  ? 'Tải realtime hiện nằm trong vùng an toàn đã được đo kiểm.'
                  : baseline.currentRiskState === 'warning'
                    ? 'Tải realtime hiện đã vượt vùng an toàn và cần được theo dõi sát.'
                    : baseline.currentRiskState === 'near-breaking'
                      ? 'Tải realtime hiện đang chạm hoặc vượt ngưỡng cảnh báo đã đo kiểm.'
                      : 'Baseline vẫn đang chờ hoàn tất. Đã thấy tải hiện tại nhưng chưa phân loại được mức rủi ro.'}
              </Text>
              <Space size={8} wrap className="dashboard-hero-badges">
                <StatusBadge status={overview.freshness === 'live' ? 'live' : overview.freshness} />
                <StatusBadge status={baseline.status} />
              </Space>
            </div>
            <div className="monitoring-summary-list">
              <div className="monitoring-summary-list-item">
                <span>Kết nối WS hiện tại</span>
                <strong>{formatNumber(overview.systemOverview.activeConnections)}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Tin nhắn/giây hiện tại</span>
                <strong>{formatRate(overview.systemOverview.messagesPerSecond, '/s')}</strong>
              </div>
              <div className="monitoring-summary-list-item">
                <span>Baseline tạo lúc</span>
                <strong>{formatDateTime(baseline.generatedAt ?? undefined)}</strong>
              </div>
            </div>
            {baseline.status !== 'configured' ? (
              <Alert
                type="info"
                showIcon
                message="Đang chờ baseline đo kiểm"
                description="Hãy chạy workflow capture/export Phase 5B để phân loại tải hiện tại theo các ngưỡng đã đo."
              />
            ) : null}
          </WidgetCard>
        </Col>

        <Col xs={24} xl={14}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="WS an toàn đã đo"
                value={formatNumber(baseline.testedComfortableWs)}
                meta="Mức chiếm dụng websocket hoạt động đã đo"
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Tỷ lệ WS hiện tại"
                value={formatRatioValue(baseline.currentWsLoadRatio)}
                meta={describeRatioState(baseline.currentWsLoadRatio)}
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="WS cảnh báo đã đo"
                value={formatNumber(baseline.testedWarningWs)}
                meta="Theo dõi ngưỡng này trước khi cần leo thang vận hành"
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Tin nhắn/giây an toàn đã đo"
                value={formatRate(baseline.testedComfortableMsgRate, '/s')}
                meta="Thông lượng ghi duy trì đã đo"
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Tỷ lệ tin nhắn hiện tại"
                value={formatRatioValue(baseline.currentMsgLoadRatio)}
                meta={describeRatioState(baseline.currentMsgLoadRatio)}
              />
            </Col>
            <Col xs={24} sm={12} xl={8}>
              <StatCard
                title="Độ trễ hiện tại so với baseline"
                value={formatRatioValue(baseline.currentLatencyVsBaseline)}
                meta={describeRatioState(baseline.currentLatencyVsBaseline)}
              />
            </Col>
          </Row>
        </Col>

        <Col xs={24}>
          <WidgetCard title="Các ngưỡng đã đo">
            <div className="monitoring-baseline-grid">
              <div className="monitoring-baseline-grid-item">
                <span>WS an toàn / cảnh báo / cận gãy</span>
                <strong>
                  {formatNumber(baseline.testedComfortableWs)} / {formatNumber(baseline.testedWarningWs)} /{' '}
                  {formatNumber(baseline.testedNearBreakingWs)}
                </strong>
              </div>
              <div className="monitoring-baseline-grid-item">
                <span>Tin nhắn/giây an toàn / cảnh báo / cận gãy</span>
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
