import { ArrowRightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import type { DashboardInsight } from '../utils/dashboardView';

interface DashboardInsightPanelProps {
  insights: DashboardInsight[];
}

export const DashboardInsightPanel = ({ insights }: DashboardInsightPanelProps) => {
  const navigate = useNavigate();

  return (
    <SurfaceCard
      eyebrow="Insights"
      title="What needs attention"
      description="Short explanations keep the dashboard actionable instead of decorative."
      className="ds-dashboard-insight-panel"
    >
      {insights.length === 0 ? (
        <EmptyState compact title="No insights yet" description="Signals will appear after the first refresh cycle." />
      ) : (
        <div className="ds-dashboard-insight-list">
          {insights.map((insight) => (
            <article key={insight.id} className={`ds-dashboard-insight tone-${insight.tone}`}>
              <span className="ds-dashboard-insight-tone">{insight.tone}</span>
              <div className="ds-dashboard-insight-copy">
                <strong>{insight.title}</strong>
                <p>{insight.description}</p>
              </div>
              <Button type="link" onClick={() => navigate(insight.ctaTo)}>
                {insight.ctaLabel} <ArrowRightOutlined />
              </Button>
            </article>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
};
