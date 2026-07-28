import { useQuery } from '@tanstack/react-query';
import { Descriptions, Empty, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import type { OnlineUser } from '@/api/clients/realtimeClient/realtimeClient';
import { sessionsClient } from '@/api/clients/sessionsClient/sessionsClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { UserDevice, UserSession } from '@/api/types/sessions/sessions';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { DetailDrawer } from '@/components/DetailDrawer/DetailDrawer';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';

import './OnlineUserDetailDrawer.css';

const { Text } = Typography;

const DEVICE_PAGE_SIZE = 10;

interface OnlineUserDetailDrawerProps {
  user: OnlineUser | null;
  onClose: () => void;
}

const deviceColumns: ColumnsType<UserDevice> = [
  {
    title: 'Thiết bị',
    dataIndex: 'deviceName',
    render: (name: string | null, record) => (
      <div className="online-user-device-cell">
        <Text strong>{name || 'Không đặt tên'}</Text>
        {record.platform && <Tag color="blue">{record.platform}</Tag>}
      </div>
    ),
  },
  {
    title: 'Hoạt động cuối',
    dataIndex: 'lastActiveAt',
    width: 170,
    render: (value: string | null) => (value ? <DateTimeCell value={value} /> : '-'),
  },
];

const sessionColumns: ColumnsType<UserSession> = [
  {
    title: 'Phiên',
    dataIndex: 'deviceName',
    render: (name: string | null, record) => (
      <div className="online-user-device-cell">
        <Text strong>{name || record.devicePlatform || 'Không rõ thiết bị'}</Text>
        {record.ipAddress && <Text type="secondary">{record.ipAddress}</Text>}
      </div>
    ),
  },
  {
    title: 'Trạng thái',
    dataIndex: 'isRevoked',
    width: 110,
    render: (isRevoked: boolean) => <StatusBadge status={isRevoked ? 'revoked' : 'active'} />,
  },
  {
    title: 'Dùng lần cuối',
    dataIndex: 'lastUsedAt',
    width: 170,
    render: (value: string | null) => (value ? <DateTimeCell value={value} /> : '-'),
  },
];

/**
 * Presence tells us a user is connected and how many live websocket sessions
 * they hold; it carries no device identity. Device and login-session details
 * are owned by chat-auth-service and fetched here on demand, per user.
 */
export const OnlineUserDetailDrawer: React.FC<OnlineUserDetailDrawerProps> = ({
  user,
  onClose,
}) => {
  const userId = user?.userId ?? '';
  const queryParams = { page: 1, limit: DEVICE_PAGE_SIZE };

  const devicesQuery = useQuery({
    queryKey: queryKeys.userDevices(userId, queryParams),
    queryFn: () => sessionsClient.listDevicesByUserId(userId, queryParams),
    enabled: Boolean(userId),
  });

  const sessionsQuery = useQuery({
    queryKey: queryKeys.userSessions(userId, queryParams),
    queryFn: () => sessionsClient.listByUserId(userId, queryParams),
    enabled: Boolean(userId),
  });

  return (
    <DetailDrawer
      open={Boolean(user)}
      onClose={onClose}
      title={user ? `Chi tiết: ${user.displayName}` : 'Chi tiết người dùng'}
      width={620}
    >
      {user && (
        <div className="online-user-detail">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Trạng thái">
              <StatusBadge status={user.presenceState} />
            </Descriptions.Item>
            <Descriptions.Item label="Phiên kết nối">
              {user.connectionCount} kết nối WebSocket đang mở
            </Descriptions.Item>
            <Descriptions.Item label="Mã nhân sự">{user.employeeCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="Phòng ban">{user.department || '-'}</Descriptions.Item>
            <Descriptions.Item label="Hoạt động cuối">
              {user.lastSeenAt ? <DateTimeCell value={user.lastSeenAt} /> : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="User ID">
              <Text copyable>{user.userId}</Text>
            </Descriptions.Item>
          </Descriptions>

          <section className="online-user-detail-section">
            <Text strong>Thiết bị đã đăng ký</Text>
            <Text type="secondary" className="online-user-detail-hint">
              Nguồn: chat-auth-service. Đây là thiết bị đã đăng ký của tài khoản, không phải
              thiết bị của phiên WebSocket đang mở.
            </Text>
            {devicesQuery.isError ? (
              <QueryStateView
                kind="error"
                title="Không tải được thiết bị"
                description="Dữ liệu thiết bị tạm thời không khả dụng."
                onRetry={() => void devicesQuery.refetch()}
              />
            ) : (
              <Table
                rowKey="id"
                size="small"
                columns={deviceColumns}
                dataSource={devicesQuery.data?.items}
                loading={devicesQuery.isLoading}
                pagination={false}
                locale={{
                  emptyText: <Empty description="Chưa có thiết bị đăng ký" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                }}
              />
            )}
          </section>

          <section className="online-user-detail-section">
            <Text strong>Phiên đăng nhập</Text>
            {sessionsQuery.isError ? (
              <QueryStateView
                kind="error"
                title="Không tải được phiên đăng nhập"
                description="Dữ liệu phiên tạm thời không khả dụng."
                onRetry={() => void sessionsQuery.refetch()}
              />
            ) : (
              <Table
                rowKey="id"
                size="small"
                columns={sessionColumns}
                dataSource={sessionsQuery.data?.items}
                loading={sessionsQuery.isLoading}
                pagination={false}
                locale={{
                  emptyText: <Empty description="Không có phiên đăng nhập" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                }}
              />
            )}
          </section>
        </div>
      )}
    </DetailDrawer>
  );
};
