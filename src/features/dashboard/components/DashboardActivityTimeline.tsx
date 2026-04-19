import { useEffect, useMemo, useState } from 'react';
import { Button, Skeleton, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatDateTime } from '@/utils/date';
import type { DashboardActivityItem, DashboardActivityType } from '../utils/dashboardView';

type TimelineFilter = 'all' | DashboardActivityType;

interface DashboardActivityTimelineProps {
  items: DashboardActivityItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

const FILTERS: Array<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'incident', label: 'Incidents' },
  { id: 'service', label: 'Services' },
  { id: 'warning', label: 'Warnings' },
];

export const DashboardActivityTimeline = ({
  items,
  loading = false,
  error = false,
  onRetry,
}: DashboardActivityTimelineProps) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  const filteredItems = useMemo(
    () => items.filter((item) => filter === 'all' || item.type === filter),
    [filter, items],
  );

  useEffect(() => {
    setActiveId((currentId) =>
      filteredItems.some((item) => item.id === currentId)
        ? currentId
        : filteredItems[0]?.id ?? null,
    );
  }, [filteredItems]);

  const activeItem =
    filteredItems.find((item) => item.id === activeId) ?? filteredItems[0] ?? null;

  return (
    <SurfaceCard
      eyebrow="Activity"
      title="Recent operational timeline"
      description="Keep the latest incidents, degradations, and warnings in one drill-down surface."
      className="ds-dashboard-activity-card"
      status={
        <div className="ds-dashboard-segmented">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={filter === entry.id ? 'is-active' : undefined}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} title={{ width: '42%' }} />
      ) : error ? (
        <ErrorState compact onRetry={onRetry} />
      ) : filteredItems.length === 0 ? (
        <EmptyState compact title="No matching events" description="Try another activity filter." />
      ) : (
        <div className="ds-dashboard-activity-layout">
          <div className="ds-dashboard-activity-list">
            {filteredItems.map((item) => (
              <Tooltip
                key={item.id}
                placement="left"
                title={`${item.description} - ${formatDateTime(item.timestamp)}`}
              >
                <button
                  type="button"
                  className={`ds-dashboard-activity-item ${item.highlight ? 'is-highlight' : ''} ${activeItem?.id === item.id ? 'is-active' : ''}`}
                  onClick={() => navigate(item.route)}
                  onMouseEnter={() => setActiveId(item.id)}
                >
                  <span className="ds-dashboard-activity-dot" />
                  <span className="ds-dashboard-activity-copy">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                  <time>{formatDateTime(item.timestamp)}</time>
                </button>
              </Tooltip>
            ))}
          </div>

          {activeItem ? (
            <div className="ds-dashboard-activity-detail">
              <span className={`ds-dashboard-activity-type type-${activeItem.type}`}>
                {activeItem.type}
              </span>
              <strong>{activeItem.title}</strong>
              <p>{activeItem.description}</p>
              <time>{formatDateTime(activeItem.timestamp)}</time>
              <Button onClick={() => navigate(activeItem.route)}>View detail</Button>
            </div>
          ) : null}
        </div>
      )}
    </SurfaceCard>
  );
};
