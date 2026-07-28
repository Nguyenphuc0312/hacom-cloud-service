import { Button, Card, Select, Space, Typography } from 'antd';
import { useState } from 'react';

import { getErrorMessage } from '@/api/error/error';
import {
  useMessageTrafficQuery,
  useApiTrafficQuery,
} from '@/api/clients/realtimeClient/realtimeClient';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import { formatNumber } from '@/utils/formatters/formatters';

import './TrafficPage.css';

const { Text } = Typography;

type TimeRange = '15m' | '1h' | '6h' | '24h';

export const TrafficPage: React.FC = () => {
  const [range, setRange] = useState<TimeRange>('1h');

  const messageTrafficQuery = useMessageTrafficQuery(range, '1m');
  const apiTrafficQuery = useApiTrafficQuery(range, 'chat-api-service');

  const isLoading = messageTrafficQuery.isLoading || apiTrafficQuery.isLoading;

  if (isLoading && !messageTrafficQuery.data && !apiTrafficQuery.data) {
    return (
      <PageShell
        eyebrow="Realtime"
        title="Traffic"
        description="Theo dõi traffic messages và API requests theo thời gian."
      >
        <QueryStateView kind="loading" title="Đang tải dữ liệu traffic..." />
      </PageShell>
    );
  }

  if (messageTrafficQuery.isError || apiTrafficQuery.isError) {
    return (
      <PageShell
        eyebrow="Realtime"
        title="Traffic"
        description="Theo dõi traffic messages và API requests theo thời gian."
      >
        <QueryStateView
          kind="error"
          title="Không thể tải dữ liệu traffic"
          description={getErrorMessage(
            messageTrafficQuery.error || apiTrafficQuery.error,
            'Dữ liệu traffic tạm thời không khả dụng.',
          )}
          onRetry={() => {
            void messageTrafficQuery.refetch();
            void apiTrafficQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const messageData = messageTrafficQuery.data;
  const apiData = apiTrafficQuery.data;

  // The backend already aggregates these; do not re-derive them here.
  const messageSeries = messageData?.series ?? [];
  const totalMessages = messageData?.summary.totalSent ?? 0;
  const totalDelivered = messageData?.summary.totalDelivered ?? 0;
  const totalFailed =
    (messageData?.summary.totalPartialFailure ?? 0) +
    (messageData?.summary.totalTerminalFailure ?? 0);
  const requestsPerSecond = apiData?.requests.perSecond ?? 0;

  return (
    <PageShell
      eyebrow="Realtime"
      title="Traffic"
      description="Theo dõi traffic messages và API requests theo thời gian."
      headerExtra={
        <Space>
          <Select
            value={range}
            onChange={setRange}
            options={[
              { label: '15 phút', value: '15m' },
              { label: '1 giờ', value: '1h' },
              { label: '6 giờ', value: '6h' },
              { label: '24 giờ', value: '24h' },
            ]}
            style={{ width: 120 }}
          />
          <Button
            icon={<AppIcon name="refresh" size={14} />}
            onClick={() => {
              void messageTrafficQuery.refetch();
              void apiTrafficQuery.refetch();
            }}
            loading={messageTrafficQuery.isFetching || apiTrafficQuery.isFetching}
          >
            Làm mới
          </Button>
        </Space>
      }
    >
      {/* Summary Cards */}
      <div className="traffic-summary-grid">
        <Card size="small" className="traffic-summary-card">
          <div className="traffic-summary-header">
            <AppIcon name="messages" size={18} aria-hidden />
            <Text type="secondary">Tổng Messages</Text>
          </div>
          <Text strong className="traffic-summary-value">{formatNumber(totalMessages)}</Text>
        </Card>
        <Card size="small" className="traffic-summary-card">
          <div className="traffic-summary-header">
            <AppIcon name="check" size={18} aria-hidden />
            <Text type="secondary">Delivered</Text>
          </div>
          <Text strong className="traffic-summary-value">{formatNumber(totalDelivered)}</Text>
        </Card>
        <Card size="small" className="traffic-summary-card">
          <div className="traffic-summary-header">
            <AppIcon name="alertCircle" size={18} aria-hidden />
            <Text type="secondary">Failed</Text>
          </div>
          <Text strong className="traffic-summary-value traffic-summary-failed">
            {formatNumber(totalFailed)}
          </Text>
        </Card>
        <Card size="small" className="traffic-summary-card">
          <div className="traffic-summary-header">
            <AppIcon name="trending" size={18} aria-hidden />
            <Text type="secondary">API Requests</Text>
          </div>
          <Text strong className="traffic-summary-value">{formatNumber(requestsPerSecond)}/s</Text>
        </Card>
      </div>

      {/* Charts Placeholder */}
      <div className="traffic-charts-grid">
        <SurfaceCard
          eyebrow="Messages"
          title="Message Traffic"
          description="Số messages gửi, delivered và failed theo thời gian."
          className="traffic-chart-card"
        >
          <div className="traffic-chart-placeholder">
            <Text type="secondary">
              Biểu đồ message traffic sẽ hiển thị ở đây khi backend API hỗ trợ.
            </Text>
            <Text type="secondary" className="traffic-chart-hint">
              {messageSeries.length} data points trong khoảng {range}
            </Text>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="API"
          title="API Traffic"
          description="Số API requests và errors theo thời gian."
          className="traffic-chart-card"
        >
          <div className="traffic-chart-placeholder">
            <Text type="secondary">
              Biểu đồ API traffic sẽ hiển thị ở đây khi backend API hỗ trợ.
            </Text>
            {/* /traffic/api returns aggregates, not a time series. */}
            <Text type="secondary" className="traffic-chart-hint">
              {formatNumber(apiData?.requests.total ?? 0)} requests · p95{' '}
              {apiData?.latency.p95 ?? '-'} ms · {apiData?.topEndpoints.length ?? 0} endpoint trong
              khoảng {range}
            </Text>
          </div>
        </SurfaceCard>
      </div>
    </PageShell>
  );
};
