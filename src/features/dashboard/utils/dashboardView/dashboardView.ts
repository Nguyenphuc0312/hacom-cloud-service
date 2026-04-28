import type { Incident } from '@/api/types/alerts/alerts';
import type { MonitoringOverviewResponse, MonitoringSeries, MonitoringWarning } from '@/api/types/monitoring/monitoring';
import type { ServiceHealthItem, ServiceHealthResponse } from '@/api/types/service-health/service-health';
import { formatDateTime } from '@/utils/date/date';

export type DashboardInsightTone = 'good' | 'warning' | 'critical';
export type DashboardActivityType = 'incident' | 'service' | 'warning';
export type DashboardTrendDirection = 'up' | 'down' | 'neutral';

export interface DashboardInsight {
  id: string;
  title: string;
  description: string;
  tone: DashboardInsightTone;
  ctaLabel: string;
  ctaTo: string;
}

export interface DashboardActivityItem {
  id: string;
  type: DashboardActivityType;
  title: string;
  description: string;
  timestamp: string;
  route: string;
  highlight?: boolean;
}

const matchSeries = (series: MonitoringSeries[], keywords: string[]): MonitoringSeries | null => {
  const normalizedKeywords = keywords.map((entry) => entry.toLowerCase());

  return (
    series.find((entry) =>
      normalizedKeywords.some((keyword) => entry.label.toLowerCase().includes(keyword)),
    ) ??
    series.find((entry) => entry.points.some((point) => point.value !== null)) ??
    null
  );
};

const extractEdgeValues = (series: MonitoringSeries | null) => {
  if (!series) {
    return { first: null, last: null };
  }

  const values = series.points.map((point) => point.value).filter((value): value is number => value !== null);
  return {
    first: values[0] ?? null,
    last: values.at(-1) ?? null,
  };
};

export const calculatePercentDelta = (first: number | null, last: number | null): number | null => {
  if (first === null || last === null) {
    return null;
  }

  if (first === 0) {
    return last === 0 ? 0 : null;
  }

  return ((last - first) / Math.abs(first)) * 100;
};

export const formatDeltaLabel = (delta: number | null): string => {
  if (delta === null || Number.isNaN(delta)) {
    return 'Chưa có baseline';
  }

  const prefix = delta > 0 ? '+' : '';
  return `${prefix}${delta.toFixed(Math.abs(delta) >= 10 ? 0 : 1)}%`;
};

export const summarizeTrend = (
  series: MonitoringSeries[],
  keywords: string[],
  lowerIsBetter = false,
): { delta: number | null; direction: DashboardTrendDirection } => {
  const targetSeries = matchSeries(series, keywords);
  const { first, last } = extractEdgeValues(targetSeries);
  const delta = calculatePercentDelta(first, last);

  if (delta === null || delta === 0) {
    return { delta, direction: 'neutral' };
  }

  if (lowerIsBetter) {
    return { delta, direction: delta < 0 ? 'down' : 'up' };
  }

  return { delta, direction: delta > 0 ? 'up' : 'down' };
};

export const pickPrimarySeries = (series: MonitoringSeries[], limit = 3): MonitoringSeries[] =>
  series.filter((entry) => entry.points.some((point) => point.value !== null)).slice(0, limit);

export const buildSparkline = (
  series: MonitoringSeries[],
  keywords: string[],
  limit = 10,
): Array<number | null> => {
  const matchedSeries = matchSeries(series, keywords);

  if (!matchedSeries) {
    return [];
  }

  return matchedSeries.points.slice(-limit).map((point) => point.value);
};

