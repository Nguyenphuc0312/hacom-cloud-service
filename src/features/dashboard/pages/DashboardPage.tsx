import { useQueries, useQuery } from '@tanstack/react-query';
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  WarningFilled,
} from '@ant-design/icons';
import { Alert, Button, Col, List, Row, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

import { serviceHealthClient, usersClient } from '@/api/clients';
import { alertsClient } from '@/api/clients/alertsClient';
import { queryKeys } from '@/api/queryKeys';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { StatCard } from '@/components/StatCard';
import { WidgetCard } from '@/components/WidgetCard';
import { ActivityListCard } from '@/components/ActivityListCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/utils/date';
import { formatMs } from '@/utils/formatters';

const { Text } = Typography;
type OverallTone = 'healthy' | 'degraded' | 'down';

export const DashboardPage = () => {
  const navigate = useNavigate();
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
  const serviceItems = services?.items ?? [];
  const downServices = services?.summary.down ?? 0;
  const degradedServices = services?.summary.degraded ?? 0;
  const firingIncidents = incidentsQuery.data?.items ?? [];

  const overallTone: OverallTone =
    downServices > 0
      ? 'down'
      : degradedServices > 0 || firingIncidents.length > 0 || serviceHealthQuery.isError
        ? 'degraded'
        : 'healthy';

  const overallConfig = {
    healthy: {
      title: 'Healthy',
      subtitle: 'Tất cả service phụ thuộc đang ổn định và không có incident đang firing.',
      icon: <CheckCircleFilled />,
    },
    degraded: {
      title: 'Degraded',
      subtitle: 'Một phần hệ thống cần theo dõi thêm. Ưu tiên kiểm tra service và incidents.',
      icon: <ExclamationCircleFilled />,
    },
    down: {
      title: 'Down',
      subtitle: 'Có service đang down. Cần xử lý ngay để tránh ảnh hưởng nghiệp vụ admin.',
      icon: <CloseCircleFilled />,
    },
  }[overallTone];

  const dependencyList = [...serviceItems].sort((left, right) => {
    const weight = (status: string): number => {
      if (status === 'down') return 0;
      if (status === 'degraded') return 1;
      if (status === 'up') return 2;
      return 3;
    };
    return weight(left.status) - weight(right.status);
  });

  return (
    <PageShell
      title="Dashboard"
      description="Control center cho vận hành admin: status hệ thống, users overview và tín hiệu incident"
      headerExtra={
        hasServiceHealth ? (
          <Text type="secondary">Last checked: {formatDateTime(services!.checkedAt)}</Text>
        ) : null
      }
    >
      <WidgetCard
        className={`dashboard-hero dashboard-hero--${overallTone}`}
        title={
          <Space size={8} align="center">
            <span className="dashboard-hero-icon">{overallConfig.icon}</span>
            <span>{overallConfig.title}</span>
          </Space>
        }
        actions={
          <Button type="default" onClick={() => navigate('/services/health')}>
            Open services console <ArrowRightOutlined />
          </Button>
        }
      >
        <div className="dashboard-hero-body">
          <Text className="dashboard-hero-eyebrow">System Status</Text>
          <Text className="dashboard-hero-subtitle">{overallConfig.subtitle}</Text>
          <Space size={8} wrap className="dashboard-hero-badges">
            <StatusBadge status={overallTone === 'down' ? 'down' : overallTone} />
            <StatusBadge status={serviceHealthQuery.isError ? 'warning' : 'healthy'} />
            <StatusBadge status={firingIncidents.length > 0 ? 'firing' : 'resolved'} />
          </Space>
        </div>
        <div className="dashboard-hero-metrics">
          <div className="dashboard-hero-metric">
            <Text type="secondary">Down services</Text>
            <strong>{downServices}</strong>
          </div>
          <div className="dashboard-hero-metric">
            <Text type="secondary">Degraded services</Text>
            <strong>{degradedServices}</strong>
          </div>
          <div className="dashboard-hero-metric">
            <Text type="secondary">Active incidents</Text>
            <strong>{firingIncidents.length}</strong>
          </div>
        </div>
      </WidgetCard>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total users"
            value={totalUsers}
            icon={<UserOutlined />}
            meta={
              totalUsersQuery.isError ? (
                <span style={{ color: 'var(--state-error)' }}>!</span>
              ) : null
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Active users"
            value={activeUsers}
            icon={<CheckCircleFilled style={{ color: 'var(--state-success)' }} />}
            meta={
              activeUsersQuery.isError ? (
                <span style={{ color: 'var(--state-error)' }}>!</span>
              ) : null
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Locked users"
            value={lockedUsers}
            icon={<CloseCircleFilled style={{ color: 'var(--state-error)' }} />}
            meta={
              lockedUsersQuery.isError ? (
                <span style={{ color: 'var(--state-error)' }}>!</span>
              ) : null
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Pending verification"
            value={pendingVerificationUsers}
            icon={<ExclamationCircleFilled style={{ color: 'var(--state-warning)' }} />}
            meta={
              pendingUsersQuery.isError ? (
                <span style={{ color: 'var(--state-error)' }}>!</span>
              ) : null
            }
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <WidgetCard
            title="Service dependency"
            actions={
              <Button type="link" onClick={() => navigate('/services/health')}>
                Health details
              </Button>
            }
          >
            {serviceHealthQuery.isError ? (
              <QueryStateView
                kind="degraded"
                compact
                title="Service health chưa khả dụng"
                description="Không thể đồng bộ trạng thái phụ thuộc từ admin-service."
                onRetry={() => {
                  void serviceHealthQuery.refetch();
                }}
              />
            ) : hasServiceHealth && dependencyList.length > 0 ? (
              <List
                dataSource={dependencyList}
                renderItem={(service) => (
                  <List.Item className="dashboard-service-item">
                    <button
                      type="button"
                      className="dashboard-service-button"
                      onClick={() =>
                        navigate(`/services/health?service=${encodeURIComponent(service.name)}`)
                      }
                    >
                      <span className="dashboard-service-main">
                        <Text strong>{service.name}</Text>
                        <Text type="secondary">{service.summary || 'No summary'}</Text>
                      </span>
                      <span className="dashboard-service-meta">
                        <StatusBadge status={service.status} />
                        <Text type="secondary">{formatMs(service.latencyMs)}</Text>
                      </span>
                    </button>
                  </List.Item>
                )}
              />
            ) : (
              <QueryStateView kind="empty" description="Chưa có dữ liệu service health." />
            )}
          </WidgetCard>
        </Col>
        <Col xs={24} lg={12}>
          <ActivityListCard
            title="Recent incidents"
            actions={null}
            items={
              incidentsQuery.isLoading && !incidentsQuery.data
                ? []
                : incidentsQuery.isError
                  ? []
                  : firingIncidents.slice(0, 6).map((incident) => ({
                      icon: <StatusBadge status={incident.status} />,
                      content: <Text strong>{incident.title}</Text>,
                      meta: <Text type="secondary">{formatDateTime(incident.startsAt)}</Text>,
                    }))
            }
          />
          {incidentsQuery.isLoading && !incidentsQuery.data ? (
            <QueryStateView kind="loading" compact />
          ) : incidentsQuery.isError ? (
            <Alert
              type="warning"
              showIcon
              message="Incident feed unavailable"
              description="Tạm thời chưa tải được nguồn incident. Hãy thử lại sau."
            />
          ) : firingIncidents.length === 0 ? (
            <Alert
              type="success"
              showIcon
              message="No active incidents"
              description="Hiện tại không có alert đang firing."
            />
          ) : null}
        </Col>
      </Row>
    </PageShell>
  );
};
