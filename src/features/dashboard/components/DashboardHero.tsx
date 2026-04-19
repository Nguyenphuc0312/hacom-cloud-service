import { ArrowRightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';
import clsx from 'clsx';

import { SurfaceCard } from '@/components/ui/SurfaceCard';

type DashboardHeroTone = 'healthy' | 'degraded' | 'critical';

interface DashboardHeroStat {
  label: string;
  value: ReactNode;
}

interface DashboardHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  tone: DashboardHeroTone;
  status?: ReactNode;
  secondaryStatus?: ReactNode;
  stats: DashboardHeroStat[];
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export const DashboardHero = ({
  eyebrow,
  title,
  description,
  tone,
  status,
  secondaryStatus,
  stats,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: DashboardHeroProps) => (
  <SurfaceCard
    eyebrow={eyebrow}
    title={title}
    description={description}
    className={clsx('ds-dashboard-hero', `tone-${tone}`)}
    actions={
      <div className="ds-dashboard-hero-actions">
        <Button type="primary" onClick={onPrimaryAction}>
          {primaryActionLabel} <ArrowRightOutlined />
        </Button>
        {secondaryActionLabel && onSecondaryAction ? (
          <Button onClick={onSecondaryAction}>{secondaryActionLabel}</Button>
        ) : null}
      </div>
    }
    status={
      <div className="ds-dashboard-hero-status">
        {status}
        {secondaryStatus}
      </div>
    }
  >
    <div className="ds-dashboard-hero-stats">
      {stats.map((stat) => (
        <div key={stat.label} className="ds-dashboard-hero-stat">
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      ))}
    </div>
  </SurfaceCard>
);
