import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

export interface AnalyticsChartSeries {
  name: string;
  data: Array<number | null>;
  type?: 'line' | 'bar';
  color?: string;
  smooth?: boolean;
  areaOpacity?: number;
}

interface AnalyticsChartProps {
  categories: string[];
  series: AnalyticsChartSeries[];
  height?: number;
  legend?: boolean;
  xAxisFormatter?: (value: string) => string;
  yAxisFormatter?: (value: number) => string;
  tooltipValueFormatter?: (value: number | null) => string;
}

const defaultXAxisFormatter = (value: string) => {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('HH:mm') : value;
};

export const AnalyticsChart = ({
  categories,
  series,
  height = 320,
  legend = true,
  xAxisFormatter = defaultXAxisFormatter,
  yAxisFormatter,
  tooltipValueFormatter = (value) => (value === null ? '-' : `${value}`),
}: AnalyticsChartProps) => {
  const option = {
    animationDuration: 280,
    color: series.map((entry) => entry.color).filter(Boolean),
    grid: {
      left: 10,
      right: 12,
      top: 18,
      bottom: legend ? 42 : 16,
      containLabel: true,
    },
    legend: legend
      ? {
          type: 'scroll',
          bottom: 0,
          icon: 'roundRect',
          itemHeight: 8,
          textStyle: {
            color: 'var(--text-muted)',
          },
        }
      : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: {
        color: '#f8fafc',
      },
      valueFormatter: (value: number | string | null) =>
        typeof value === 'number' || value === null ? tooltipValueFormatter(value) : `${value}`,
    },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: series.some((entry) => entry.type === 'bar'),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.24)' } },
      axisLabel: {
        color: 'var(--text-muted)',
        formatter: (value: string) => xAxisFormatter(value),
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'var(--text-muted)',
        formatter: (value: number) => (yAxisFormatter ? yAxisFormatter(value) : `${value}`),
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(148, 163, 184, 0.14)',
        },
      },
    },
    series: series.map((entry, index) => ({
      name: entry.name,
      type: entry.type ?? 'line',
      smooth: entry.type === 'bar' ? false : entry.smooth ?? true,
      showSymbol: false,
      barMaxWidth: entry.type === 'bar' ? 24 : undefined,
      lineStyle: entry.type === 'bar' ? undefined : { width: 2.5 },
      itemStyle: entry.color ? { color: entry.color } : undefined,
      areaStyle:
        entry.type === 'bar'
          ? undefined
          : {
              opacity: entry.areaOpacity ?? (index === 0 ? 0.12 : 0.06),
            },
      emphasis: {
        focus: 'series',
      },
      data: entry.data,
    })),
  };

  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />;
};
