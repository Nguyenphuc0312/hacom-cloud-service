import { Skeleton } from 'antd';
import type { ReactNode } from 'react';
import clsx from 'clsx';

import { AppIcon } from '@/components/AppIcon';

type MetricTrendDirection = 'up' | 'down' | 'neutral';
type MetricTone = 'default' | 'success' | 'warning' | 'danger';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  changeLabel: string;
  trendDirection?: MetricTrendDirection;
  trendCaption?: string;
  icon?: ReactNode;
  tone?: MetricTone;
  loading?: boolean;
  onClick?: () => void;
  sparkline?: Array<number | null>;
}

const buildSparklinePath = (values: Array<number | null>) => {
  const numericValues = values.filter((value): value is number => value !== null);

  if (numericValues.length < 2) {
    return null;
  }

  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const range = maxValue - minValue || 1;

  const points = values
    .map((value, index) => {
      if (value === null) {
        return null;
      }

      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((value - minValue) / range) * 100;

      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .filter((entry): entry is string => entry !== null);

  return points.length >= 2 ? points.join(' ') : null;
};

const trendIconByDirection: Record<MetricTrendDirection, ReactNode> = {
  up: <AppIcon name="arrowUp" size={14} />,
  down: <AppIcon name="arrowDown" size={14} />,
  neutral: <AppIcon name="minus" size={14} />,
};

export const MetricCard = ({
  label,
  value,
  changeLabel,
  trendDirection = 'neutral',
  trendCaption,
  icon,
  tone = 'default',
  loading = false,
  onClick,
  sparkline,
}: MetricCardProps) => {
  const sparklinePath = sparkline ? buildSparklinePath(sparkline) : null;
  const content = loading ? (
    <Skeleton active paragraph={{ rows: 2 }} title={{ width: '42%' }} />
  ) : (
    <>
      <div className="ds-metric-card-topline">
        <div className="ds-metric-card-label-group">
          <span className="ds-metric-card-label">{label}</span>
          <strong className="ds-metric-card-value">{value}</strong>
        </div>
        {icon ? <span className="ds-metric-card-icon">{icon}</span> : null}
      </div>
      <div className="ds-metric-card-footer">
        <span
          className={clsx(
            'ds-metric-card-change',
            trendDirection !== 'neutral' && `trend-${trendDirection}`,
          )}
        >
          {trendIconByDirection[trendDirection]}
          {changeLabel}
        </span>
        {trendCaption ? <span className="ds-metric-card-caption">{trendCaption}</span> : null}
        {sparklinePath ? (
          <span className="ds-metric-card-sparkline" aria-hidden="true">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={sparklinePath} />
            </svg>
          </span>
        ) : null}
        {onClick ? <AppIcon name="arrowRight" size={14} className="ds-metric-card-arrow" /> : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={clsx('ds-metric-card', `tone-${tone}`, 'is-clickable')}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <div className={clsx('ds-metric-card', `tone-${tone}`)}>{content}</div>;
};
