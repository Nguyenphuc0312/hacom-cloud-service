import { Button } from 'antd';

import { useCurrentUser } from '@/app/useCurrentUser/useCurrentUser';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import { appConfig } from '@/config/appConfig/appConfig';
import { toDisplayRole } from '@/utils/role/role';

import './ProfilePage.css';
const readValue = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Có' : 'Không';
  }

  return value === null || value === undefined ? '-' : String(value);
};

export const ProfilePage = () => {
  const {
    user,
    isLoading,
    isRetryingCurrentUser,
    isAuthServiceUnavailable,
    currentUserErrorMessage,
    retryCurrentUser,
  } = useCurrentUser();

  const displayName =
    user?.fullName?.trim() ||
    user?.displayName?.trim() ||
    user?.username?.trim() ||
    user?.email?.split('@')[0] ||
    'Admin';
  const avatarText = displayName.charAt(0).toUpperCase();

  if (isLoading && !user) {
    return (
      <PageShell title="Hồ sơ cá nhân" eyebrow="Tài khoản">
        <QueryStateView kind="loading" title="Đang tải hồ sơ admin..." />
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell title="Hồ sơ cá nhân" eyebrow="Tài khoản">
        <QueryStateView
          kind="error"
          title={isAuthServiceUnavailable ? 'Auth service không khả dụng' : 'Không thể tải hồ sơ'}
          description={currentUserErrorMessage ?? 'Không có dữ liệu admin hiện tại.'}
          onRetry={() => {
            void retryCurrentUser();
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Tài khoản"
      title="Hồ sơ cá nhân"
      description="Thông tin định danh admin lấy từ backend, chỉ dùng để đối chiếu khi vận hành."
      headerExtra={
        <Button
          icon={<AppIcon name="refresh" size={14} aria-hidden />}
          loading={isRetryingCurrentUser}
          onClick={() => {
            void retryCurrentUser();
          }}
        >
          Làm mới
        </Button>
      }
    >
      <div className="ds-profile-layout">
        <SurfaceCard className="ds-profile-identity-card">
          <div className="ds-profile-hero">
            <span className="ds-profile-avatar" aria-hidden>
              {avatarText}
            </span>
            <div className="ds-profile-hero-copy">
              <span className="ds-profile-eyebrow">Admin hiện tại</span>
              <strong>{displayName}</strong>
              <span>{readValue(user.email)}</span>
            </div>
          </div>

          <div className="ds-profile-status-row">
            <StatusBadge status={user.status ?? 'unknown'} />
            <StatusBadge status={user.isVerified ? 'verified' : 'unknown'} />
            <StatusBadge status={user.hrLinked ? 'active' : 'unknown'} />
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Định danh"
          title="Thông tin tài khoản"
          description="Các trường này do auth/admin backend trả về."
        >
          <dl className="ds-profile-detail-grid">
            <div>
              <dt>Email</dt>
              <dd>{readValue(user.email)}</dd>
            </div>
            <div>
              <dt>Username</dt>
              <dd>{readValue(user.username)}</dd>
            </div>
            <div>
              <dt>Họ tên</dt>
              <dd>{readValue(user.fullName ?? user.displayName)}</dd>
            </div>
            <div>
              <dt>Mã nhân viên</dt>
              <dd>{readValue(user.employeeCode)}</dd>
            </div>
            <div>
              <dt>Loại tài khoản</dt>
              <dd>{readValue(user.accountType)}</dd>
            </div>
            <div>
              <dt>Nguồn quyền</dt>
              <dd>{readValue(user.authoritySource)}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Quyền truy cập"
          title="Vai trò và quyền"
          description="UI chỉ hiển thị quyền backend trả về, không tự quyết định phân quyền."
        >
          <dl className="ds-profile-detail-grid ds-profile-detail-grid--compact">
            <div>
              <dt>Vai trò</dt>
              <dd>{toDisplayRole(user.role)}</dd>
            </div>
            <div>
              <dt>Môi trường</dt>
              <dd>{appConfig.environmentLabel}</dd>
            </div>
          </dl>

          <div className="ds-profile-permission-list" aria-label="Danh sách quyền">
            {user.permissions && user.permissions.length > 0 ? (
              user.permissions.map((permission) => <span key={permission}>{permission}</span>)
            ) : (
              <span>Backend chưa trả về danh sách quyền chi tiết.</span>
            )}
          </div>
        </SurfaceCard>
      </div>
    </PageShell>
  );
};
