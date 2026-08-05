import { Button, Drawer } from 'antd';
import type { FC } from 'react';
import { useState } from 'react';

import { AppIcon } from '@/components/AppIcon/AppIcon';

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
  const [expanded, setExpanded] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  if (freshness === 'live' && warnings.length === 0 && prometheusStatus !== 'unavailable') {
    return null;
  }

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

  const affected = warnings.length > 0 ? `${warnings.length} nhóm chỉ số bị ảnh hưởng` : 'Một số chỉ số bị ảnh hưởng';
  return <>
    <section className="ds-monitoring-source-banner" role="status">
      <AppIcon name={freshness === 'unavailable' ? 'alertCircle' : 'warning'} size={18} aria-hidden />
      <div className="ds-monitoring-source-banner-copy"><strong>Nguồn monitoring cần chú ý</strong><span>{affected} · {getMessage()}</span>{expanded ? <small>{warnings.map((warning) => warning.suggestedAction ?? warning.message).join(' · ')}</small> : null}</div>
      <div className="ds-monitoring-source-banner-actions">
        <Button type="link" size="small" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Thu gọn' : 'Chi tiết'}</Button>
        <Button type="link" size="small" onClick={() => setDiagnosticsOpen(true)}>Chẩn đoán nguồn</Button>
      </div>
    </section>
    <Drawer title="Chẩn đoán nguồn monitoring" open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)}>
      <p>Freshness hiện tại: <strong>{freshness}</strong></p>
      <p>Prometheus: <strong>{prometheusStatus ?? 'chưa có dữ liệu'}</strong></p>
      <p>Loki: <strong>{lokiStatus ?? 'chưa cấu hình'}</strong></p>
      {warnings.length > 0 ? <ul>{warnings.map((warning) => <li key={warning.key}><strong>{warning.source}</strong>: {warning.message}{warning.suggestedAction ? ` — ${warning.suggestedAction}` : ''}</li>)}</ul> : <p>Không có warning chi tiết từ backend.</p>}
    </Drawer>
  </>;
};
