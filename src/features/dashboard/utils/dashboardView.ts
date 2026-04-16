import type {
  Incident,
  MonitoringOverviewResponse,
  MonitoringSeries,
  MonitoringWarning,
  ServiceHealthItem,
  ServiceHealthResponse,
} from '@/api/types';
import { formatDateTime } from '@/utils/date';

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
    return 'No baseline';
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
          ? 'Realtime telemetry is current'
          : overview.freshness === 'partial'
            ? 'Realtime feeds are partially delayed'
            : 'Realtime telemetry is stale',
      description: `Snapshot generated at ${formatDateTime(overview.generatedAt)} with ${overview.warnings.length} active warning signals.`,
      tone:
        overview.freshness === 'live'
          ? 'good'
          : overview.freshness === 'partial'
            ? 'warning'
            : 'critical',
      ctaLabel: 'Open monitoring',
      ctaTo: '/monitoring',
    });

    const riskState = overview.capacityBaseline.currentRiskState;
    insights.push({
      id: 'capacity',
      title:
        riskState === 'near-breaking'
          ? 'Capacity headroom is tightening'
          : riskState === 'warning'
            ? 'Load is approaching the measured baseline'
            : 'Capacity is within a safe operating window',
      description:
        riskState === 'pending'
          ? 'Baseline measurement has not been completed yet, so risk scoring is conservative.'
          : `Current baseline evaluation is ${riskState}. Refresh cadence: ${formatDateTime(overview.generatedAt)}.`,
      tone:
        riskState === 'near-breaking'
          ? 'critical'
          : riskState === 'warning' || riskState === 'pending'
            ? 'warning'
            : 'good',
      ctaLabel: 'Open monitoring',
      ctaTo: '/monitoring',
    });
  }

  if (serviceHealth) {
    insights.push({
      id: 'services',
      title:
        serviceHealth.summary.down > 0
          ? `${serviceHealth.summary.down} services need immediate attention`
          : serviceHealth.summary.degraded > 0
            ? `${serviceHealth.summary.degraded} services are degraded`
            : 'All tracked services are healthy',
      description: `Service health snapshot checked at ${formatDateTime(serviceHealth.checkedAt)}.`,
      tone:
        serviceHealth.summary.down > 0
          ? 'critical'
          : serviceHealth.summary.degraded > 0
            ? 'warning'
            : 'good',
      ctaLabel: 'View health console',
      ctaTo: '/services/health',
    });
  }

  insights.push({
    id: 'incidents',
    title:
      incidents.length > 0
        ? `${incidents.length} active incidents are still firing`
        : 'No active incidents in the current window',
    description:
      incidents.length > 0
        ? incidents[0]?.summary || incidents[0]?.title || 'Investigate the incident feed for the latest details.'
        : 'The incident channel is quiet. Keep monitoring for regressions.',
    tone: incidents.length > 0 ? 'critical' : 'good',
    ctaLabel: incidents.length > 0 ? 'Review incidents' : 'Open audit logs',
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
    title: `${service.name} is down`,
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
    summary: `${warning.source} reported ${warning.code}.`,
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
    title: `${service.name} is ${service.status}`,
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
  description: `${warning.source} reported ${warning.code}.`,
  timestamp,
  route: '/monitoring',
  highlight: warning.severity === 'error',
});

const toIncidentActivity = (incident: Incident): DashboardActivityItem => ({
  id: `incident-${incident.fingerprint}`,
  type: 'incident',
  title: incident.title,
  description: incident.summary || 'No incident summary provided.',
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
