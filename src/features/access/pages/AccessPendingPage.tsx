import { Alert, Button, Card, Descriptions, Space, Typography, message } from 'antd';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { accessClient } from '@/api/clients';
import { useAccessStatus } from '@/app/useAccessStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuthStore } from '@/store/authStore';

const { Title, Text } = Typography;

export const AccessPendingPage = () => {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const { access, isLoading, refresh, errorMessage } = useAccessStatus();
  const pollIntervalMs = Number(import.meta.env.VITE_ACCESS_STATUS_POLL_MS ?? access?.pollAfterMs ?? 15000);

  useEffect(() => {
    if (access?.status === 'approved') {
      navigate('/', { replace: true });
    }
  }, [access?.status, navigate]);

  useEffect(() => {
    if (access?.status !== 'pending') {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      if (Date.now() - startedAt >= 10 * 60 * 1000) {
        window.clearInterval(timer);
        return;
      }

      void refresh();
    }, Math.max(pollIntervalMs, 5000));

    return () => window.clearInterval(timer);
  }, [access?.status, pollIntervalMs, refresh]);

  const handleResubmit = async () => {
    try {
      await accessClient.requestCurrentIp();
      await refresh();
      message.success('Đã gửi lại yêu cầu truy cập.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể gửi lại yêu cầu truy cập.');
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <div className="login-page">
      <Card className="login-card" bordered={false}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Title level={3} style={{ marginBottom: 8 }}>
              Truy cập admin đang chờ duyệt
            </Title>
            <Text type="secondary">
              Tài khoản đã đăng nhập nhưng IP hiện tại chưa được duyệt vào admin console.
            </Text>
          </div>

          {access ? (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="IP hiện tại">{access.normalizedIp ?? 'Không rõ'}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <StatusBadge status={access.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Ghi nhận lần đầu">
                {access.firstSeenAt ?? 'Chưa ghi nhận'}
              </Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{access.note ?? access.reason ?? 'Không có'}</Descriptions.Item>
            </Descriptions>
          ) : null}

          {access?.status === 'rejected' ? (
            <Alert
              type="warning"
              showIcon
              message="Yêu cầu truy cập đã bị từ chối"
              description={access.reason ?? 'Quản trị viên đã từ chối IP này.'}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="Đang chờ phê duyệt"
              description="Làm mới sau khi quản trị viên phê duyệt IP hiện tại."
            />
          )}

          {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

          <Space wrap>
            <Button onClick={() => refresh()} loading={isLoading}>
              Làm mới trạng thái
            </Button>
            {access?.canResubmit ? (
              <Button type="primary" onClick={() => void handleResubmit()}>
                Gửi lại yêu cầu
              </Button>
            ) : null}
            <Button
              onClick={() =>
                message.info('Hãy liên hệ quản trị viên qua kênh hỗ trợ nội bộ.')
              }
            >
              Liên hệ admin
            </Button>
            <Button danger onClick={handleLogout}>
              Đăng xuất
            </Button>
          </Space>

          <Text type="secondary">Dùng kênh hỗ trợ nội bộ nếu cần xử lý gấp quyền truy cập này.</Text>
        </Space>
      </Card>
    </div>
  );
};
