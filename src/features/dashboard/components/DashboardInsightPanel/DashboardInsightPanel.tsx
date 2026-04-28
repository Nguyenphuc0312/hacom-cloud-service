import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';

import { AppIcon } from '@/components/AppIcon/AppIcon';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import type { DashboardInsight } from '../../utils/dashboardView/dashboardView';

interface DashboardInsightPanelProps {
  insights: DashboardInsight[];
}

export const DashboardInsightPanel = ({ insights }: DashboardInsightPanelProps) => {
  const navigate = useNavigate();

  return (
    <SurfaceCard
      eyebrow="Nhận định"
      title="Điểm cần chú ý"
      description="Mô tả ngắn giúp dashboard phục vụ hành động thay vì chỉ để trang trí."
      className="ds-dashboard-insight-panel"
    >
      {insights.length === 0 ? (
        <EmptyState compact title="Chưa có nhận định" description="Tín hiệu sẽ xuất hiện sau chu kỳ làm mới đầu tiên." />
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
                {insight.ctaLabel} <AppIcon name="arrowRight" size={14} />
              </Button>
            </article>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
};
