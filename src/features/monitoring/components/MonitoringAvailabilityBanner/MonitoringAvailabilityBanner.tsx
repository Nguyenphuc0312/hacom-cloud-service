import { Alert } from 'antd';
import type { FC } from 'react';

import type { MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';

interface MonitoringAvailabilityBannerProps {
  freshness: MonitoringOverviewResponse['freshness'];
  warnings: MonitoringOverviewResponse['warnings'];
  prometheusStatus?: string;
  lokiStatus?: string;
}

export const MonitoringAvailabilityBanner: FC<MonitoringAvailabilityBannerProps> = ({
  freshness,
  warnings,
  prometheusStatus,
  lokiStatus,
}) => {
  if (freshness === 'live' && warnings.length === 0 && prometheusStatus !== 'unavailable') {
    return null;
  }

  const getBannerType = (): 'error' | 'warning' | 'info' => {
    if (freshness === 'unavailable' || prometheusStatus === 'unavailable') {
      return 'error';
    }
    return 'warning';
  };

  const getMessage = () => {
    const messages: string[] = [];

    if (freshness === 'unavailable') {
      messages.push(
        'Du lieu giam sat hien khong day du hoac da cu. Khong dung man nay de ket luan he thong dang healthy cho den khi nguon du lieu phuc hoi.',
      );
    }

    if (prometheusStatus === 'unavailable') {
      messages.push(
        'Nguon Prometheus khong kha dung. Cac chi so realtime/server/container co the khong chinh xac.',
      );
    }

    if (lokiStatus === 'unavailable') {
      messages.push(
        'Nguon log tap trung khong kha dung. Khong the tra cuu log tap trung tai thoi diem nay.',
      );
    }

    if (freshness === 'partial') {
      messages.push(
        'Du lieu giam sat co the khong day du. Mot so chi so co the khong chinh xac.',
      );
    }

    if (warnings.length > 0) {
      const criticalWarnings = warnings.filter(
        (w: MonitoringOverviewResponse['warnings'][number]) => w.severity === 'error',
      );
      if (criticalWarnings.length > 0) {
        messages.push(`${criticalWarnings.length} canh bao loi can xu ly.`);
      }
    }

    return messages.join(' ');
  };

  return (
    <Alert
      type={getBannerType()}
      message="Canh bao du lieu giam sat"
      description={getMessage()}
      banner
      showIcon
      closable={freshness !== 'unavailable' && prometheusStatus !== 'unavailable'}
      style={{ marginBottom: 16 }}
    />
  );
};
