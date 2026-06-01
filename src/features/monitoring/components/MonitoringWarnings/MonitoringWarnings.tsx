import { Button } from 'antd';
import type { MonitoringErrorType, MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { IncidentBanner } from '@/components/ui/IncidentBanner/IncidentBanner';
import { availabilityToStatus, getFreshnessLabel, summarizeWarnings } from '../../monitoringView/monitoringView';

interface MonitoringWarningsProps {
  overview: MonitoringOverviewResponse;
}

const formatAvailabilityLabel = (status: string) => {
  if (status === 'available') return 'Khả dụng';
  if (status === 'partial') return 'Một phần';
  return 'Không khả dụng';
};

/**
 * Get human-readable label for error type
 */
const getErrorTypeLabel = (errorType: MonitoringErrorType | undefined): string => {
  const labels: Record<string, string> = {
    'target_down': 'Target Down',
    'not_instrumented': 'Not Instrumented',
    'no_traffic_yet': 'No Traffic Yet',
    'query_mismatch': 'Query Mismatch',
    'no_sample_in_range': 'No Sample in Range',
    'prometheus_error': 'Prometheus Error',
    'unknown': 'Unknown Error',
  };
  return errorType ? labels[errorType] || errorType : 'Unknown';
};

/**
 * Group warnings by error type for better classification display
 */
const groupWarningsByErrorType = (warnings: MonitoringOverviewResponse['warnings']) => {
  const grouped = new Map<string, { label: string; count: number; items: typeof warnings }>();

  for (const warning of warnings) {
    const errorType = warning.errorType || 'unknown';
    const key = errorType;

    if (!grouped.has(key)) {
      grouped.set(key, {
        label: getErrorTypeLabel(errorType),
        count: 0,
        items: [],
      });
    }

    const group = grouped.get(key)!;
    group.count++;
    group.items.push(warning);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    // Sort by count descending, then by label
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
};

/**
 * Generate specific reasons for partial freshness
 */
const getPartialReasons = (overview: MonitoringOverviewResponse): string[] => {
  const reasons: string[] = [];

  // Group by error type
  const byErrorType = new Map<MonitoringErrorType | 'unknown', number>();
  for (const w of overview.warnings) {
    const type = w.errorType || 'unknown';
    byErrorType.set(type, (byErrorType.get(type) ?? 0) + 1);
  }

  // Generate specific messages based on error types present
  if (byErrorType.has('target_down')) {
    reasons.push(`${byErrorType.get('target_down')} Prometheus target(s) không hoạt động`);
  }
  if (byErrorType.has('not_instrumented')) {
    reasons.push(`${byErrorType.get('not_instrumented')} metric(s) chưa được instrument`);
  }
  if (byErrorType.has('no_traffic_yet')) {
    reasons.push(`${byErrorType.get('no_traffic_yet')} metric(s) chưa có traffic`);
  }
  if (byErrorType.has('query_mismatch')) {
    reasons.push(`${byErrorType.get('query_mismatch')} metric(s) có query mismatch`);
  }
  if (byErrorType.has('no_sample_in_range')) {
    reasons.push(`${byErrorType.get('no_sample_in_range')} metric(s) không có sample trong khoảng thời gian`);
  }

  return reasons;
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

  const warningGroups = groupWarningsByErrorType(overview.warnings);
  const tone = overview.freshness === 'unavailable' ? 'danger' : 'warning';
  const title =
    overview.freshness === 'unavailable'
      ? 'Pipeline giám sát không khả dụng'
      : overview.freshness === 'partial'
        ? 'Tổng quan giám sát đang suy giảm'
        : 'Tổng quan giám sát đang có cảnh báo hoạt động';

  // Generate partial reasons if freshness is partial
  const partialReasons = overview.freshness === 'partial' ? getPartialReasons(overview) : [];
  const baseDescription =
    overview.sources.prometheus.status === 'unavailable'
      ? overview.sources.prometheus.message
      : summarizeWarnings(overview.warnings);
  const description = partialReasons.length > 0
    ? `${baseDescription}\n\nNguyên nhân: ${partialReasons.join('; ')}.`
    : baseDescription;

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
          {overview.sources.loki && (
            <StatusBadge status={availabilityToStatus(overview.sources.loki.status)} />
          )}
          {overview.sources.grafana && (
            <StatusBadge
              status={overview.sources.grafana.isPubliclyAccessible ? 'available' : 'unavailable'}
              title="Grafana"
            />
          )}
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
        {overview.sources.loki && (
          <div className="monitoring-source-pill">
            <span>Loki</span>
            <strong>{formatAvailabilityLabel(overview.sources.loki.status)}</strong>
          </div>
        )}
        {overview.sources.grafana && (
          <div className="monitoring-source-pill">
            <span>Grafana</span>
            <strong>
              {overview.sources.grafana.isPubliclyAccessible ? 'Truy cập được' : 'Chỉ nội bộ'}
            </strong>
          </div>
        )}
      </div>
      {warningGroups.length > 0 ? (
        <div className="monitoring-warning-group-list">
          {warningGroups.slice(0, 5).map((item) => (
            <div key={item.label} className="monitoring-warning-group-item">
              <div>
                <strong>{item.label}</strong>
                <p>{item.items[0]?.suggestedAction || item.items[0]?.message}</p>
              </div>
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
