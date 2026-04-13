import { Alert, Space, Typography } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/utils/date';
import { getFreshnessLabel, summarizeWarnings } from '../monitoringView';

const { Text } = Typography;

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

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {showHealthBanner ? (
        <Alert
          type={overview.freshness === 'unavailable' ? 'error' : 'warning'}
          showIcon
          message={
            overview.freshness === 'unavailable'
              ? 'Monitoring pipeline is unavailable'
              : overview.freshness === 'partial'
                ? 'Monitoring overview is degraded'
                : 'Monitoring overview has active warnings'
          }
          description={
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text type="secondary">
                {overview.sources.prometheus.status === 'unavailable'
                  ? overview.sources.prometheus.message
                  : summarizeWarnings(overview.warnings)}
              </Text>
              <div className="monitoring-source-grid">
                <div className="monitoring-source-pill">
                  <span>Freshness</span>
                  <StatusBadge status={getFreshnessLabel(overview.freshness)} />
                </div>
                <div className="monitoring-source-pill">
                  <span>Prometheus</span>
                  <StatusBadge status={overview.sources.prometheus.status} />
                </div>
                <div className="monitoring-source-pill">
                  <span>Service health</span>
                  <StatusBadge status={overview.sources.serviceHealth.status} />
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
            </Space>
          }
        />
      ) : null}

      {showBaselineBanner ? (
        <Alert
          type="info"
          showIcon
          message="Capacity baseline is not configured yet"
          description={
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Text type="secondary">
                Current load is still visible, but the panel cannot classify it against tested
                comfortable, warning, and near-breaking zones until a measured baseline is exported.
              </Text>
              <Text type="secondary">
                Baseline generated at:{' '}
                {overview.capacityBaseline.generatedAt
                  ? formatDateTime(overview.capacityBaseline.generatedAt)
                  : 'Pending'}
              </Text>
            </Space>
          }
        />
      ) : null}
    </Space>
  );
};
