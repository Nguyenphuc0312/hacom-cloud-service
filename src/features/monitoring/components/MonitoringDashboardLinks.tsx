import { Button, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { MonitoringOverviewResponse } from '@/api/types';
import { WidgetCard } from '@/components/WidgetCard';

const { Text } = Typography;

interface MonitoringDashboardLinksProps {
  overview: MonitoringOverviewResponse;
}

export const MonitoringDashboardLinks = ({ overview }: MonitoringDashboardLinksProps) => {
  const navigate = useNavigate();

  return (
    <WidgetCard
      title="Liên kết đi sâu"
      actions={
        <Button type="link" onClick={() => navigate(overview.links.serviceHealth)}>
          Sức khỏe dịch vụ
        </Button>
      }
    >
      <div className="monitoring-dashboard-links">
        {overview.links.realtime ? (
          <Button href={overview.links.realtime} target="_blank" rel="noreferrer">
            Dashboard realtime
          </Button>
        ) : null}
        {overview.links.correctness ? (
          <Button href={overview.links.correctness} target="_blank" rel="noreferrer">
            Dashboard độ đúng
          </Button>
        ) : null}
        {overview.links.redis ? (
          <Button href={overview.links.redis} target="_blank" rel="noreferrer">
            Dashboard Redis
          </Button>
        ) : null}
        {overview.links.server ? (
          <Button href={overview.links.server} target="_blank" rel="noreferrer">
            Dashboard máy chủ
          </Button>
        ) : null}
        {overview.links.capacityBaseline ? (
          <Button href={overview.links.capacityBaseline} target="_blank" rel="noreferrer">
            Tải so với baseline
          </Button>
        ) : null}
      </div>
      <Text type="secondary">
        Trang này chủ đích giữ gọn và có quan điểm. Chỉ mở Grafana khi cần trace sâu hơn,
        timeline dài hơn hoặc chi tiết ở mức exporter.
      </Text>
    </WidgetCard>
  );
};
