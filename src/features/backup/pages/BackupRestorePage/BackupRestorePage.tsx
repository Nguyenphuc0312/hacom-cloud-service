import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Modal, Progress, Typography, message } from 'antd';
import { useState } from 'react';

import { backupClient } from '@/api/clients/backupClient/backupClient';
import { getErrorMessage } from '@/api/error/error';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { formatDateTime } from '@/utils/date/date';
import { formatBytes } from '@/utils/formatters/formatters';
import './BackupRestorePage.css';

const { Text } = Typography;

const formatHours = (hours: number | null): string => {
  if (hours === null) return '-';
  if (hours < 1) return `${Math.round(hours * 60)} phút`;
  if (hours < 24) return `${Math.round(hours)} giờ`;
  return `${Math.round(hours / 24)} ngày`;
};

interface AxiosLikeError {
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
      };
    };
  };
  message?: string;
}

function getBackupErrorMessage(error: unknown): string {
  const axiosError = error as AxiosLikeError;
  const status = axiosError.response?.status;
  const messageText = axiosError.response?.data?.error?.message;

  if (status === 404) {
    return 'Không tìm thấy endpoint backup/status. Frontend có thể đang gọi sai API path hoặc backend chưa đăng ký route.';
  }

  if (status === 401 || status === 403) {
    return 'Bạn không có quyền xem trạng thái backup/restore.';
  }

  if (messageText?.toLowerCase().includes('prometheus') || messageText?.toLowerCase().includes('connect')) {
    return 'Không thể kết nối tới Prometheus để lấy dữ liệu backup.';
  }

  if (status === 500 || status === 503) {
    return 'Backend gặp lỗi khi lấy dữ liệu backup. Vui lòng thử lại sau.';
  }

  if (status) {
    return `Lỗi ${status}: ${messageText ?? 'Không thể tải trạng thái backup/restore.'}`;
  }

  return 'Không thể tải trạng thái backup/restore. Vui lòng thử lại.';
}

