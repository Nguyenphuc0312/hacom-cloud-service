import { Button, Input, Select } from 'antd';

import type { AuthorityDetailResponse, AuthorityOverrideEffect } from '@/api/types/authority/authority';
import type { Role } from '@/api/types/auth/auth';
import { AppDrawer } from '@/components/AppDrawer/AppDrawer';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import { formatDateTime } from '@/utils/date/date';
import { formatRoleLabel, formatSourceLabel } from '../utils/authorityPageFormatters';
import { PERMISSION_OPTIONS, ROLE_OPTIONS } from '../constants/authorityPageOptions';
import type { DraftOverride } from '../types/authorityPageTypes';

interface AuthorityDetailDrawerProps {
  open: boolean;
  selectedUserId: string | null;
  detail: AuthorityDetailResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  draftRole: Exclude<Role, 'superadmin' | 'admin'> | undefined;
  draftOverrides: DraftOverride[];
  changeReason: string;
  roleSaving: boolean;
  roleDeleting: boolean;
  overridesSaving: boolean;
  onClose: () => void;
  onRetry: () => void;
  onDraftRoleChange: (role: Exclude<Role, 'superadmin' | 'admin'> | undefined) => void;
  onDraftOverridesChange: (updater: (current: DraftOverride[]) => DraftOverride[]) => void;
  onChangeReasonChange: (value: string) => void;
  onSaveRole: () => void;
  onRequestDeleteRole: () => void;
  onSaveOverrides: () => void;
}

