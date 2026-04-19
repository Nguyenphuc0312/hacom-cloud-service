import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiErrorStatus, getErrorMessage } from '@/api/error';
import type { TimeRange } from '@/api/types';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IncidentBanner } from '@/components/ui/IncidentBanner';
import { MetricCard } from '@/components/ui/MetricCard';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatNumber, formatPercent, formatRate } from '@/utils/formatters';
import { getFreshnessLabel, riskStateToStatus } from '@/features/monitoring/monitoringView';
import { DashboardHero } from '../components/DashboardHero';
import { DashboardInsightPanel } from '../components/DashboardInsightPanel';
import { DashboardLoadingState } from '../components/DashboardLoadingState';
import { DashboardQuickActions } from '../components/DashboardQuickActions';
import { useDashboardOverview } from '../hooks/useDashboardOverview';
import {
  buildInsights,
  buildSparkline,
  formatDeltaLabel,
  summarizeTrend,
} from '../utils/dashboardView';

type DashboardMetricView = {
  id: string;
  label: string;
  value: string;
  changeLabel: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  trendCaption: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
  onClick: () => void;
  sparkline?: Array<number | null>;
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>('1h');
  const {
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
    monitoringQuery,
    serviceHealthQuery,
    incidents,
  } = useDashboardOverview(range);

  const totalUsers = totalUsersQuery.data?.pagination.total ?? 0;
  const activeUsers = activeUsersQuery.data?.pagination.total ?? 0;
  const pendingUsers = pendingUsersQuery.data?.pagination.total ?? 0;
  const overview = monitoringQuery.data;
  const serviceHealth = serviceHealthQuery.data;

  const isInitialLoading =
    !overview &&
    !serviceHealth &&
    !totalUsersQuery.data &&
    !activeUsersQuery.data &&
    (monitoringQuery.isLoading ||
      serviceHealthQuery.isLoading ||
      totalUsersQuery.isLoading ||
      activeUsersQuery.isLoading);

  if (isInitialLoading) {
    return (
      <PageShell
        title="Bảng điều khiển"
        description="Ảnh chụp nhanh trạng thái hệ thống và các việc cần xử lý tiếp theo."
      >
        <DashboardLoadingState />
      </PageShell>
    );
  }

  const hasBlockingError =
    monitoringQuery.isError &&
    serviceHealthQuery.isError &&
    !overview &&
    !serviceHealth &&
    !totalUsersQuery.data;

  if (hasBlockingError) {
    const monitoringStatus = getApiErrorStatus(monitoringQuery.error);

    return (
      <PageShell
        title="Bảng điều khiển"
        description="Ảnh chụp nhanh trạng thái hệ thống và các việc cần xử lý tiếp theo."
      >
        <ErrorState
          title={
            monitoringStatus === 403
              ? 'Bạn không có quyền xem telemetry của dashboard'
              : 'Không thể tải bảng điều khiển'
          }
          description={getErrorMessage(
            monitoringQuery.error ?? serviceHealthQuery.error,
            'Các nguồn dữ liệu của dashboard tạm thời không khả dụng.',
          )}
          onRetry={() => {
            void monitoringQuery.refetch();
            void serviceHealthQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const servicesSummary = serviceHealth?.summary;
  const servicesTotal = servicesSummary?.total ?? 0;
  const healthyServiceRate = servicesTotal > 0 ? (servicesSummary?.up ?? 0) / servicesTotal : null;
  const adminActivationRate = totalUsers > 0 ? activeUsers / totalUsers : 0;
  const heroTone =
    (servicesSummary?.down ?? 0) > 0 ||
    incidents.length > 0 ||
    overview?.capacityBaseline.currentRiskState === 'near-breaking'
      ? 'critical'
      : (servicesSummary?.degraded ?? 0) > 0 ||
          monitoringQuery.isError ||
          overview?.freshness === 'partial' ||
          overview?.capacityBaseline.currentRiskState === 'warning'
        ? 'degraded'
        : 'healthy';

  const trafficTrend = summarizeTrend(overview?.realtimeHealth.connectionsTrend ?? [], ['connection']);
  const reliabilityTrend = summarizeTrend(
    overview?.realtimeHealth.reliabilityTrend ?? [],
    ['failure', 'resync', 'delivery'],
    true,
  );

  const insights = buildInsights({
    overview,
    serviceHealth,
    incidents,
  });
  const criticalInsights = insights.filter((item) => item.tone !== 'good');

  const refetchDashboard = () => {
    void monitoringQuery.refetch();
    void serviceHealthQuery.refetch();
    void totalUsersQuery.refetch();
    void activeUsersQuery.refetch();
    void pendingUsersQuery.refetch();
  };

  const hasOverviewData =
    Boolean(overview) ||
    Boolean(serviceHealth) ||
    incidents.length > 0 ||
    totalUsers > 0 ||
    activeUsers > 0 ||
    pendingUsers > 0;

  const metricCards: DashboardMetricView[] = [
    {
      id: 'admins',
      label: 'Admin đang hoạt động',
      value: formatNumber(activeUsers),
      changeLabel: formatPercent(adminActivationRate * 100, 0),
      trendCaption: 'trên tổng số tài khoản admin',
      tone: pendingUsers > 0 ? 'warning' : 'default',
      onClick: () => navigate('/users'),
      sparkline: [Math.max(activeUsers - 3, 0), Math.max(activeUsers - 1, 0), activeUsers],
    },
    {
      id: 'online',
      label: 'Người dùng trực tuyến',
      value: formatNumber(overview?.systemOverview.onlineUsers),
      changeLabel: formatDeltaLabel(trafficTrend.delta),
      trendDirection: trafficTrend.direction,
      trendCaption: 'so với đầu khung thời gian',
      tone: 'default',
      onClick: () => navigate('/monitoring'),
      sparkline: buildSparkline(overview?.realtimeHealth.connectionsTrend ?? [], ['connection']),
    },
    {
      id: 'services',
      label: 'Dịch vụ ổn định',
      value: `${servicesSummary?.up ?? 0}/${servicesTotal}`,
      changeLabel:
        healthyServiceRate === null ? 'Chưa có dữ liệu' : formatPercent(healthyServiceRate * 100, 0),
      trendCaption: 'độ phủ dịch vụ',
      tone:
        (servicesSummary?.down ?? 0) > 0
          ? 'danger'
          : (servicesSummary?.degraded ?? 0) > 0
            ? 'warning'
            : 'success',
      onClick: () => navigate('/services/health'),
      sparkline: [
        Math.max((servicesSummary?.up ?? 0) - 2, 0),
        Math.max((servicesSummary?.up ?? 0) - 1, 0),
        servicesSummary?.up ?? 0,
      ],
    },
    {
      id: 'failures',
      label: 'Lỗi gửi tin',
      value: formatRate(overview?.realtimeHealth.deliveryFailuresPerMinute, '/min'),
      changeLabel: formatDeltaLabel(reliabilityTrend.delta),
      trendDirection: reliabilityTrend.direction,
      trendCaption: 'áp lực lỗi',
      tone:
        (overview?.realtimeHealth.deliveryFailuresPerMinute ?? 0) > 0 ? 'danger' : 'success',
      onClick: () => navigate('/monitoring'),
      sparkline: buildSparkline(
        overview?.realtimeHealth.reliabilityTrend ?? [],
        ['failure', 'resync', 'delivery'],
      ),
    },
  ];

  return (
    <PageShell
      title="Bảng điều khiển"
      description="Ảnh chụp nhanh trạng thái hệ thống, vấn đề đang hoạt động và các bước xử lý tiếp theo."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <TimeRangePicker value={range} onChange={setRange} />
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<ReloadOutlined />}
              loading={
                monitoringQuery.isFetching ||
                serviceHealthQuery.isFetching
              }
              onClick={refetchDashboard}
            >
              Làm mới
            </Button>
            {overview?.generatedAt ? (
              <span className="ds-page-toolbar-meta">
                Đồng bộ gần nhất: {formatDateTime(overview.generatedAt)}
              </span>
            ) : null}
          </div>
        </div>
      }
    >
      {!hasOverviewData ? (
        <SurfaceCard
          eyebrow="Bảng điều khiển"
          title="Chưa có dữ liệu vận hành"
          description="Khung giao diện đã sẵn sàng nhưng dashboard chưa nhận được lô telemetry đầu tiên."
        >
          <EmptyState
            title="Chưa có dữ liệu"
            description="Hãy chờ đợt làm mới tiếp theo hoặc kiểm tra endpoint monitoring và service health đã được bật."
            action={<Button onClick={refetchDashboard}>Làm mới dashboard</Button>}
          />
        </SurfaceCard>
      ) : (
        <div className="ds-dashboard-layout ds-dashboard-layout--snapshot">
          <div className="ds-dashboard-span-8">
            <DashboardHero
              eyebrow="Trạng thái hệ thống"
              title={
                heroTone === 'healthy'
                  ? 'Hệ thống đang ổn định'
                  : heroTone === 'degraded'
                    ? 'Một số tín hiệu cần chú ý'
                    : 'Cần xử lý ngay'
              }
              description={
                heroTone === 'healthy'
                  ? 'Hệ thống đang phục vụ bình thường. Chỉ mở giám sát khi cần chẩn đoán sâu hơn.'
                  : heroTone === 'degraded'
                    ? 'Ít nhất một phụ thuộc, luồng dữ liệu hoặc cửa sổ freshness đang nằm ngoài ngưỡng mong đợi.'
                    : 'Sự cố dịch vụ, incident đang hoạt động hoặc tín hiệu gần quá tải đang ảnh hưởng vận hành.'
              }
              tone={heroTone}
              status={
                <StatusBadge
                  status={
                    heroTone === 'critical'
                      ? 'down'
                      : heroTone === 'degraded'
                        ? 'degraded'
                        : 'healthy'
                  }
                />
              }
              secondaryStatus={
                overview ? (
                  <StatusBadge
                    status={riskStateToStatus(overview.capacityBaseline.currentRiskState)}
                  />
                ) : null
              }
              stats={[
                { label: 'Sự cố đang hoạt động', value: formatNumber(incidents.length) },
                {
                  label: 'Độ mới telemetry',
                  value: overview ? getFreshnessLabel(overview.freshness).toUpperCase() : 'KHÔNG XÁC ĐỊNH',
                },
                {
                  label: 'Sender ACK p95',
                  value: formatMs(overview?.systemOverview.senderAckP95Ms),
                },
              ]}
              primaryActionLabel="Mở giám sát"
              onPrimaryAction={() => navigate('/monitoring')}
              secondaryActionLabel="Sức khỏe dịch vụ"
              onSecondaryAction={() => navigate('/services/health')}
            />
          </div>

          <div className="ds-dashboard-span-4">
            <DashboardQuickActions
              onCreateUser={() => navigate('/users')}
              onSendBroadcast={() => navigate('/services/email-templates')}
              onCreateGroup={() => navigate('/users')}
            />
          </div>

          {metricCards.map((metric) => (
            <div key={metric.id} className="ds-dashboard-span-3">
              <MetricCard
                label={metric.label}
                value={metric.value}
                changeLabel={metric.changeLabel}
                trendDirection={metric.trendDirection}
                trendCaption={metric.trendCaption}
                tone={metric.tone}
                onClick={metric.onClick}
                sparkline={metric.sparkline}
              />
            </div>
          ))}

          <div className="ds-dashboard-span-12">
            {criticalInsights.length > 0 ? (
              <IncidentBanner
                title={criticalInsights[0].title}
                description={criticalInsights[0].description}
                tone={criticalInsights[0].tone === 'critical' ? 'danger' : 'warning'}
                status={
                  <div className="ds-page-toolbar-group">
                    <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                    <StatusBadge
                      status={
                        (servicesSummary?.down ?? 0) > 0
                          ? 'down'
                          : (servicesSummary?.degraded ?? 0) > 0
                            ? 'degraded'
                            : 'healthy'
                      }
                    />
                  </div>
                }
                actions={
                  <Button type="primary" onClick={() => navigate(criticalInsights[0].ctaTo)}>
                    {criticalInsights[0].ctaLabel}
                  </Button>
                }
              >
                {criticalInsights.length > 1 ? (
                  <div className="monitoring-warning-group-list">
                    {criticalInsights.slice(1).map((item) => (
                      <div key={item.id} className="monitoring-warning-group-item">
                        <span>{item.title}</span>
                        <strong>{item.tone === 'critical' ? 'Leo thang' : 'Xem lại'}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </IncidentBanner>
            ) : (
              <DashboardInsightPanel insights={insights} />
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
};
