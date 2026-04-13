import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import type { MonitoringAvailability, MonitoringSeries } from '@/api/types';
import { QueryStateView } from '@/components/QueryStates';

interface MonitoringTrendChartProps {
  series: MonitoringSeries[];
  availability?: MonitoringAvailability;
  height?: number;
  formatter?: (value: number | null) => string;
}

const COLORS = ['#2563eb', '#0f766e', '#d97706', '#dc2626'];

export const MonitoringTrendChart = ({
  series,
  availability = 'available',
  height = 260,
  formatter = (value) => (value === null ? '-' : `${value}`),
}: MonitoringTrendChartProps) => {
  const timeline = series.find((entry) => entry.points.length > 0)?.points ?? [];
  const hasData = series.some((entry) => entry.points.some((point) => point.value !== null));

  if (!hasData || timeline.length === 0) {
    return (
      <QueryStateView
        kind={availability === 'unavailable' ? 'degraded' : 'empty'}
        description={
          availability === 'unavailable'
            ? 'Metric unavailable for the selected window.'
            : 'No metric data in the selected window.'
        }
      />
    );
  }

  const option = {
    color: COLORS,
    grid: {
      left: 24,
      right: 16,
      top: 18,
      bottom: 28,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number | string) =>
        typeof value === 'number' ? formatter(value) : `${value}`,
    },
    legend: {
      type: 'scroll',
      bottom: 0,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timeline.map((point) => point.timestamp),
      axisLabel: {
        formatter: (value: string) => dayjs(value).format('HH:mm'),
      },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          color: 'rgba(148, 163, 184, 0.16)',
        },
      },
    },
    series: series.map((entry, index) => ({
      name: entry.label,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: {
        width: 2,
      },
      areaStyle: {
        opacity: index === 0 ? 0.12 : 0.06,
      },
      data: entry.points.map((point) => point.value),
    })),
  };

  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />;
};
