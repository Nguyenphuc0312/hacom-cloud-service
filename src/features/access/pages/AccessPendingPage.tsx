import { Alert, Button, Card, Descriptions, Space, Typography, message } from 'antd';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAccessStatus } from '@/app/useAccessStatus';
import { accessClient } from '@/api/clients';
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
      message.success('Yeu cau da duoc gui lai.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Khong the gui lai yeu cau.');
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
              Ban chua duoc cap quyen truy cap
            </Title>
            <Text type="secondary">
              Tai khoan da dang nhap thanh cong nhung IP hien tai chua nam trong danh sach duoc phe
              duyet.
            </Text>
          </div>

          {access ? (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="IP hien tai">{access.normalizedIp ?? 'Khong ro'}</Descriptions.Item>
              <Descriptions.Item label="Trang thai">{access.status}</Descriptions.Item>
              <Descriptions.Item label="Ghi nhan luc">{access.firstSeenAt ?? 'Chua co'}</Descriptions.Item>
              <Descriptions.Item label="Ghi chu">{access.note ?? access.reason ?? 'Khong co'}</Descriptions.Item>
            </Descriptions>
          ) : null}

          {access?.status === 'rejected' ? (
            <Alert
              type="warning"
              showIcon
              message="Yeu cau truy cap da bi tu choi"
              description={access.reason ?? 'Quan tri vien da tu choi IP nay.'}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="Dang cho phe duyet"
              description="Hay lam moi trang thai sau khi quan tri vien approve IP hien tai."
            />
          )}

          {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

          <Space wrap>
            <Button onClick={() => refresh()} loading={isLoading}>
              Lam moi trang thai
            </Button>
            {access?.canResubmit ? (
              <Button type="primary" onClick={() => void handleResubmit()}>
                Gui lai yeu cau
              </Button>
            ) : null}
            <Button onClick={() => message.info('Lien he quan tri vien qua kenh ho tro noi bo de duyet IP hien tai.')}>
              Lien he quan tri vien
            </Button>
            <Button danger onClick={handleLogout}>
              Dang xuat
            </Button>
          </Space>

          <Text type="secondary">Neu can gap, lien he quan tri vien qua kenh ho tro noi bo.</Text>
        </Space>
      </Card>
    </div>
  );
};
