import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd';

import { realtimeClient } from '@/api/clients/realtimeClient/realtimeClient';
import { getErrorMessage } from '@/api/error/error';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import { formatDateTime } from '@/utils/date/date';
import { formatNumber } from '@/utils/formatters/formatters';

const unavailableMetric = (label: string, detail: string) => (
  <div className="ds-summary-tile">
    <div className="ds-summary-tile-main">
      <span className="ds-summary-tile-label">{label}</span>
      <strong className="ds-summary-tile-value">Chưa có dữ liệu</strong>
      <small>{detail}</small>
    </div>
  </div>
);

export const UserActivityPage = () => {
  const overviewQuery = useQuery({
    queryKey: queryKeys.realtimeOverview,
    queryFn: () => realtimeClient.getOverview(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  if (overviewQuery.isPending && !overviewQuery.data) {
    return <QueryStateView kind="loading" title="Đang tải hoạt động người dùng..." />;
  }

  if (overviewQuery.isError && !overviewQuery.data) {
    return (
      <QueryStateView
        kind="error"
        description={getErrorMessage(overviewQuery.error)}
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  const overview = overviewQuery.data;
  const realtimeAvailable = overview?.sources.websocket === 'available';

  return (
    <PageShell
      eyebrow="Người dùng"
      title="Hoạt động người dùng"
      description="Tổng hợp vận hành; không hiển thị nội dung hội thoại hoặc suy đoán dữ liệu hoạt động lịch sử."
      headerExtra={
        <Button
          icon={<AppIcon name="refresh" size={16} aria-hidden />}
          loading={overviewQuery.isFetching}
          onClick={() => void overviewQuery.refetch()}
        >
          Làm mới
        </Button>
      }
    >
      <div className="ds-page-main-stack">
        <SurfaceCard
          eyebrow="Nguồn hiện có"
          title="Realtime hiện tại"
          status={<StatusBadge status={realtimeAvailable ? 'healthy' : 'unknown'} />}
        >
          <div className="ds-data-summary-grid">
            <div className="ds-summary-tile">
              <div className="ds-summary-tile-main">
                <span className="ds-summary-tile-label">Người dùng online</span>
                <strong className="ds-summary-tile-value">
                  {realtimeAvailable && overview?.onlineUsers !== null
                    ? formatNumber(overview.onlineUsers)
                    : 'Chưa có dữ liệu'}
                </strong>
                <small>
                  {overview?.lastUpdated ? `Cập nhật ${formatDateTime(overview.lastUpdated)}` : 'Nguồn websocket không phản hồi'}
                </small>
              </div>
            </div>
            <div className="ds-summary-tile">
              <div className="ds-summary-tile-main">
                <span className="ds-summary-tile-label">Kết nối websocket</span>
                <strong className="ds-summary-tile-value">
                  {realtimeAvailable && overview?.activeConnections !== null
                    ? formatNumber(overview.activeConnections)
                    : 'Chưa có dữ liệu'}
                </strong>
                <small>Nguồn: websocket runtime</small>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard eyebrow="Aggregate lịch sử" title="Chờ contract dữ liệu canonical">
          <div className="ds-data-summary-grid">
            {unavailableMetric('Daily active users', 'Chưa có upstream aggregate được đăng ký.')}
            {unavailableMetric('Weekly active users', 'Chưa có upstream aggregate được đăng ký.')}
            {unavailableMetric('Phiên cũ cần rà soát', 'Chưa có định nghĩa stale-session canonical.')}
          </div>
          <p>
            Trang này chỉ dùng metric realtime hiện có. DAU, WAU và stale sessions sẽ chỉ hiển thị khi Chat Auth hoặc
            service sở hữu công bố API/versioned contract tương ứng.
          </p>
        </SurfaceCard>
      </div>
    </PageShell>
  );
};
