import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Select, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';

import { authorityClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { AuthorityListItem, AuthorityOverrideEffect, Role } from '@/api/types';
import { AppIcon } from '@/components/AppIcon';
import { AppDrawer } from '@/components/AppDrawer';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { FilterBar } from '@/components/FilterBar';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatDateTime } from '@/utils/date';

const ROLE_OPTIONS: Array<{ label: string; value: Exclude<Role, 'superadmin' | 'admin'> }> = [
  { label: 'Quản trị cấp cao', value: 'super_admin' },
  { label: 'Điều hành', value: 'operator' },
  { label: 'Người xem', value: 'viewer' },
  { label: 'Quản trị nhân sự', value: 'hr_admin' },
];

const PERMISSION_OPTIONS = [
  'admin.profile.read',
  'admin.authority.read',
  'admin.authority.write',
  'admin.users.read',
  'admin.users.write',
  'admin.users.deactivate',
  'admin.users.lock',
  'admin.users.unlock',
  'admin.users.revoke_sessions',
  'admin.sessions.read',
  'admin.hr.read',
  'admin.hr.write',
  'admin.hr.provision',
  'admin.hr.import',
  'admin.audit.read',
  'admin.access_ip.read',
  'admin.access_ip.review',
  'admin.access_ip.write',
  'admin.smtp.read',
  'admin.smtp.write',
  'admin.email_template.read',
  'admin.email_template.write',
  'admin.service_health.read',
];

type DraftOverride = {
  id: string;
  permission?: string;
  effect: AuthorityOverrideEffect;
};

const sourceTone: Record<string, 'default' | 'warning'> = {
  db: 'default',
  break_glass: 'warning',
};

const formatSourceLabel = (value: string | null | undefined) => {
  if (!value) return '-';
  if (value === 'db') return 'DB';
  if (value === 'break_glass') return 'Break-glass';
  return value.replace(/_/g, ' ');
};

const formatRoleLabel = (role: Role | null | undefined) => {
  if (!role) return 'Không có vai trò DB';
  if (role === 'super_admin') return 'Quản trị cấp cao';
  if (role === 'operator') return 'Điều hành';
  if (role === 'viewer') return 'Người xem';
  if (role === 'hr_admin') return 'Quản trị nhân sự';
  return role.replace(/_/g, ' ');
};

