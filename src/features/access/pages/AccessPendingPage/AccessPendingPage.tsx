import { Alert, Button, Space, message } from 'antd';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { accessClient } from '@/api/clients/accessClient/accessClient';
import { useAccessStatus } from '@/app/useAccessStatus/useAccessStatus';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { useAuthStore } from '@/store/authStore/authStore';
import { formatDateTime } from '@/utils/date/date';

import './AccessPendingPage.css';

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

  const firstSeenLabel = access?.firstSeenAt ? formatDateTime(access.firstSeenAt) : 'Chưa ghi nhận';
  const noteLabel = access?.note ?? access?.reason ?? 'Không có';

  return (
    <main className="access-pending-page">
      <section className="access-pending-card" aria-labelledby="access-pending-title">
        <div className="access-pending-header">
          <div className="access-pending-icon" aria-hidden="true">
            <AppIcon name="shield" size={24} />
          </div>
          <div className="access-pending-heading">
            <span className="access-pending-eyebrow">Admin access control</span>
            <h1 id="access-pending-title">Truy cập admin đang chờ duyệt</h1>
            <p>Tài khoản đã xác thực, nhưng IP hiện tại chưa được phép vào admin console.</p>
          </div>
          {access ? <StatusBadge status={access.status} /> : null}
        </div>

        {access ? (
          <dl className="access-pending-facts">
            <div className="access-pending-fact access-pending-fact--wide">
              <dt>IP hiện tại</dt>
              <dd>{access.normalizedIp ?? 'Không rõ'}</dd>
            </div>
            <div className="access-pending-fact">
              <dt>Trạng thái</dt>
              <dd>
                <StatusBadge status={access.status} />
              </dd>
            </div>
            <div className="access-pending-fact">
              <dt>Ghi nhận lần đầu</dt>
              <dd>{firstSeenLabel}</dd>
            </div>
            <div className="access-pending-fact access-pending-fact--wide">
              <dt>Ghi chú</dt>
              <dd>{noteLabel}</dd>
            </div>
          </dl>
        ) : null}

        <div className={`access-pending-notice ${access?.status === 'rejected' ? 'is-warning' : ''}`}>
          <div className="access-pending-notice-icon" aria-hidden="true">
            <AppIcon name={access?.status === 'rejected' ? 'warning' : 'lock'} size={18} />
          </div>
          <div>
            <strong>
              {access?.status === 'rejected'
                ? 'Yêu cầu truy cập đã bị từ chối'
                : 'Đang chờ quản trị viên phê duyệt'}
            </strong>
            <p>
              {access?.status === 'rejected'
                ? access.reason ?? 'Quản trị viên đã từ chối IP này.'
                : 'Sau khi IP được duyệt, hãy làm mới trạng thái để vào console.'}
            </p>
          </div>
        </div>

        {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

        <div className="access-pending-actions">
          <Space wrap size={10}>
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
        </div>

        <p className="access-pending-footnote">
          Dùng kênh hỗ trợ nội bộ nếu cần xử lý gấp quyền truy cập này.
        </p>
      </section>
    </main>
  );
};
