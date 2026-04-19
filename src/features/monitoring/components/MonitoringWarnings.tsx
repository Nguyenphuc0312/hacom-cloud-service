import { Button } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types';
import { StatusBadge } from '@/components/StatusBadge';
import { IncidentBanner } from '@/components/ui/IncidentBanner';
import { getFreshnessLabel, summarizeWarnings } from '../monitoringView';

interface MonitoringWarningsProps {
  overview: MonitoringOverviewResponse;
}

const groupWarnings = (overview: MonitoringOverviewResponse) => {
  const grouped = new Map<string, { label: string; count: number }>();

  for (const warning of overview.warnings) {
    const key = `${warning.source}:${warning.code}`;
    grouped.set(key, {
      label: `${warning.source.replace('_', ' ')} / ${warning.code.replaceAll('_', ' ')}`,
      count: (grouped.get(key)?.count ?? 0) + 1,
    });
  }

  return Array.from(grouped.values()).slice(0, 5);
};

export const MonitoringWarnings = ({ overview }: MonitoringWarningsProps) => {
  const showHealthBanner =
    overview.freshness !== 'live' ||
    overview.warnings.length > 0 ||
    overview.sources.prometheus.status !== 'available' ||
    overview.sources.serviceHealth.status !== 'available';
  const showBaselineBanner = overview.capacityBaseline.status !== 'configured';

  if (!showHealthBanner && !showBaselineBanner) {
    return null;
  }

  const warningGroups = groupWarnings(overview);
  const tone = overview.freshness === 'unavailable' ? 'danger' : 'warning';
  const title =
    overview.freshness === 'unavailable'
      ? 'Monitoring pipeline is unavailable'
      : overview.freshness === 'partial'
        ? 'Monitoring overview is degraded'
        : 'Monitoring overview has active warnings';
  const description =
    overview.sources.prometheus.status === 'unavailable'
      ? overview.sources.prometheus.message
      : summarizeWarnings(overview.warnings);

  return (
    <IncidentBanner
      title={showHealthBanner ? title : 'Capacity baseline is not configured'}
      description={
        showHealthBanner
          ? description
          : 'Current load is visible, but risk classification stays incomplete until a measured baseline is exported.'
      }
      tone={showHealthBanner ? tone : 'info'}
      status={
        <div className="ds-page-toolbar-group">
          <StatusBadge status={getFreshnessLabel(overview.freshness)} />
          <StatusBadge status={overview.sources.prometheus.status} />
          <StatusBadge status={overview.sources.serviceHealth.status} />
        </div>
      }
      actions={
        overview.links.realtime ? (
          <Button type="link" href={overview.links.realtime} target="_blank" rel="noreferrer">
            Open realtime dashboard
          </Button>
        ) : null
      }
    >
      <div className="monitoring-source-grid">
        <div className="monitoring-source-pill">
          <span>Freshness</span>
          <strong>{overview.freshness.toUpperCase()}</strong>
        </div>
        <div className="monitoring-source-pill">
          <span>Prometheus</span>
          <strong>{overview.sources.prometheus.status.toUpperCase()}</strong>
        </div>
        <div className="monitoring-source-pill">
          <span>Service health</span>
          <strong>{overview.sources.serviceHealth.status.toUpperCase()}</strong>
        </div>
      </div>
      {warningGroups.length > 0 ? (
        <div className="monitoring-warning-group-list">
          {warningGroups.map((item) => (
            <div key={item.label} className="monitoring-warning-group-item">
              <span>{item.label}</span>
              <strong>{item.count > 1 ? `${item.count} signals` : '1 signal'}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {showBaselineBanner ? (
        <div className="monitoring-warning-note">
          Capacity baseline is not configured yet. Keep the current load visible, but do not treat
          risk labels as calibrated thresholds.
        </div>
      ) : null}
    </IncidentBanner>
  );
};
