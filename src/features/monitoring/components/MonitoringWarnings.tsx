import { Button } from 'antd';
import type { MonitoringOverviewResponse } from '@/api/types';
import { StatusBadge } from '@/components/StatusBadge';
import { IncidentBanner } from '@/components/ui/IncidentBanner';
import { availabilityToStatus, getFreshnessLabel, summarizeWarnings } from '../monitoringView';

interface MonitoringWarningsProps {
  overview: MonitoringOverviewResponse;
}

const formatAvailabilityLabel = (status: string) => {
  if (status === 'available') return 'Khả dụng';
  if (status === 'partial') return 'Một phần';
  return 'Không khả dụng';
};

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
      ? 'Pipeline giám sát không khả dụng'
      : overview.freshness === 'partial'
        ? 'Tổng quan giám sát đang suy giảm'
        : 'Tổng quan giám sát đang có cảnh báo hoạt động';
  const description =
    overview.sources.prometheus.status === 'unavailable'
      ? overview.sources.prometheus.message
      : summarizeWarnings(overview.warnings);

  return (
    <IncidentBanner
      title={showHealthBanner ? title : 'Baseline dung lượng chưa được cấu hình'}
      description={
        showHealthBanner
          ? description
          : 'Tải hiện tại vẫn nhìn thấy được, nhưng phân loại rủi ro sẽ chưa đầy đủ cho tới khi baseline đo đạc được xuất ra.'
      }
      tone={showHealthBanner ? tone : 'info'}
      status={
        <div className="ds-page-toolbar-group">
          <StatusBadge
            status={
              overview.freshness === 'live'
                ? 'live'
                : overview.freshness === 'partial'
                  ? 'degraded'
                  : 'unavailable'
            }
          />
          <StatusBadge status={availabilityToStatus(overview.sources.prometheus.status)} />
          <StatusBadge status={availabilityToStatus(overview.sources.serviceHealth.status)} />
        </div>
      }
      actions={
        overview.links.realtime ? (
            <Button type="link" href={overview.links.realtime} target="_blank" rel="noreferrer">
            Mở dashboard thời gian thực
          </Button>
        ) : null
      }
    >
      <div className="monitoring-source-grid">
        <div className="monitoring-source-pill">
          <span>Độ mới</span>
          <strong>{getFreshnessLabel(overview.freshness)}</strong>
        </div>
        <div className="monitoring-source-pill">
          <span>Prometheus</span>
          <strong>{formatAvailabilityLabel(overview.sources.prometheus.status)}</strong>
        </div>
        <div className="monitoring-source-pill">
          <span>Sức khỏe dịch vụ</span>
          <strong>{formatAvailabilityLabel(overview.sources.serviceHealth.status)}</strong>
        </div>
      </div>
      {warningGroups.length > 0 ? (
        <div className="monitoring-warning-group-list">
          {warningGroups.map((item) => (
            <div key={item.label} className="monitoring-warning-group-item">
              <span>{item.label}</span>
              <strong>{item.count > 1 ? `${item.count} tín hiệu` : '1 tín hiệu'}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {showBaselineBanner ? (
        <div className="monitoring-warning-note">
          Baseline dung lượng chưa được cấu hình. Vẫn có thể xem tải hiện tại, nhưng không nên coi
          nhãn rủi ro là ngưỡng đã được hiệu chuẩn.
        </div>
      ) : null}
    </IncidentBanner>
  );
};
