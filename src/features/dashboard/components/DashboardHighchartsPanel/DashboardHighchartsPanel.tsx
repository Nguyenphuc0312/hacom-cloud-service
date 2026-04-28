import { Chart } from '@highcharts/react';
import type { HighchartsOptionsType } from '@highcharts/react';
import type BaseHighcharts from 'highcharts/esm/highcharts.src.js';
import Highcharts from 'highcharts/esm/highcharts-3d.js';

import type { MonitoringSeries } from '@/api/types/monitoring/monitoring';
import type { ServiceHealthSummary } from '@/api/types/service-health/service-health';

interface DashboardHighchartsPanelProps {
  type: 'health' | 'traffic';
  summary?: ServiceHealthSummary;
  series?: MonitoringSeries[];
}

const chartBase: HighchartsOptionsType = {
  chart: {
    backgroundColor: 'transparent',
    animation: true,
    style: {
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    },
  },
  credits: { enabled: false },
  legend: { enabled: false },
  title: { text: undefined },
  tooltip: {
    borderWidth: 0,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    style: { color: '#fff', fontSize: '12px' },
  },
};

const getHealthOptions = (summary?: ServiceHealthSummary): HighchartsOptionsType => {
  const total = Math.max(summary?.total ?? 0, 1);
  const up = summary?.up ?? 0;
  const degraded = summary?.degraded ?? 0;
  const down = summary?.down ?? 0;
  const unknown = Math.max(total - up - degraded - down, 0);

  return {
    ...chartBase,
    chart: {
      ...chartBase.chart,
      type: 'pie',
      height: 250,
      options3d: {
        enabled: true,
        alpha: 48,
        beta: 0,
        depth: 34,
        viewDistance: 22,
      },
    },
    plotOptions: {
      pie: {
        innerSize: '58%',
        depth: 34,
        borderWidth: 0,
        dataLabels: { enabled: false },
        showInLegend: false,
      },
    },
    series: [
      {
        type: 'pie',
        name: 'Dịch vụ',
        data: [
          { name: 'Khỏe', y: up, color: '#10b981' },
          { name: 'Suy giảm', y: degraded, color: '#f59e0b' },
          { name: 'Ngừng', y: down, color: '#ef4444' },
          { name: 'Không rõ', y: unknown, color: '#cbd5e1' },
        ].filter((point) => point.y > 0),
      },
    ],
  };
};

const getTrafficOptions = (series?: MonitoringSeries[]): HighchartsOptionsType => {
  const primary = series?.find((item) => item.points.length > 0) ?? series?.[0];
  const points =
    primary?.points
      .map((point, index) => [
        point.timestamp ? new Date(point.timestamp).getTime() : index,
        point.value,
      ])
      .filter((point): point is [number, number] => typeof point[1] === 'number') ?? [];
  const fallback = [
    [0, 2],
    [1, 1.6],
    [2, 2.2],
    [3, 4.1],
    [4, 5.3],
    [5, 4.4],
    [6, 3.4],
    [7, 2.7],
    [8, 3.2],
    [9, 6.4],
  ];

  return {
    ...chartBase,
    chart: {
      ...chartBase.chart,
      type: 'areaspline',
      height: 250,
      margin: [8, 6, 8, 6],
      options3d: {
        enabled: true,
        alpha: 6,
        beta: 0,
        depth: 18,
        viewDistance: 35,
      },
    },
    xAxis: {
      visible: false,
      type: primary ? 'datetime' : 'linear',
    },
    yAxis: {
      visible: false,
      min: 0,
      max: points.length > 0 && Math.max(...points.map((point) => point[1])) === 0 ? 1 : undefined,
      title: { text: undefined },
    },
    plotOptions: {
      areaspline: {
        lineWidth: 5,
        marker: { enabled: false },
        color: '#10b981',
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, 'rgba(16, 185, 129, 0.36)'],
            [1, 'rgba(16, 185, 129, 0.02)'],
          ],
        },
        states: {
          hover: { lineWidth: 5 },
        },
      },
    },
    series: [
      {
        type: 'areaspline',
        name: primary?.label ?? 'Kết nối realtime',
        data: points.length > 0 ? points : fallback,
      },
    ],
  };
};

export const DashboardHighchartsPanel = ({ type, summary, series }: DashboardHighchartsPanelProps) => {
  const options = type === 'health' ? getHealthOptions(summary) : getTrafficOptions(series);

  return (
    <Chart
      highcharts={Highcharts as unknown as typeof BaseHighcharts}
      options={options}
      containerProps={{
        className: `ds-figma-chart ds-figma-chart--${type}`,
      }}
    />
  );
};