export const AuthorityPage = () => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    keyword: undefined as string | undefined,
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<Exclude<Role, 'superadmin' | 'admin'> | undefined>();
  const [draftOverrides, setDraftOverrides] = useState<DraftOverride[]>([]);
  const [changeReason, setChangeReason] = useState('');
  const [removeRoleConfirmOpen, setRemoveRoleConfirmOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: queryKeys.authorityUsers(JSON.stringify(filters)),
    queryFn: () => authorityClient.listUsers(filters),
  });

  const detailQuery = useQuery({
    queryKey: selectedUserId
      ? queryKeys.authorityUserDetail(selectedUserId)
      : ['authority-user-detail-empty'],
    queryFn: () => authorityClient.getUser(selectedUserId ?? ''),
    enabled: Boolean(selectedUserId),
  });

  useEffect(() => {
    if (!detailQuery.data) {
      setDraftRole(undefined);
      setDraftOverrides([]);
      setChangeReason('');
      return;
    }

    setDraftRole((detailQuery.data.role as Exclude<Role, 'superadmin' | 'admin'> | null) ?? undefined);
    setDraftOverrides(
      detailQuery.data.overrides.map((override) => ({
        id: override.id,
        permission: override.permission,
        effect: override.effect,
      })),
    );
  }, [detailQuery.data]);

  const activeFilterCount = [filters.keyword].filter(Boolean).length;

  const refreshAuthorityData = async (userId?: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['authority-users'] }),
      queryClient.invalidateQueries({ queryKey: ['authority-user-detail'] }),
      userId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.authorityUserDetail(userId) })
        : Promise.resolve(),
    ]);
  };

  const roleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId || !draftRole) {
        throw new Error('Hãy chọn vai trò chuẩn trước khi lưu.');
      }

      return authorityClient.updateRole(selectedUserId, {
        role: draftRole,
        reason: changeReason.trim() || undefined,
      });
    },
    onSuccess: async () => {
      message.success('Đã cập nhật vai trò chuẩn.');
      await refreshAuthorityData(selectedUserId);
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) {
        throw new Error('Hãy chọn người dùng trước khi xóa vai trò DB.');
      }

      return authorityClient.deleteRole(selectedUserId, changeReason.trim() || undefined);
    },
    onSuccess: async () => {
      message.success('Đã xóa vai trò DB.');
      setRemoveRoleConfirmOpen(false);
      await refreshAuthorityData(selectedUserId);
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const overridesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) {
        throw new Error('Hãy chọn người dùng trước khi lưu override.');
      }

      const overrides = draftOverrides
        .filter((override) => override.permission)
        .map((override) => ({
          permission: override.permission as string,
          effect: override.effect,
        }));

      return authorityClient.replaceOverrides(selectedUserId, {
        reason: changeReason.trim() || undefined,
        overrides,
      });
    },
    onSuccess: async () => {
      message.success('Đã cập nhật override.');
      await refreshAuthorityData(selectedUserId);
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const columns = useMemo<ColumnsType<AuthorityListItem>>(
    () => [
      {
        title: 'Tài khoản',
        key: 'account',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.email}</strong>
            <span>{record.username ?? 'Chưa có username'}</span>
          </div>
        ),
      },
      {
        title: 'Vai trò chuẩn',
        dataIndex: 'role',
        width: 160,
        render: (value: Role | null) => (
          <span className="ds-shell-chip ds-shell-chip--ghost">{formatRoleLabel(value)}</span>
        ),
      },
      {
        title: 'Nguồn quyền',
        dataIndex: 'authoritySource',
        width: 160,
        render: (value: string | null) =>
          value ? (
            <span
              className={`ds-shell-chip ${
                sourceTone[value] === 'warning' ? 'ds-shell-chip--warning' : 'ds-shell-chip--ghost'
              }`}
            >
              {formatSourceLabel(value)}
            </span>
          ) : (
            '-'
          ),
      },
      {
        title: 'Quyền hiệu lực',
        key: 'permissions',
        width: 140,
        render: (_, record) => record.effectivePermissions.length,
      },
      {
        title: 'Override',
        dataIndex: 'overrideCount',
        width: 110,
      },
      {
        title: 'Khoảng hiệu lực',
        key: 'window',
        render: (_, record) => (
          <span>
            {record.effectiveFrom ? formatDateTime(record.effectiveFrom) : 'Ngay bây giờ'}
            {' → '}
            {record.effectiveUntil ? formatDateTime(record.effectiveUntil) : 'Không thời hạn'}
          </span>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 72,
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Mở chi tiết',
                icon: <AppIcon name="eye" size={14} aria-hidden />,
                onClick: () => setSelectedUserId(record.userId),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  const applyFilters = () => {
    const values = form.getFieldsValue() as { keyword?: string };

    setFilters((current) => ({
      ...current,
      page: 1,
      keyword: values.keyword?.trim() || undefined,
    }));
  };

  const resetFilters = () => {
    form.resetFields();
    setFilters((current) => ({
      ...current,
      page: 1,
      keyword: undefined,
    }));
  };

  const pageHeader = {
    eyebrow: 'Danh tính và truy cập',
    title: 'Quyền và vai trò',
    description: 'Quản trị vai trò chuẩn, nguồn phân quyền và các override runtime trong cùng một workspace.',
  };

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Đang tải workspace phân quyền..." />
      </PageShell>
    );
  }

  if (listQuery.isError) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description="Không thể tải dữ liệu phân quyền."
          onRetry={() => {
            void listQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const detail = detailQuery.data;

  return (
    <>
      <PageShell
        {...pageHeader}
        headerExtra={
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<AppIcon name="refresh" size={16} aria-hidden />}
              loading={listQuery.isFetching}
              onClick={() => {
                void listQuery.refetch();
              }}
            >
              Làm mới
            </Button>
          </div>
        }
      >
        <FilterBar>
          <Form form={form} layout="inline" className="ds-toolbar-form">
            <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
              <Input allowClear placeholder="Email hoặc username" />
            </Form.Item>
            <Form.Item className="ds-toolbar-field ds-toolbar-actions">
              <Space>
                <Button type="primary" onClick={applyFilters}>
                  Áp dụng bộ lọc
                </Button>
                <Button onClick={resetFilters}>Đặt lại</Button>
              </Space>
            </Form.Item>
          </Form>
          <div className="ds-filter-toolbar-meta">
            <span>{listQuery.data?.pagination.total ?? 0} bản ghi phân quyền</span>
            <span>
              {activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang bật` : 'Không có bộ lọc'}
            </span>
            <span>
              Đồng bộ gần nhất:{' '}
              {listQuery.dataUpdatedAt ? formatDateTime(new Date(listQuery.dataUpdatedAt).toISOString()) : '-'}
            </span>
          </div>
        </FilterBar>

        <DataTableShell
          title="Phân công quyền"
          meta="Dùng danh sách để tìm operator thật nhanh, sau đó mở inspector để chỉnh vai trò hoặc override."
          toolbar={
            <DataTableToolbar>
              <span className="ds-toolbar-summary">
                Trang {listQuery.data?.pagination.page ?? 1} / {listQuery.data?.pagination.totalPages ?? 1}
              </span>
            </DataTableToolbar>
          }
        >
          <DataTable
            rowKey="userId"
            columns={columns}
            minHeight={360}
            dataSource={listQuery.data?.items ?? []}
            emptyNode={<EmptyState description="Không có bản ghi phân quyền nào khớp với bộ lọc hiện tại." />}
            onRow={(record) => ({
              onClick: () => setSelectedUserId(record.userId),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedUserId(record.userId);
                }
              },
              tabIndex: 0,
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: listQuery.data?.pagination.page,
              pageSize: listQuery.data?.pagination.limit,
              total: listQuery.data?.pagination.total,
              showSizeChanger: true,
              onChange: (page, pageSize) => {
                setFilters((current) => ({ ...current, page, limit: pageSize }));
              },
            }}
          />
        </DataTableShell>
      </PageShell>

      <AppDrawer
        open={Boolean(selectedUserId)}
        onClose={() => {
          setSelectedUserId(null);
          setChangeReason('');
          setRemoveRoleConfirmOpen(false);
        }}
        title="Chi tiết phân quyền"
        width={760}
      >
        {!selectedUserId ? (
          <EmptyState description="Chọn một bản ghi phân quyền để xem quyền hạn." />
        ) : detailQuery.isLoading && !detail ? (
          <QueryStateView kind="loading" compact title="Đang tải chi tiết phân quyền..." />
        ) : detailQuery.isError ? (
          <QueryStateView
            kind="error"
            compact
            description="Không thể tải chi tiết phân quyền."
            onRetry={() => {
              void detailQuery.refetch();
            }}
          />
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
                onChange={(event) => setChangeReason(event.target.value)}
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
                  onChange={setDraftRole}
                  allowClear
                />
                <div className="ds-admin-inline-actions">
                  <Button
                    type="primary"
                    disabled={!draftRole}
                    loading={roleMutation.isPending}
                    onClick={() => roleMutation.mutate()}
                  >
                    Lưu vai trò
                  </Button>
                  <Button
                    danger
                    disabled={!detail.role}
                    loading={deleteRoleMutation.isPending}
                    onClick={() => setRemoveRoleConfirmOpen(true)}
                  >
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
                    setDraftOverrides((current) => [
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
                          setDraftOverrides((current) =>
                            current.map((item) =>
                              item.id === override.id ? { ...item, permission: value } : item,
                            ),
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
                          setDraftOverrides((current) =>
                            current.map((item) =>
                              item.id === override.id ? { ...item, effect: value } : item,
                            ),
                          )
                        }
                      />
                      <Button
                        danger
                        onClick={() =>
                          setDraftOverrides((current) => current.filter((item) => item.id !== override.id))
                        }
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
                <Button type="primary" loading={overridesMutation.isPending} onClick={() => overridesMutation.mutate()}>
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

      <ConfirmDialog
        open={removeRoleConfirmOpen}
        title="Xóa vai trò DB chuẩn?"
        description="Thao tác này xóa phân công vai trò dựa trên DB cho operator đã chọn. Chỉ tiếp tục nếu đây là hành vi fallback mà bạn chủ đích."
        confirmText="Xóa vai trò"
        danger
        loading={deleteRoleMutation.isPending}
        onCancel={() => setRemoveRoleConfirmOpen(false)}
        onConfirm={() => deleteRoleMutation.mutate()}
      />
    </>
  );
};