export const buildInsights = ({
  overview,
  serviceHealth,
  incidents,
}: {
  overview: MonitoringOverviewResponse | undefined;
  serviceHealth: ServiceHealthResponse | undefined;
  incidents: Incident[];
}): DashboardInsight[] => {
  const insights: DashboardInsight[] = [];

  if (overview) {
    insights.push({
      id: 'realtime',
      title:
        overview.freshness === 'live'
          ? 'Telemetry thời gian thực đang mới'
          : overview.freshness === 'partial'
            ? 'Luồng thời gian thực đang bị chậm một phần'
            : 'Telemetry thời gian thực đã cũ',
      description: `Ảnh chụp được tạo lúc ${formatDateTime(overview.generatedAt)} với ${overview.warnings.length} tín hiệu cảnh báo đang hoạt động.`,
      tone:
        overview.freshness === 'live'
          ? 'good'
          : overview.freshness === 'partial'
            ? 'warning'
            : 'critical',
      ctaLabel: 'Mở giám sát',
      ctaTo: '/monitoring',
    });

    const riskState = overview.capacityBaseline.currentRiskState;
    insights.push({
      id: 'capacity',
      title:
        riskState === 'near-breaking'
          ? 'Biên dung lượng an toàn đang thu hẹp'
          : riskState === 'warning'
            ? 'Tải đang tiến gần baseline đã đo'
            : 'Dung lượng vẫn nằm trong vùng an toàn',
      description:
        riskState === 'pending'
          ? 'Đo baseline chưa hoàn tất, nên chấm điểm rủi ro đang được giữ ở mức thận trọng.'
          : `Đánh giá baseline hiện tại là ${riskState}. Nhịp làm mới: ${formatDateTime(overview.generatedAt)}.`,
      tone:
        riskState === 'near-breaking'
          ? 'critical'
          : riskState === 'warning' || riskState === 'pending'
            ? 'warning'
            : 'good',
      ctaLabel: 'Mở giám sát',
      ctaTo: '/monitoring',
    });
  }

  if (serviceHealth) {
    insights.push({
      id: 'services',
      title:
        serviceHealth.summary.down > 0
          ? `${serviceHealth.summary.down} dịch vụ cần xử lý ngay`
          : serviceHealth.summary.degraded > 0
            ? `${serviceHealth.summary.degraded} dịch vụ đang suy giảm`
            : 'Tất cả dịch vụ đang được theo dõi đều ổn định',
      description: `Ảnh chụp sức khỏe dịch vụ được kiểm tra lúc ${formatDateTime(serviceHealth.checkedAt)}.`,
      tone:
        serviceHealth.summary.down > 0
          ? 'critical'
          : serviceHealth.summary.degraded > 0
            ? 'warning'
            : 'good',
      ctaLabel: 'Mở console sức khỏe',
      ctaTo: '/services/health',
    });
  }

  insights.push({
    id: 'incidents',
    title:
      incidents.length > 0
        ? `${incidents.length} sự cố đang hoạt động vẫn còn báo động`
        : 'Không có sự cố hoạt động trong khung thời gian hiện tại',
    description:
      incidents.length > 0
        ? incidents[0]?.summary || incidents[0]?.title || 'Hãy mở luồng sự cố để xem chi tiết mới nhất.'
        : 'Kênh sự cố hiện yên tĩnh. Tiếp tục theo dõi để phát hiện hồi quy.',
    tone: incidents.length > 0 ? 'critical' : 'good',
    ctaLabel: incidents.length > 0 ? 'Xem sự cố' : 'Mở nhật ký kiểm toán',
    ctaTo: incidents.length > 0 ? '/services/health' : '/audit',
  });

  return insights.slice(0, 4);
};

const toServiceIncident = (service: ServiceHealthItem): Incident | null => {
  if (service.status !== 'down') {
    return null;
  }

  return {
    fingerprint: `service:${service.name}`,
    status: 'firing',
    severity: 'critical',
    title: `${service.name} đang ngừng hoạt động`,
    summary: service.summary,
    startsAt: service.checkedAt,
  };
};

const toWarningIncident = (
  warning: MonitoringWarning,
  timestamp: string,
): Incident | null => {
  if (warning.severity !== 'error') {
    return null;
  }

  return {
    fingerprint: `warning:${warning.key}`,
    status: 'firing',
    severity: 'critical',
    title: warning.message,
    summary: `${warning.source} báo ${warning.code}.`,
    startsAt: timestamp,
  };
};

export const deriveDashboardIncidents = ({
  overview,
  serviceHealth,
}: {
  overview: MonitoringOverviewResponse | undefined;
  serviceHealth: ServiceHealthResponse | undefined;
}): Incident[] => {
  const incidents = [
    ...(serviceHealth?.items
      .map(toServiceIncident)
      .filter((item): item is Incident => item !== null) ?? []),
    ...(overview?.warnings
      .map((warning) => toWarningIncident(warning, overview.generatedAt))
      .filter((item): item is Incident => item !== null) ?? []),
  ];

  return incidents.sort(
    (left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime(),
  );
};

const toServiceActivity = (service: ServiceHealthItem): DashboardActivityItem | null => {
  if (service.status === 'up' || service.status === 'unknown') {
    return null;
  }

  return {
    id: `service-${service.name}`,
    type: 'service',
    title: `${service.name} đang ở trạng thái ${service.status}`,
    description: service.summary,
    timestamp: service.checkedAt,
    route: `/services/health?service=${encodeURIComponent(service.name)}`,
    highlight: service.status === 'down',
  };
};

const toWarningActivity = (
  warning: MonitoringWarning,
  timestamp: string,
): DashboardActivityItem => ({
  id: `warning-${warning.key}`,
  type: 'warning',
  title: warning.message,
  description: `${warning.source} báo ${warning.code}.`,
  timestamp,
  route: '/monitoring',
  highlight: warning.severity === 'error',
});

const toIncidentActivity = (incident: Incident): DashboardActivityItem => ({
  id: `incident-${incident.fingerprint}`,
  type: 'incident',
  title: incident.title,
  description: incident.summary || 'Không có tóm tắt sự cố.',
  timestamp: incident.startsAt,
  route: '/services/health',
  highlight: incident.status === 'firing',
});

export const buildActivityTimeline = ({
  overview,
  serviceHealth,
  incidents,
}: {
  overview: MonitoringOverviewResponse | undefined;
  serviceHealth: ServiceHealthResponse | undefined;
  incidents: Incident[];
}): DashboardActivityItem[] =>
  [
    ...incidents.map(toIncidentActivity),
    ...(serviceHealth?.items.map(toServiceActivity).filter((item): item is DashboardActivityItem => item !== null) ??
      []),
    ...(overview?.warnings.slice(0, 4).map((warning) => toWarningActivity(warning, overview.generatedAt)) ??
      []),
  ]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 12);