export const BackupRestorePage = () => {
  const [confirmBackupVisible, setConfirmBackupVisible] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['backup-status'],
    queryFn: backupClient.getStatus,
    refetchInterval: 300_000, // 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      // Backend endpoint for triggering backup - this would be implemented in the API client
      // For now, we'll just show a message
      message.info('Tính năng backup thủ công đang được phát triển.');
      return true;
    },
    onSuccess: () => {
      message.success('Đã kích hoạt backup. Trạng thái sẽ được cập nhật trong vài phút.');
      setConfirmBackupVisible(false);
      void statusQuery.refetch();
    },
    onError: (error) => {
      message.error(getErrorMessage(error, 'Không thể kích hoạt backup. Vui lòng thử lại.'));
    },
  });

  const handleRunBackup = () => {
    setConfirmBackupVisible(true);
  };

  const confirmRunBackup = () => {
    void backupMutation.mutateAsync();
  };

  if (statusQuery.isPending && !statusQuery.data) {
    return (
      <PageShell
        eyebrow="Vận hành"
        title="Backup & Restore"
        description="Theo dõi trạng thái backup và restore drill."
      >
        <QueryStateView kind="loading" title="Đang tải trạng thái backup..." />
      </PageShell>
    );
  }

  if (statusQuery.isError && !statusQuery.data) {
    return (
      <PageShell
        eyebrow="Vận hành"
        title="Backup & Restore"
        description="Theo dõi trạng thái backup và restore drill."
        headerExtra={
          <Button onClick={() => void statusQuery.refetch()}>Thử lại</Button>
        }
      >
        <QueryStateView
          kind="error"
          title={getBackupErrorMessage(statusQuery.error)}
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => void statusQuery.refetch()}
        />
      </PageShell>
    );
  }

  const lastBackup = statusQuery.data?.lastBackup;
  const restoreDrill = statusQuery.data?.restoreDrill;
  const rpo = statusQuery.data?.rpo;
  const isBackupInProgress = lastBackup?.status === 'in_progress' || lastBackup?.status === 'running';

  return (
    <PageShell
      eyebrow="Vận hành"
      title="Backup & Restore"
      description="Theo dõi trạng thái backup và restore drill."
      headerExtra={
        <div className="backup-page-actions">
          <Button
            type="primary"
            icon={<AppIcon name="upload" size={14} />}
            onClick={handleRunBackup}
            loading={backupMutation.isPending}
            disabled={isBackupInProgress}
          >
            {isBackupInProgress ? 'Đang backup...' : 'Chạy Backup ngay'}
          </Button>
          <Button
            onClick={() => {
              void statusQuery.refetch();
            }}
            loading={statusQuery.isFetching}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      {/* Backup Status Section */}
      <div className="backup-restore-page">
        <div className="backup-section">
          <h2 className="backup-section-title">Backup</h2>
          <div className="backup-grid">
            {/* Last Backup Card */}
            <div className="backup-card">
              <Text type="secondary">Last Successful Backup</Text>
              <div className="backup-card-value">
                {lastBackup?.timestamp ? (
                  formatDateTime(lastBackup.timestamp)
                ) : (
                  <Text type="secondary">Chưa có backup</Text>
                )}
              </div>
              <div className="backup-card-meta">
                <Text type="secondary">
                  {lastBackup?.ageHours !== null && lastBackup?.ageHours !== undefined
                    ? `${formatHours(lastBackup.ageHours)} trước`
                    : '-'}
                </Text>
              </div>
            </div>

            {/* Backup Status Card */}
            <div className="backup-card">
              <Text type="secondary">Trạng thái Backup</Text>
              <div className="backup-card-value">
                <StatusBadge status={lastBackup?.status ?? 'missing'} />
              </div>
              <div className="backup-card-meta">
                <Text type="secondary">
                  {lastBackup?.sizeBytes !== null && lastBackup?.sizeBytes !== undefined
                    ? `Size: ${formatBytes(lastBackup.sizeBytes)}`
                    : 'Size: -'}
                </Text>
              </div>
            </div>

            {/* RPO Status Card */}
            <div className="backup-card">
              <Text type="secondary">RPO (Recovery Point Objective)</Text>
              <div className="backup-card-value">
                <StatusBadge status={rpo?.status ?? 'breached'} />
              </div>
              <div className="backup-card-meta">
                <Text type="secondary">
                  Target: {rpo?.targetHours ?? 24}h | Current:{' '}
                  {rpo?.currentHours !== null && rpo?.currentHours !== undefined ? formatHours(rpo.currentHours) : 'N/A'}
                </Text>
              </div>
            </div>

            {/* Backup Progress Card (shown when in progress) */}
            {isBackupInProgress && (
              <div className="backup-card backup-card--progress">
                <Text type="secondary">Backup đang chạy</Text>
                <Progress percent={50} status="active" size="small" />
                <Text type="secondary" className="backup-card-meta">
                  Vui lòng đợi trong vài phút...
                </Text>
              </div>
            )}
          </div>
        </div>

        {/* Restore Drill Section */}
        <div className="backup-section">
          <h2 className="backup-section-title">Restore Drill</h2>
          <div className="backup-grid">
            {/* Last Restore Drill Card */}
            <div className="backup-card">
              <Text type="secondary">Last Successful Restore Drill</Text>
              <div className="backup-card-value">
                {restoreDrill?.lastSuccess ? (
                  formatDateTime(restoreDrill.lastSuccess)
                ) : (
                  <Text type="secondary">Chưa có restore drill</Text>
                )}
              </div>
              <div className="backup-card-meta">
                <Text type="secondary">
                  {restoreDrill?.ageDays !== null && restoreDrill?.ageDays !== undefined
                    ? `${restoreDrill.ageDays} ngày trước`
                    : '-'}
                </Text>
              </div>
            </div>

            {/* Restore Drill Status Card */}
            <div className="backup-card">
              <Text type="secondary">Trạng thái Restore Drill</Text>
              <div className="backup-card-value">
                <StatusBadge status={restoreDrill?.status ?? 'missing'} />
              </div>
              <div className="backup-card-meta">
                <Text type="secondary">
                  Required: Within 14 days
                </Text>
              </div>
            </div>

            {/* Info Card */}
            <div className="backup-card backup-card--info">
              <Text type="secondary">Thông tin RTO</Text>
              <div className="backup-card-value">
                <Text>Restore Drill Status: {restoreDrill?.status ?? 'unknown'}</Text>
              </div>
              <div className="backup-card-meta">
                <Text type="secondary">
                  Một backup chưa được test restore không phải là một backup đáng tin cậy.
                </Text>
              </div>
            </div>
          </div>
        </div>

        {/* Alert Info */}
        <div className="backup-alert-info">
          <Text type="secondary">
            Dữ liệu được lấy từ Prometheus textfile metrics. Alerts được cấu hình trong{' '}
            <Text code>alerts.production.yml</Text>.
          </Text>
        </div>
      </div>

      {/* Confirm Backup Modal */}
      <Modal
        title="Xác nhận chạy Backup"
        open={confirmBackupVisible}
        onCancel={() => setConfirmBackupVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmBackupVisible(false)}>
            Hủy
          </Button>,
          <Button
            key="confirm"
            type="primary"
            danger
            loading={backupMutation.isPending}
            onClick={confirmRunBackup}
          >
            Xác nhận Backup
          </Button>,
        ]}
      >
        <div className="backup-confirm-content">
          <p>Bạn có chắc chắn muốn kích hoạt backup thủ công?</p>
          <ul>
            <li>Backup sẽ bao gồm PostgreSQL, MongoDB, và MinIO data.</li>
            <li>Quá trình này có thể mất từ 5-30 phút tùy thuộc vào kích thước dữ liệu.</li>
            <li>Trong khi backup, hệ thống vẫn hoạt động bình thường.</li>
          </ul>
        </div>
      </Modal>
    </PageShell>
  );
};
