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
      title="Drill-down Links"
      actions={
        <Button type="link" onClick={() => navigate(overview.links.serviceHealth)}>
          Service health
        </Button>
      }
    >
      <div className="monitoring-dashboard-links">
        {overview.links.realtime ? (
          <Button href={overview.links.realtime} target="_blank" rel="noreferrer">
            Realtime dashboard
          </Button>
        ) : null}
        {overview.links.correctness ? (
          <Button href={overview.links.correctness} target="_blank" rel="noreferrer">
            Correctness dashboard
          </Button>
        ) : null}
        {overview.links.redis ? (
          <Button href={overview.links.redis} target="_blank" rel="noreferrer">
            Redis dashboard
          </Button>
        ) : null}
        {overview.links.server ? (
          <Button href={overview.links.server} target="_blank" rel="noreferrer">
            Server dashboard
          </Button>
        ) : null}
        {overview.links.capacityBaseline ? (
          <Button href={overview.links.capacityBaseline} target="_blank" rel="noreferrer">
            Load vs baseline
          </Button>
        ) : null}
      </div>
      <Text type="secondary">
        This page stays opinionated and compact. Use Grafana only when you need deeper traces,
        longer timelines, or exporter-level detail.
      </Text>
    </WidgetCard>
  );
};
