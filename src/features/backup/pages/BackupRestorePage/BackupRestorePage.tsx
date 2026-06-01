import { useQuery } from '@tanstack/react-query';
import { Button, Typography } from 'antd';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { formatDateTime } from '@/utils/date/date';
import { formatBytes } from '@/utils/formatters/formatters';
import { backupClient } from '@/api/clients/backupClient/backupClient';

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
  const message = axiosError.response?.data?.error?.message;

  if (status === 404) {
    return 'Không tìm thấy endpoint backup/status. Frontend có thể đang gọi sai API path hoặc backend chưa đăng ký route.';
  }

  if (status === 401 || status === 403) {
    return 'Bạn không có quyền xem trạng thái backup/restore.';
  }

  if (message?.toLowerCase().includes('prometheus') || message?.toLowerCase().includes('connect')) {
    return 'Không thể kết nối tới Prometheus để lấy dữ liệu backup.';
  }

  if (status === 500 || status === 503) {
    return 'Backend gặp lỗi khi lấy dữ liệu backup. Vui lòng thử lại sau.';
  }

  if (status) {
    return `Lỗi ${status}: ${message ?? 'Không thể tải trạng thái backup/restore.'}`;
  }

  return 'Không thể tải trạng thái backup/restore. Vui lòng thử lại.';
}

export const BackupRestorePage = () => {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['backup-status'],
    queryFn: backupClient.getStatus,
    refetchInterval: 300_000, // 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  if (isLoading && !data) {
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

  // Error state - must render even if error
  if (isError && !data) {
    return (
      <PageShell
        eyebrow="Vận hành"
        title="Backup & Restore"
        description="Theo dõi trạng thái backup và restore drill."
        headerExtra={
          <Button onClick={() => void refetch()}>Thử lại</Button>
        }
      >
        <QueryStateView
          kind="error"
          title={getBackupErrorMessage(error)}
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => void refetch()}
        />
      </PageShell>
    );
  }

  const lastBackup = data?.lastBackup;
  const restoreDrill = data?.restoreDrill;
  const rpo = data?.rpo;

  return (
    <PageShell
      eyebrow="Vận hành"
      title="Backup & Restore"
      description="Theo dõi trạng thái backup và restore drill."
      headerExtra={
        <Button
          onClick={() => {
            void refetch();
          }}
          loading={isFetching}
        >
          Làm mới
        </Button>
      }
    >
      <div className="backup-restore-page">
        {/* Backup Status Section */}
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
    </PageShell>
  );
};
