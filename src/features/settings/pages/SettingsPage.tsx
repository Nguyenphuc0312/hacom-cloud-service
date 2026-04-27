import { Button } from 'antd';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { appConfig } from '@/config/appConfig';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { EmailTemplatesCard } from '@/features/services/components/EmailTemplatesCard';
import { SmtpSettingsCard } from '@/features/services/components/SmtpSettingsCard';

const SETTING_SECTIONS = [
  {
    key: 'smtp',
    label: 'SMTP',
    description: 'Transport và định danh gửi mail',
  },
  {
    key: 'email-templates',
    label: 'Mẫu email',
    description: 'Draft, preview và publish template',
  },
  {
    key: 'system',
    label: 'Thiết lập hệ thống',
    description: 'Guardrail và chế độ vận hành',
  },
] as const;

type SettingSectionKey = (typeof SETTING_SECTIONS)[number]['key'];

const isSettingSectionKey = (value: string | undefined): value is SettingSectionKey =>
  SETTING_SECTIONS.some((section) => section.key === value);

const SYSTEM_SURFACES = [
  {
    id: 'environment',
    label: 'Môi trường',
    value: appConfig.environmentLabel,
    meta: 'Giúp operator phân biệt production và môi trường kiểm thử.',
  },
  {
    id: 'live-updates',
    label: 'Cập nhật dữ liệu',
    value: appConfig.liveUpdatesLabel,
    meta: 'Cho biết panel đang dùng realtime stream hay polling.',
  },
  {
    id: 'write-actions',
    label: 'Thao tác ghi admin',
    value: isAdminWriteActionsEnabled ? 'Đang bật' : 'Đang tắt',
    meta: 'Guardrail cho thao tác ghi như khóa tài khoản, publish cấu hình hoặc rollback.',
  },
] as const;

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const activeSection = isSettingSectionKey(section) ? section : 'smtp';

  useEffect(() => {
    if (!isSettingSectionKey(section)) {
      navigate('/settings/smtp', { replace: true });
    }
  }, [navigate, section]);

  const currentSection = useMemo(
    () => SETTING_SECTIONS.find((entry) => entry.key === activeSection) ?? SETTING_SECTIONS[0],
    [activeSection],
  );

  const renderContent = () => {
    if (activeSection === 'smtp') {
      return <SmtpSettingsCard />;
    }

    if (activeSection === 'email-templates') {
      return <EmailTemplatesCard />;
    }

    return (
      <div className="ds-settings-stack">
        <SurfaceCard
          eyebrow="Guardrail vận hành"
          title="Thiết lập hệ thống"
          description="Các thông tin này không cần nằm ở shell chính nhưng phải sẵn sàng để operator đối chiếu khi thao tác."
          status={<StatusBadge status={isAdminWriteActionsEnabled ? 'active' : 'inactive'} />}
        >
          <div className="ds-data-summary-grid">
            {SYSTEM_SURFACES.map((surface) => (
              <div key={surface.id} className="ds-summary-tile">
                <span className="ds-summary-tile-label">{surface.label}</span>
                <strong className="ds-summary-tile-value">{surface.value}</strong>
                <span className="ds-summary-tile-meta">{surface.meta}</span>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Mặc định vận hành"
          title="Mặc định vận hành"
          description="Khu này chỉ hiển thị những tham số ảnh hưởng trực tiếp tới hành vi hệ thống hoặc kiểm toán."
        >
          <div className="ds-ops-fact-list">
            <div>
              <dt>Chế độ làm mới</dt>
              <dd>{appConfig.liveUpdatesMode === 'live' ? 'Realtime stream' : 'Polling định kỳ'}</dd>
            </div>
            <div>
              <dt>Endpoint realtime</dt>
              <dd>{appConfig.liveUpdatesUrl ?? 'Chưa cấu hình'}</dd>
            </div>
            <div>
              <dt>An toàn thao tác ghi</dt>
              <dd>{isAdminWriteActionsEnabled ? 'Operator được phép ghi' : 'Panel đang ở chế độ hạn chế'}</dd>
            </div>
          </div>
        </SurfaceCard>
      </div>
    );
  };

  return (
    <PageShell
      eyebrow="Cấu hình"
      title="Thiết lập hệ thống"
      description="Tách riêng khu cấu hình để operator không nhầm trạng thái runtime với thay đổi hệ thống."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <StatusBadge status={isAdminWriteActionsEnabled ? 'active' : 'inactive'} />
        </div>
      }
    >
      <section className="ds-settings-layout" aria-label="Cài đặt hệ thống">
        <aside className="ds-settings-nav" aria-label="Điều hướng cấu hình">
          <div className="ds-settings-nav-header">
            <span className="ds-settings-nav-eyebrow">Cấu hình</span>
            <strong>{currentSection.label}</strong>
            <p>{currentSection.description}</p>
          </div>

          <div className="ds-settings-nav-list">
            {SETTING_SECTIONS.map((item) => {
              const active = item.key === activeSection;

              return (
                <Button
                  key={item.key}
                  type="text"
                  className={`ds-settings-nav-item ${active ? 'is-active' : ''}`}
                  onClick={() => navigate(`/settings/${item.key}`)}
                >
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </Button>
              );
            })}
          </div>
        </aside>

        <div className="ds-settings-content">{renderContent()}</div>
      </section>
    </PageShell>
  );
};
