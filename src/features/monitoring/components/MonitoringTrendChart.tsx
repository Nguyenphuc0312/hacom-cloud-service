import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

import type { MonitoringAvailability, MonitoringSeries } from '@/api/types';
import { QueryStateView } from '@/components/QueryStates';
import { useTheme } from '@/theme/theme-context';

interface MonitoringTrendChartProps {
  series: MonitoringSeries[];
  availability?: MonitoringAvailability;
  height?: number;
  formatter?: (value: number | null) => string;
}

export const MonitoringTrendChart = ({
  series,
  availability = 'available',
  height = 260,
  formatter = (value) => (value === null ? '-' : `${value}`),
}: MonitoringTrendChartProps) => {
  const { tokens } = useTheme();
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
    color: tokens.chartPalette,
    grid: {
      left: 24,
      right: 16,
      top: 18,
      bottom: 28,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.chart.tooltipBackground,
      textStyle: {
        color: tokens.chart.tooltipText,
      },
      valueFormatter: (value: number | string) =>
        typeof value === 'number' ? formatter(value) : `${value}`,
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: {
        color: tokens.semantic.textTertiary,
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timeline.map((point) => point.timestamp),
      axisLine: {
        lineStyle: {
          color: tokens.chart.grid,
        },
      },
      axisLabel: {
        color: tokens.semantic.textTertiary,
        formatter: (value: string) => dayjs(value).format('HH:mm'),
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: tokens.semantic.textTertiary,
      },
      splitLine: {
        lineStyle: {
          color: tokens.chart.grid,
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
