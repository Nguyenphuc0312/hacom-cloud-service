import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';

import { getApiErrorStatus, getErrorMessage } from '@/api/error';
import type { TimeRange } from '@/api/types';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { MetricCard } from '@/components/ui/MetricCard';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import { MonitoringCorrectnessSection } from '../components/MonitoringCorrectnessSection';
import { MonitoringInfrastructureSection } from '../components/MonitoringInfrastructureSection';
import { MonitoringRealtimeSection } from '../components/MonitoringRealtimeSection';
import { MonitoringWarnings } from '../components/MonitoringWarnings';
import { useMonitoringOverview } from '../hooks/useMonitoringOverview';

export const MonitoringOverviewPage = () => {
  const [range, setRange] = useState<TimeRange>('1h');
  const overviewQuery = useMonitoringOverview(range);

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <PageShell
        title="Tổng quan giám sát"
        description="Ảnh chụp vận hành cho sức khỏe thời gian thực, độ đúng và trạng thái phụ thuộc."
      >
        <QueryStateView kind="loading" title="Đang tải tổng quan giám sát..." />
      </PageShell>
    );
  }

  if (overviewQuery.isError && !overviewQuery.data) {
    const status = getApiErrorStatus(overviewQuery.error);
    const message = getErrorMessage(overviewQuery.error, 'Tổng quan giám sát hiện không khả dụng.');

    return (
      <PageShell
        title="Tổng quan giám sát"
        description="Ảnh chụp vận hành cho sức khỏe thời gian thực, độ đúng và trạng thái phụ thuộc."
      >
        <QueryStateView
          kind={status === 403 ? 'permission' : 'error'}
          title={
            status === 403
              ? 'Bạn không có quyền xem tổng quan giám sát'
              : 'Không thể tải tổng quan giám sát'
          }
          description={message}
          onRetry={() => {
            void overviewQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const overview = overviewQuery.data;

  if (!overview) {
    return (
      <PageShell
        title="Tổng quan giám sát"
        description="Ảnh chụp vận hành cho sức khỏe thời gian thực, độ đúng và trạng thái phụ thuộc."
      >
        <QueryStateView kind="empty" description="Chưa có dữ liệu giám sát." />
      </PageShell>
    );
  }

  const services = overview.systemOverview.services;
  const healthyServiceRate =
    services.total > 0 ? (services.healthy / services.total) * 100 : null;

  return (
    <PageShell
      title="Tổng quan giám sát"
      description="Theo dõi sức khỏe runtime, lỗi gửi tin và trạng thái phụ thuộc trong một cockpit vận hành."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <TimeRangePicker value={range} onChange={setRange} />
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              onClick={() => {
                void overviewQuery.refetch();
              }}
              loading={overviewQuery.isFetching}
              icon={<ReloadOutlined />}
            >
              Làm mới
            </Button>
            <span className="ds-page-toolbar-meta">
              Cập nhật lần cuối: {formatDateTime(overview.generatedAt)}
            </span>
          </div>
        </div>
      }
    >
      <div className="ds-monitoring-stack">
        <div className="ds-monitoring-kpi-grid">
          <MetricCard
            label="Người dùng trực tuyến"
            value={formatNumber(overview.systemOverview.onlineUsers)}
            changeLabel={formatNumber(overview.systemOverview.activeConnections)}
            trendCaption="kết nối websocket đang hoạt động"
            tone="default"
          />
          <MetricCard
            label="Sender ACK p95"
            value={formatMs(overview.systemOverview.senderAckP95Ms)}
            changeLabel={formatRate(overview.systemOverview.messagesPerSecond, '/s')}
            trendCaption="đi cùng throughput hiện tại"
            tone={
              (overview.systemOverview.senderAckP95Ms ?? 0) > 900
                ? 'danger'
                : (overview.systemOverview.senderAckP95Ms ?? 0) > 450
                  ? 'warning'
                  : 'success'
            }
          />
          <MetricCard
            label="Lỗi gửi tin"
            value={formatRate(overview.realtimeHealth.deliveryFailuresPerMinute, '/min')}
            changeLabel={formatRate(overview.realtimeHealth.resyncsPerMinute, '/min')}
            trendCaption="áp lực resync"
            tone={
              (overview.realtimeHealth.deliveryFailuresPerMinute ?? 0) > 0 ? 'danger' : 'success'
            }
          />
          <MetricCard
            label="Dịch vụ ổn định"
            value={`${services.healthy}/${services.total}`}
            changeLabel={
              healthyServiceRate === null ? 'Chưa có dữ liệu' : formatPercent(healthyServiceRate, 0)
            }
            trendCaption="độ phủ phụ thuộc"
            tone={services.down > 0 ? 'danger' : services.degraded > 0 ? 'warning' : 'success'}
          />
        </div>

        <MonitoringWarnings overview={overview} />
        <MonitoringRealtimeSection overview={overview} />
        <MonitoringCorrectnessSection overview={overview} />
        <MonitoringInfrastructureSection overview={overview} />
      </div>
    </PageShell>
  );
};
