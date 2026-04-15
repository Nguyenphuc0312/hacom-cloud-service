import { ReloadOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import type { AnalyticsChartSeries } from './AnalyticsChart';

const LazyAnalyticsChart = lazy(() =>
  import('./AnalyticsChart').then((module) => ({ default: module.AnalyticsChart })),
);

type ChartState = 'ready' | 'loading' | 'empty' | 'error' | 'permission';

interface ChartWrapperProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  state?: ChartState;
  stateTitle?: string;
  stateDescription?: string;
  onRetry?: () => void;
  categories: string[];
  series: AnalyticsChartSeries[];
  height?: number;
  legend?: boolean;
  xAxisFormatter?: (value: string) => string;
  yAxisFormatter?: (value: number) => string;
  tooltipValueFormatter?: (value: number | null) => string;
}

export const ChartWrapper = ({
  eyebrow,
  title,
  description,
  status,
  actions,
  state = 'ready',
  stateTitle,
  stateDescription,
  onRetry,
  categories,
  series,
  height = 320,
  legend = true,
  xAxisFormatter,
  yAxisFormatter,
  tooltipValueFormatter,
}: ChartWrapperProps) => {
  const renderState = () => {
    if (state === 'loading') {
      return <Skeleton active paragraph={{ rows: 8 }} title={{ width: '36%' }} />;
    }

    if (state === 'empty') {
      return <EmptyState title={stateTitle} description={stateDescription} compact />;
    }

    if (state === 'permission') {
      return (
        <EmptyState
          title={stateTitle ?? 'Restricted data'}
          description={
            stateDescription ?? 'Your current role does not have access to this dataset.'
          }
          compact
        />
      );
    }

    if (state === 'error') {
      return (
        <ErrorState
          title={stateTitle}
          description={stateDescription}
          compact
          onRetry={onRetry}
        />
      );
    }

    return (
      <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} title={{ width: '36%' }} />}>
        <LazyAnalyticsChart
          categories={categories}
          series={series}
          height={height}
          legend={legend}
          xAxisFormatter={xAxisFormatter}
          yAxisFormatter={yAxisFormatter}
          tooltipValueFormatter={tooltipValueFormatter}
        />
      </Suspense>
    );
  };

  return (
    <SurfaceCard
      eyebrow={eyebrow}
      title={title}
      description={description}
      status={status}
      actions={
        actions ??
        (onRetry ? (
          <Button icon={<ReloadOutlined />} onClick={onRetry}>
            Refresh
          </Button>
        ) : undefined)
      }
      className="ds-chart-wrapper"
    >
      {renderState()}
    </SurfaceCard>
  );
};
