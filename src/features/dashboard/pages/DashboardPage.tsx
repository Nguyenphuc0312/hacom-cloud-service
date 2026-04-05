import { useQueries, useQuery } from '@tanstack/react-query';
import { Card, Col, List, Row, Space, Tag, Typography } from 'antd';

import { serviceHealthClient, usersClient } from '@/api/clients';
import { alertsClient } from '@/api/clients/alertsClient';
import { queryKeys } from '@/api/queryKeys';
import { DataTableShell } from '@/components/DataTableShell';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { StatCard } from '@/components/StatCard';
import { formatDateTime } from '@/utils/date';

const { Text } = Typography;

export const DashboardPage = () => {
  const [
    totalUsersQuery,
    activeUsersQuery,
    lockedUsersQuery,
    pendingUsersQuery,
    serviceHealthQuery,
  ] = useQueries({
    queries: [
      {
        queryKey: queryKeys.usersList('dashboard-total-users'),
        queryFn: () => usersClient.list({ page: 1, limit: 1 }),
      },
      {
        queryKey: queryKeys.usersList('dashboard-active-users'),
        queryFn: () => usersClient.list({ page: 1, limit: 1, accountStatus: 'ACTIVE' }),
      },
      {
        queryKey: queryKeys.usersList('dashboard-locked-users'),
        queryFn: () => usersClient.list({ page: 1, limit: 1, accountStatus: 'DISABLED' }),
      },
      {
        queryKey: queryKeys.usersList('dashboard-pending-users'),
        queryFn: () =>
          usersClient.list({ page: 1, limit: 1, accountStatus: 'PENDING_VERIFICATION' }),
      },
      {
        queryKey: queryKeys.serviceHealth,
        queryFn: serviceHealthClient.getServiceHealth,
      },
    ],
  });

  const incidentsQuery = useQuery({
    queryKey: ['alerts-incidents-firing'],
    queryFn: () => alertsClient.getIncidents({ status: 'firing' }),
    retry: 0,
  });

  const isInitialLoading =
    !totalUsersQuery.data &&
    !activeUsersQuery.data &&
    !lockedUsersQuery.data &&
    !pendingUsersQuery.data &&
    !serviceHealthQuery.data &&
    (totalUsersQuery.isLoading ||
      activeUsersQuery.isLoading ||
      lockedUsersQuery.isLoading ||
      pendingUsersQuery.isLoading ||
      serviceHealthQuery.isLoading);

  if (isInitialLoading) {
    return (
      <PageShell
        title="Dashboard"
        description="Control center cho trạng thái vận hành admin feature và phụ thuộc chính"
      >
        <QueryStateView kind="loading" title="Đang tải tổng quan vận hành..." />
      </PageShell>
    );
  }

  const totalUsers = totalUsersQuery.data?.pagination.total ?? 0;
  const activeUsers = activeUsersQuery.data?.pagination.total ?? 0;
  const lockedUsers = lockedUsersQuery.data?.pagination.total ?? 0;
  const pendingVerificationUsers = pendingUsersQuery.data?.pagination.total ?? 0;
  const services = serviceHealthQuery.data;
  const hasServiceHealth = Boolean(services);
  const isServiceDegraded =
    !hasServiceHealth ||
    serviceHealthQuery.isError ||
    (services?.summary.degraded ?? 0) > 0 ||
    (services?.summary.down ?? 0) > 0;
  const firingIncidents = incidentsQuery.data?.items ?? [];

  const quickWarnings: string[] = [];
  if ((services?.summary.down ?? 0) > 0) {
    quickWarnings.push(`${services?.summary.down ?? 0} service(s) DOWN`);
  }

  if ((services?.summary.degraded ?? 0) > 0) {
    quickWarnings.push(`${services?.summary.degraded ?? 0} service(s) DEGRADED`);
  }

  if (firingIncidents.length > 0) {
    quickWarnings.push(`${firingIncidents.length} active incident(s)`);
  }

  return (
    <PageShell
      title="Dashboard"
      description="Control center cho trạng thái vận hành admin feature và phụ thuộc chính"
      headerExtra={
        hasServiceHealth ? (
          <Text type="secondary">Last checked: {formatDateTime(services!.checkedAt)}</Text>
        ) : null
      }
    >
      <DataTableShell
        title="Overall system health"
        meta="Ưu tiên hiển thị tín hiệu degraded, integration risk và data freshness"
      >
        <Space size={8} wrap>
          <Tag color={isServiceDegraded ? 'gold' : 'green'}>
            {isServiceDegraded ? 'DEGRADED' : 'HEALTHY'}
          </Tag>
          <Tag color={serviceHealthQuery.isError ? 'red' : 'blue'}>
            {serviceHealthQuery.isError ? 'Service health unavailable' : 'Service health connected'}
          </Tag>
          <Tag
            color={incidentsQuery.isError ? 'gold' : firingIncidents.length > 0 ? 'red' : 'green'}
          >
            {incidentsQuery.isError
              ? 'Incident feed unavailable'
              : firingIncidents.length > 0
                ? `${firingIncidents.length} incident(s)`
                : 'No active incidents'}
          </Tag>
        </Space>
        {quickWarnings.length > 0 ? (
          <List
            size="small"
            dataSource={quickWarnings}
            renderItem={(item) => <List.Item>{item}</List.Item>}
            style={{ marginTop: 12 }}
          />
        ) : (
          <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            Chưa có warning quan trọng ở mức toàn hệ thống.
          </Text>
        )}
      </DataTableShell>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total users"
            value={totalUsers}
            loading={!totalUsersQuery.data && totalUsersQuery.isLoading}
            error={totalUsersQuery.isError}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Active users"
            value={activeUsers}
            loading={!activeUsersQuery.data && activeUsersQuery.isLoading}
            error={activeUsersQuery.isError}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Locked users"
            value={lockedUsers}
            loading={!lockedUsersQuery.data && lockedUsersQuery.isLoading}
            error={lockedUsersQuery.isError}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Pending verification"
            value={pendingVerificationUsers}
            loading={!pendingUsersQuery.data && pendingUsersQuery.isLoading}
            error={pendingUsersQuery.isError}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Service dependency status">
            {serviceHealthQuery.isError ? (
              <QueryStateView
                kind="degraded"
                compact
                title="Service health chưa khả dụng"
                description="Không thể đồng bộ trạng thái phụ thuộc từ admin-service."
              />
            ) : hasServiceHealth ? (
              <Space direction="vertical" size={4}>
                <Text>Total services: {services!.summary.total}</Text>
                <Text>UP: {services!.summary.up}</Text>
                <Text>DOWN: {services!.summary.down}</Text>
                <Text>DEGRADED: {services!.summary.degraded}</Text>
                <Text type="secondary">Freshness: {formatDateTime(services!.checkedAt)}</Text>
              </Space>
            ) : (
              <QueryStateView kind="empty" description="Chưa có dữ liệu service health." />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Recent incidents">
            {incidentsQuery.isError ? (
              <QueryStateView
                kind="stale"
                compact
                title="Incident feed unavailable"
                description="Tạm thời chưa tải được nguồn incidents."
              />
            ) : firingIncidents.length === 0 ? (
              <QueryStateView
                kind="empty"
                compact
                description="Không có active incident cần xử lý ngay."
              />
            ) : (
              <List
                size="small"
                dataSource={firingIncidents.slice(0, 5)}
                renderItem={(incident) => (
                  <List.Item>
                    <Space direction="vertical" size={0}>
                      <Text strong>{incident.title}</Text>
                      <Text type="secondary">{formatDateTime(incident.startsAt)}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <DataTableShell
        title="Sessions readiness"
        meta="Placeholder an toàn cho data contract sẽ có ở phase tiếp theo"
      >
        <Text>
          Backend Phase 1 chưa có endpoint tổng hợp active sessions toàn hệ thống. Cấu trúc widget
          đã sẵn sàng để nối dữ liệu thật ở các phase tiếp theo.
        </Text>
      </DataTableShell>
    </PageShell>
  );
};
