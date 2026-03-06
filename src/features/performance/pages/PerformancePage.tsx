import { useQuery } from '@tanstack/react-query';
import { Card, Col, Input, Row, Select, Space, Switch, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

import { metricsClient, statusClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { MetricTemplate, TimeRange } from '@/api/types';
import { useCurrentUser } from '@/app/useCurrentUser';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { formatDateTime } from '@/utils/date';
import { formatMs, formatPercent } from '@/utils/formatters';
import { hasMinimumRole } from '@/utils/role';

const { Text } = Typography;

const metricTemplateOptions: { label: string; value: MetricTemplate }[] = [
  { label: 'latency_p95', value: 'latency_p95' },
  { label: 'error_rate', value: 'error_rate' },
  { label: 'ws_connections', value: 'ws_connections' },
  { label: 'msgs_per_sec', value: 'msgs_per_sec' },
  { label: 'redis_memory', value: 'redis_memory' },
  { label: 'db_connections', value: 'db_connections' },
];

const stepByRange: Record<TimeRange, string> = {
  '15m': '15s',
  '1h': '1m',
  '6h': '5m',
  '24h': '15m',
};

const buildOption = (name: string, points: { timestamp: string; value: number | null }[]) => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 32, right: 16, top: 20, bottom: 28 },
  xAxis: {
    type: 'category',
    data: points.map((point) => formatDateTime(point.timestamp)),
    boundaryGap: false,
  },
  yAxis: {
    type: 'value',
  },
  series: [
    {
      name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: points.map((point) => point.value),
      areaStyle: { opacity: 0.07 },
    },
  ],
});

export const PerformancePage = () => {
  const { user } = useCurrentUser();
  const isSuperAdmin = hasMinimumRole(user?.role, 'superadmin');

  const [range, setRange] = useState<TimeRange>('1h');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [template, setTemplate] = useState<MetricTemplate>('latency_p95');
  const [advancedEnabled, setAdvancedEnabled] = useState(false);
  const [advancedQuery, setAdvancedQuery] = useState('');

  const servicesQuery = useQuery({
    queryKey: queryKeys.services('all'),
    queryFn: () => statusClient.getServices(),
  });

  const finalQuery = advancedEnabled && advancedQuery.trim().length ? advancedQuery : template;

  const seriesQuery = useQuery({
    queryKey: queryKeys.metricSeries(finalQuery, range, stepByRange[range], selectedService),
    queryFn: () =>
      metricsClient.getTimeseries({
        query: finalQuery,
        range,
        step: stepByRange[range],
        service: selectedService === 'all' ? undefined : selectedService,
      }),
  });

  const sloQuery = useQuery({
    queryKey: queryKeys.slo(range),
    queryFn: () => metricsClient.getSlo(range),
  });

  const serviceOptions = useMemo(
    () => [
      { label: 'All services', value: 'all' },
      ...((servicesQuery.data?.items ?? []).map((item) => ({ label: item.name, value: item.name })) as {
        label: string;
        value: string;
      }[]),
    ],
    [servicesQuery.data?.items],
  );

  if (servicesQuery.isLoading || seriesQuery.isLoading || sloQuery.isLoading) {
    return <LoadingState tip="Đang tải dữ liệu performance..." />;
  }

  if (servicesQuery.isError || seriesQuery.isError || sloQuery.isError) {
    return <ErrorState subTitle="Không thể tải dữ liệu performance." />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Performance & Metrics" description="Phân tích timeseries theo service và template" />

      <Card>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Text type="secondary">Time range</Text>
            <div style={{ marginTop: 8 }}>
              <TimeRangePicker value={range} onChange={setRange} />
            </div>
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Service</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={selectedService}
              options={serviceOptions}
              onChange={setSelectedService}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Metric template</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={template}
              options={metricTemplateOptions}
              onChange={(value) => setTemplate(value as MetricTemplate)}
              disabled={advancedEnabled}
            />
          </Col>
        </Row>

        {isSuperAdmin ? (
          <div style={{ marginTop: 16 }}>
            <Space>
              <Switch checked={advancedEnabled} onChange={setAdvancedEnabled} />
              <Text>PromQL advanced</Text>
            </Space>
            {advancedEnabled ? (
              <Input.TextArea
                rows={3}
                style={{ marginTop: 8 }}
                placeholder="Ví dụ: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))"
                value={advancedQuery}
                onChange={(event) => setAdvancedQuery(event.target.value)}
              />
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card title="Timeseries">
        {seriesQuery.data?.points?.length ? (
          <ReactECharts
            option={buildOption(finalQuery, seriesQuery.data.points)}
            style={{ height: 360 }}
          />
        ) : (
          <EmptyState description="Không có điểm dữ liệu cho bộ lọc hiện tại" />
        )}
      </Card>

      <Card title="SLO Status">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <StatusBadge status={sloQuery.data?.status ?? 'unknown'} mode="badge" />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">p95</Text>
            <div>{formatMs(sloQuery.data?.p95Ms)}</div>
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Error %</Text>
            <div>{formatPercent(sloQuery.data?.errorPercent)}</div>
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Uptime %</Text>
            <div>{formatPercent(sloQuery.data?.uptimePercent)}</div>
          </Col>
        </Row>
      </Card>
    </Space>
  );
};
