import { Button, Card, Progress, Typography } from 'antd';

import { getErrorMessage } from '@/api/error/error';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import type { AppIconKey } from '@/components/AppIcon/AppIcon';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import { formatDateTime } from '@/utils/date/date';
import { formatNumber, formatRate } from '@/utils/formatters/formatters';
import { appConfig } from '@/config/appConfig/appConfig';
import { useRealtimeOverview } from '../../hooks/useRealtimeOverview/useRealtimeOverview';

import './RealtimeDashboard.css';

const { Text } = Typography;

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label: string;
  };
  status?: 'healthy' | 'warning' | 'danger' | 'unknown';
  icon: AppIconKey;
}

const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  status = 'unknown',
  icon,
}) => {
  const statusColors = {
    healthy: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    unknown: 'var(--color-muted)',
  };

  return (
    <Card className="realtime-kpi-card" size="small">
      <div className="realtime-kpi-header">
        <span className="realtime-kpi-icon" style={{ color: statusColors[status] }}>
          <AppIcon name={icon} size={20} aria-hidden />
        </span>
        <Text type="secondary" className="realtime-kpi-title">{title}</Text>
      </div>
      <div className="realtime-kpi-value">{value}</div>
      {subtitle && (
        <Text type="secondary" className="realtime-kpi-subtitle">{subtitle}</Text>
      )}
      {trend && (
        <div className={`realtime-kpi-trend trend-${trend.direction}`}>
          <AppIcon
            name={trend.direction === 'up' ? 'trendingUp' : trend.direction === 'down' ? 'trendingDown' : 'minus'}
            size={14}
            aria-hidden
          />
          <span>{trend.label}</span>
        </div>
      )}
    </Card>
  );
};

interface ServiceStatusCardProps {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency?: string;
  lastChecked?: string;
}

const ServiceStatusCard: React.FC<ServiceStatusCardProps> = ({
  name,
  status,
  latency,
  lastChecked,
}) => {
  return (
    <div className={`service-status-card status-${status}`}>
      <div className="service-status-header">
        <Text strong>{name}</Text>
        <StatusBadge status={status === 'healthy' ? 'healthy' : status === 'degraded' ? 'warning' : status === 'down' ? 'down' : 'unknown'} />
      </div>
      {latency && (
        <Text type="secondary" className="service-latency">{latency}</Text>
      )}
      {lastChecked && (
        <Text type="secondary" className="service-last-checked">
          Kiểm tra: {formatDateTime(lastChecked)}
        </Text>
      )}
    </div>
  );
};

