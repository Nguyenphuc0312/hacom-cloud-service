import { useQueries, useQuery } from '@tanstack/react-query';
import {
  Card,
  Col,
  Row,
  Statistic,
  Table,
  Typography,
  Button,
  Space,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

import { metricsClient, statusClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { RecentIncident, TimeRange, TimeseriesResponse } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatNumber, formatPercent } from '@/utils/formatters';

const { Text } = Typography;

const stepByRange: Record<TimeRange, string> = {
  '15m': '15s',
  '1h': '1m',
  '6h': '5m',
  '24h': '15m',
};

const buildLineChartOption = (seriesName: string, data: TimeseriesResponse) => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 36, right: 16, top: 28, bottom: 24 },
  xAxis: {
    type: 'category',
    data: data.points.map((point) => formatDateTime(point.timestamp)),
    boundaryGap: false,
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { type: 'dashed' } },
  },
  series: [
    {
      name: seriesName,
      data: data.points.map((point) => point.value),
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.08 },
      lineStyle: { width: 2 },
    },
  ],
});

export const DashboardPage = () => {
  const [range, setRange] = useState<TimeRange>('1h');
  const refetchInterval = Number(import.meta.env.VITE_DASHBOARD_REFETCH_INTERVAL_MS ?? 15000);

  const overviewQuery = useQuery({
    queryKey: queryKeys.overview(range),
    queryFn: statusClient.getOverview,
    refetchInterval,
  });

  const [latencyQuery, errorRateQuery, messageRateQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.metricSeries('latency_p95', range, stepByRange[range], ''),
        queryFn: () =>
          metricsClient.getTimeseries({
            query: 'latency_p95',
            range,
            step: stepByRange[range],
          }),
        refetchInterval,
      },
      {
        queryKey: queryKeys.metricSeries('error_rate', range, stepByRange[range], ''),
        queryFn: () =>
          metricsClient.getTimeseries({
            query: 'error_rate',
            range,
            step: stepByRange[range],
          }),
        refetchInterval,
      },
      {
        queryKey: queryKeys.metricSeries('msgs_per_sec', range, stepByRange[range], ''),
        queryFn: () =>
          metricsClient.getTimeseries({
            query: 'msgs_per_sec',
            range,
            step: stepByRange[range],
          }),
        refetchInterval,
      },
    ],
  });

  const incidentsColumns = useMemo<ColumnsType<RecentIncident>>(
    () => [
      {
        title: 'Fingerprint',
        dataIndex: 'fingerprint',
      },
      {
        title: 'Summary',
        dataIndex: 'summary',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        render: (status: string) => <StatusBadge status={status} />,
      },
      {
        title: 'Severity',
        dataIndex: 'severity',
        render: (severity?: string) => severity?.toUpperCase() ?? '-',
      },
      {
        title: 'Started At',
        dataIndex: 'startsAt',
        render: (value: string) => formatDateTime(value),
      },
    ],
    [],
  );

  const hasError =
    overviewQuery.isError || latencyQuery.isError || errorRateQuery.isError || messageRateQuery.isError;

  if (overviewQuery.isLoading) {
    return <LoadingState tip="Đang tải dashboard..." />;
  }

  if (hasError) {
    return (
      <ErrorState
        subTitle="Một hoặc nhiều nguồn dữ liệu dashboard đang lỗi."
        extra={<Button onClick={() => overviewQuery.refetch()}>Thử lại</Button>}
      />
    );
  }

  const overview = overviewQuery.data;

  if (!overview) {
    return <EmptyState description="Không có dữ liệu tổng quan." />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Overview Dashboard"
        description="Theo dõi realtime trạng thái dịch vụ và hiệu năng toàn hệ thống"
        extra={<TimeRangePicker value={range} onChange={setRange} />}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Services UP/DOWN/DEGRADED"
              value={`${overview.services.up}/${overview.services.down}/${overview.services.degraded}`}
              suffix={<Text type="secondary">total {overview.services.total}</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="WS Active Connections" value={formatNumber(overview.wsActiveConnections)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="Messages/s" value={formatNumber(overview.messagesPerSec)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="Error rate" value={formatPercent(overview.errorRatePercent)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="Latency p95" value={formatMs(overview.latencyP95Ms)} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="Latency p95">
            {latencyQuery.data?.points?.length ? (
              <ReactECharts option={buildLineChartOption('Latency p95', latencyQuery.data)} style={{ height: 280 }} />
            ) : (
              <EmptyState description="Không có dữ liệu latency" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Error rate">
            {errorRateQuery.data?.points?.length ? (
              <ReactECharts option={buildLineChartOption('Error Rate', errorRateQuery.data)} style={{ height: 280 }} />
            ) : (
              <EmptyState description="Không có dữ liệu error rate" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Messages/s">
            {messageRateQuery.data?.points?.length ? (
              <ReactECharts option={buildLineChartOption('Messages/s', messageRateQuery.data)} style={{ height: 280 }} />
            ) : (
              <EmptyState description="Không có dữ liệu messages/s" />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Recent Incidents (Top 10)">
        <Table
          rowKey="fingerprint"
          columns={incidentsColumns}
          dataSource={overview.recentIncidents.slice(0, 10)}
          pagination={false}
          locale={{ emptyText: <EmptyState description="Không có incident gần đây" /> }}
        />
      </Card>
    </Space>
  );
};
