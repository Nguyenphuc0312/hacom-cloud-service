import { useQueries } from '@tanstack/react-query';
import { Card, Col, Row, Space, Statistic, Typography } from 'antd';

import { serviceHealthClient, usersClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
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

  if (
    totalUsersQuery.isLoading ||
    activeUsersQuery.isLoading ||
    lockedUsersQuery.isLoading ||
    pendingUsersQuery.isLoading ||
    serviceHealthQuery.isLoading
  ) {
    return <LoadingState tip="Đang tải tổng quan vận hành..." />;
  }

  if (
    totalUsersQuery.isError ||
    activeUsersQuery.isError ||
    lockedUsersQuery.isError ||
    pendingUsersQuery.isError ||
    serviceHealthQuery.isError
  ) {
    return <ErrorState subTitle="Không thể tải dữ liệu dashboard." />;
  }

  const totalUsers = totalUsersQuery.data?.pagination.total ?? 0;
  const activeUsers = activeUsersQuery.data?.pagination.total ?? 0;
  const lockedUsers = lockedUsersQuery.data?.pagination.total ?? 0;
  const pendingVerificationUsers = pendingUsersQuery.data?.pagination.total ?? 0;
  const services = serviceHealthQuery.data;

  if (!services) {
    return <EmptyState description="Chưa có dữ liệu service health." />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Dashboard"
        description="Tổng quan vận hành MVP dựa trên dữ liệu thật từ admin-service"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Total users" value={totalUsers} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Active users" value={activeUsers} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Locked users" value={lockedUsers} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Pending verification" value={pendingVerificationUsers} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Service Health Summary">
            <Space direction="vertical" size={4}>
              <Text>Tổng services: {services.summary.total}</Text>
              <Text>UP: {services.summary.up}</Text>
              <Text>DOWN: {services.summary.down}</Text>
              <Text>DEGRADED: {services.summary.degraded}</Text>
              <Text type="secondary">Checked at: {formatDateTime(services.checkedAt)}</Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Sessions Summary">
            <Text>
              Backend Phase 1 chưa có endpoint tổng hợp active sessions toàn hệ thống. Panel giữ
              trạng thái tối giản để tránh hiển thị số liệu giả.
            </Text>
          </Card>
        </Col>
      </Row>
    </Space>
  );
};
