import { ArrowDownOutlined, ArrowRightOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import type { ReactNode } from 'react';
import clsx from 'clsx';

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
}

const trendIconByDirection: Record<MetricTrendDirection, ReactNode> = {
  up: <ArrowUpOutlined />,
  down: <ArrowDownOutlined />,
  neutral: <MinusOutlined />,
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
}: MetricCardProps) => {
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
        {onClick ? <ArrowRightOutlined className="ds-metric-card-arrow" /> : null}
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