export const AuthorityDetailDrawer = ({
  open,
  selectedUserId,
  detail,
  isLoading,
  isError,
  draftRole,
  draftOverrides,
  changeReason,
  roleSaving,
  roleDeleting,
  overridesSaving,
  onClose,
  onRetry,
  onDraftRoleChange,
  onDraftOverridesChange,
  onChangeReasonChange,
  onSaveRole,
  onRequestDeleteRole,
  onSaveOverrides,
}: AuthorityDetailDrawerProps) => (
  <AppDrawer open={open} onClose={onClose} title="Chi tiết phân quyền" width={760}>
    {!selectedUserId ? (
      <EmptyState description="Chọn một bản ghi phân quyền để xem quyền hạn." />
    ) : isLoading && !detail ? (
      <QueryStateView kind="loading" compact title="Đang tải chi tiết phân quyền..." />
    ) : isError ? (
      <QueryStateView kind="error" compact description="Không thể tải chi tiết phân quyền." onRetry={onRetry} />
    ) : !detail ? (
      <EmptyState description="Chi tiết phân quyền hiện không khả dụng." />
    ) : (
      <div className="ds-settings-stack">
        <div className="ds-detail-overview-grid">
          <div className="ds-summary-tile">
            <span className="ds-summary-tile-label">Nguồn phân quyền</span>
            <strong className="ds-summary-tile-value">
              {detail.authoritySource ? formatSourceLabel(detail.authoritySource) : 'không có'}
            </strong>
            <span className="ds-summary-tile-meta">Luồng phân giải quyền hiện tại.</span>
          </div>
          <div className="ds-summary-tile">
            <span className="ds-summary-tile-label">Vai trò DB</span>
            <strong className="ds-summary-tile-value">{formatRoleLabel(detail.role)}</strong>
            <span className="ds-summary-tile-meta">Vai trò chuẩn đang được lưu trong authority DB.</span>
          </div>
          <div className="ds-summary-tile">
            <span className="ds-summary-tile-label">Override</span>
            <strong className="ds-summary-tile-value">{detail.overrides.length}</strong>
            <span className="ds-summary-tile-meta">Số diff cấp hoặc từ chối đang áp trên vai trò gốc.</span>
          </div>
          <div className="ds-summary-tile">
            <span className="ds-summary-tile-label">Quyền hiệu lực</span>
            <strong className="ds-summary-tile-value">{detail.effectivePermissions.length}</strong>
            <span className="ds-summary-tile-meta">Tập quyền cuối cùng mà runtime đang chấp nhận.</span>
          </div>
        </div>

        <SurfaceCard
          eyebrow="Danh tính"
          title={detail.user.email}
          description="Rà soát operator và cửa sổ hiệu lực trước khi đổi vai trò hoặc override."
        >
          <div className="ds-detail-list">
            <div className="ds-detail-list-item">
              <span>Username</span>
              <strong>{detail.user.username ?? '-'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Nguồn phân quyền</span>
              <strong>{formatSourceLabel(detail.authoritySource)}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Có hiệu lực từ</span>
              <strong>{detail.effectiveFrom ? formatDateTime(detail.effectiveFrom) : 'Ngay bây giờ'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Có hiệu lực đến</span>
              <strong>{detail.effectiveUntil ? formatDateTime(detail.effectiveUntil) : 'Không thời hạn'}</strong>
            </div>
            <div className="ds-detail-list-item">
              <span>Cho phép break-glass</span>
              <strong>{detail.breakGlassEligible ? 'Có' : 'Không'}</strong>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Lý do thay đổi"
          title="Ghi chú operator"
          description="Luôn ghi lý do khi đổi vai trò chuẩn hoặc danh sách override để phục vụ rà soát sau này."
        >
          <Input.TextArea
            rows={3}
            value={changeReason}
            placeholder="Lý do cho thay đổi phân quyền này"
            onChange={(event) => onChangeReasonChange(event.target.value)}
          />
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Vai trò chuẩn"
          title="Phân công vai trò dựa trên DB"
          description="Ưu tiên vai trò gốc rõ ràng. Chỉ xóa vai trò DB khi bạn thực sự cần fallback hoặc break-glass."
        >
          <div className="ds-admin-form-grid">
            <Select
              value={draftRole}
              placeholder="Chọn vai trò chuẩn"
              options={ROLE_OPTIONS}
              onChange={onDraftRoleChange}
              allowClear
            />
            <div className="ds-admin-inline-actions">
              <Button type="primary" disabled={!draftRole} loading={roleSaving} onClick={onSaveRole}>
                Lưu vai trò
              </Button>
              <Button danger disabled={!detail.role} loading={roleDeleting} onClick={onRequestDeleteRole}>
                Xóa vai trò DB
              </Button>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Override quyền"
          title="Diff cấp hoặc từ chối"
          description="Chỉ dùng override khi thật cần. Giữ tập diff ngắn để operator khác có thể rà soát nhanh."
          actions={
            <Button
              onClick={() =>
                onDraftOverridesChange((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    effect: 'grant',
                  },
                ])
              }
            >
              Thêm override
            </Button>
          }
        >
          {draftOverrides.length > 0 ? (
            <div className="ds-admin-override-list">
              {draftOverrides.map((override) => (
                <div key={override.id} className="ds-admin-override-row">
                  <Select
                    value={override.permission}
                    placeholder="Quyền"
                    options={PERMISSION_OPTIONS.map((permission) => ({
                      label: permission,
                      value: permission,
                    }))}
                    onChange={(value) =>
                      onDraftOverridesChange((current) =>
                        current.map((item) => (item.id === override.id ? { ...item, permission: value } : item)),
                      )
                    }
                  />
                  <Select
                    value={override.effect}
                    options={[
                      { label: 'Cấp quyền', value: 'grant' },
                      { label: 'Từ chối quyền', value: 'deny' },
                    ]}
                    onChange={(value: AuthorityOverrideEffect) =>
                      onDraftOverridesChange((current) =>
                        current.map((item) => (item.id === override.id ? { ...item, effect: value } : item)),
                      )
                    }
                  />
                  <Button
                    danger
                    onClick={() => onDraftOverridesChange((current) => current.filter((item) => item.id !== override.id))}
                  >
                    Xóa
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              title="Chưa cấu hình override"
              description="Lưu danh sách rỗng khi bạn muốn xóa toàn bộ tập diff trong DB."
            />
          )}

          <div className="ds-settings-action-bar">
            <div className="ds-settings-action-copy">
              Override được áp trên vai trò chuẩn. Lệnh từ chối nên là ngoại lệ và luôn cần giải thích rõ.
            </div>
            <Button type="primary" loading={overridesSaving} onClick={onSaveOverrides}>
              Lưu override
            </Button>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Quyền hiệu lực"
          title="Tập quyền runtime"
          description="Đây là tập quyền cuối cùng mà admin panel phải tôn trọng sau khi resolve vai trò và override."
        >
          {detail.effectivePermissions.length > 0 ? (
            <div className="ds-admin-chip-list">
              {detail.effectivePermissions.map((permission) => (
                <span key={permission} className="ds-shell-chip ds-shell-chip--ghost">
                  {permission}
                </span>
              ))}
            </div>
          ) : (
            <EmptyState compact description="Không có quyền hiệu lực nào được trả về." />
          )}
        </SurfaceCard>
      </div>
    )}
  </AppDrawer>
);