export const RealtimeDashboardPage: React.FC = () => {
  const { data, isLoading, isError, error, isPaused, togglePause, refresh, lastUpdated, isFetching } =
    useRealtimeOverview();

  if (isLoading && !data) {
    return (
      <PageShell
        eyebrow="Realtime"
        title="Dashboard Realtime"
        description="Theo dõi KPIs realtime: người dùng online, kết nối, tin nhắn và trạng thái hệ thống."
      >
        <QueryStateView kind="loading" title="Đang tải dữ liệu realtime..." />
      </PageShell>
    );
  }

  if (isError && !data) {
    return (
      <PageShell
        eyebrow="Realtime"
        title="Dashboard Realtime"
        description="Theo dõi KPIs realtime: người dùng online, kết nối, tin nhắn và trạng thái hệ thống."
      >
        <QueryStateView
          kind="error"
          title="Không thể tải dữ liệu realtime"
          description={getErrorMessage(error, 'Dữ liệu realtime tạm thời không khả dụng.')}
          onRetry={refresh}
        />
      </PageShell>
    );
  }

  const overview = data;

  // Health reflects which upstream sources answered, which is all the backend
  // reports. Do not derive it from metrics the API does not return.
  const getSystemHealthStatus = (): 'healthy' | 'warning' | 'danger' | 'unknown' => {
    if (!overview) return 'unknown';
    const unavailable = Object.values(overview.sources).filter(
      (status) => status === 'unavailable',
    ).length;
    if (unavailable === 0) return 'healthy';
    if (overview.sources.redis === 'unavailable') return 'danger';
    return 'warning';
  };

  const sourceStatus = (source: 'available' | 'unavailable' | undefined) =>
    source === 'available' ? 'healthy' : source === 'unavailable' ? 'down' : 'unknown';

  const systemHealthStatus = getSystemHealthStatus();
  const systemHealthPercent = systemHealthStatus === 'healthy' ? 100 : systemHealthStatus === 'warning' ? 70 : systemHealthStatus === 'danger' ? 30 : 0;

  return (
    <PageShell
      eyebrow="Realtime"
      title="Dashboard Realtime"
      description="Theo dõi KPIs realtime: người dùng online, kết nối, tin nhắn và trạng thái hệ thống."
      headerExtra={
        <div className="realtime-header-actions">
          <Button
            type={isPaused ? 'primary' : 'default'}
            icon={<AppIcon name={isPaused ? 'play' : 'pause'} size={14} aria-hidden />}
            onClick={togglePause}
          >
            {isPaused ? 'Tiếp tục' : 'Tạm dừng'}
          </Button>
          <Button
            icon={<AppIcon name="refresh" size={14} aria-hidden />}
            onClick={refresh}
            loading={isFetching}
          >
            Làm mới
          </Button>
          {lastUpdated && (
            <Text type="secondary" className="realtime-last-updated">
              Cập nhật: {formatDateTime(lastUpdated.toISOString())}
            </Text>
          )}
        </div>
      }
    >
      {/* System Health Banner */}
      <div className={`realtime-health-banner health-${systemHealthStatus}`}>
        <div className="health-banner-content">
          <AppIcon
            name={systemHealthStatus === 'healthy' ? 'check' : systemHealthStatus === 'warning' ? 'alert' : 'alertCircle'}
            size={24}
            aria-hidden
          />
          <div className="health-banner-text">
            <Text strong>
              {systemHealthStatus === 'healthy' && 'Hệ thống hoạt động ổn định'}
              {systemHealthStatus === 'warning' && 'Hệ thống có cảnh báo'}
              {systemHealthStatus === 'danger' && 'Hệ thống gặp sự cố'}
              {systemHealthStatus === 'unknown' && 'Trạng thái không xác định'}
            </Text>
            <Text type="secondary">
              {overview
                ? `Nguồn dữ liệu: Redis ${overview.sources.redis === 'available' ? 'OK' : 'lỗi'} · WebSocket ${overview.sources.websocket === 'available' ? 'OK' : 'lỗi'} · Prometheus ${overview.sources.prometheus === 'available' ? 'OK' : 'lỗi'}`
                : 'Đang theo dõi...'}
            </Text>
          </div>
        </div>
        <Progress
          type="circle"
          percent={systemHealthPercent}
          size={60}
          strokeColor={
            systemHealthStatus === 'healthy'
              ? 'var(--color-success)'
              : systemHealthStatus === 'warning'
                ? 'var(--color-warning)'
                : systemHealthStatus === 'danger'
                  ? 'var(--color-danger)'
                  : 'var(--color-muted)'
          }
          format={() => `${systemHealthPercent}%`}
        />
      </div>

      {/* KPI Cards Grid */}
      <div className="realtime-kpi-grid">
        <KpiCard
          title="Người dùng Online"
          value={formatNumber(overview?.onlineUsers)}
          subtitle="Đang hoạt động"
          status="healthy"
          icon="users"
        />
        <KpiCard
          title="Kết nối WebSocket"
          value={formatNumber(overview?.activeConnections)}
          subtitle="Active connections"
          status="healthy"
          icon="activity"
        />
        <KpiCard
          title="Phòng đang hoạt động"
          value={formatNumber(overview?.activeRooms)}
          subtitle="Có người online"
          status="healthy"
          icon="messages"
        />
        <KpiCard
          title="Đang soạn tin"
          value={formatNumber(overview?.typingUsersCount)}
          status="healthy"
          icon="trending"
        />
        <KpiCard
          title="Gửi tin lỗi / Phút"
          value={formatRate(overview?.deliveryFailuresPerMinute ?? 0, '/min')}
          subtitle="WS delivery failures"
          status={(overview?.deliveryFailuresPerMinute ?? 0) > 0 ? 'danger' : 'healthy'}
          icon="alertCircle"
        />
        <KpiCard
          title="Kết nối lại / Phút"
          value={formatRate(overview?.reconnectRatePerMinute ?? 0, '/min')}
          status="healthy"
          icon="clock"
        />
        <KpiCard
          title="Nguồn Presence"
          value={overview?.sources.redis === 'available' ? 'REDIS OK' : 'KHÔNG KHẢ DỤNG'}
          subtitle="Redis presence"
          status={overview?.sources.redis === 'available' ? 'healthy' : 'danger'}
          icon="server"
        />
      </div>

      {/* Service Status Section */}
      <SurfaceCard
        eyebrow="Hệ thống"
        title="Trạng thái Dịch vụ"
        description="Theo dõi trạng thái các dịch vụ và cơ sở dữ liệu."
        className="realtime-services-section"
      >
        <div className="realtime-services-grid">
          <ServiceStatusCard
            name="Redis (presence)"
            status={sourceStatus(overview?.sources.redis)}
            lastChecked={lastUpdated?.toISOString()}
          />
          <ServiceStatusCard
            name="WebSocket metrics"
            status={sourceStatus(overview?.sources.websocket)}
            lastChecked={lastUpdated?.toISOString()}
          />
          <ServiceStatusCard
            name="Prometheus"
            status={sourceStatus(overview?.sources.prometheus)}
            lastChecked={lastUpdated?.toISOString()}
          />
        </div>
      </SurfaceCard>

      {/* Last Updated Footer */}
      <div className="realtime-footer">
        <Text type="secondary">
          Dữ liệu được cập nhật mỗi {appConfig.dashboardRefetchIntervalMs / 1000} giây.
          {isPaused && ' Auto-refresh đang tạm dừng.'}
        </Text>
      </div>
    </PageShell>
  );
};
