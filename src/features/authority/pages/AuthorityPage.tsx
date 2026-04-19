import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Select, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';

import { authorityClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { AuthorityListItem, AuthorityOverrideEffect, Role } from '@/api/types';
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
  { label: 'Super Admin', value: 'super_admin' },
  { label: 'Operator', value: 'operator' },
  { label: 'Viewer', value: 'viewer' },
  { label: 'HR Admin', value: 'hr_admin' },
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

const formatRoleLabel = (role: Role | null | undefined) => {
  if (!role) return 'No DB role';
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
        throw new Error('Select a canonical role before saving.');
      }

      return authorityClient.updateRole(selectedUserId, {
        role: draftRole,
        reason: changeReason.trim() || undefined,
      });
    },
    onSuccess: async () => {
      message.success('Canonical role updated.');
      await refreshAuthorityData(selectedUserId);
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) {
        throw new Error('Select a user before removing the DB role.');
      }

      return authorityClient.deleteRole(selectedUserId, changeReason.trim() || undefined);
    },
    onSuccess: async () => {
      message.success('DB role removed.');
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
        throw new Error('Select a user before saving overrides.');
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
      message.success('Overrides updated.');
      await refreshAuthorityData(selectedUserId);
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const columns = useMemo<ColumnsType<AuthorityListItem>>(
    () => [
      {
        title: 'Account',
        key: 'account',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.email}</strong>
            <span>{record.username ?? 'No username'}</span>
          </div>
        ),
      },
      {
        title: 'Canonical role',
        dataIndex: 'role',
        width: 160,
        render: (value: Role | null) => (
          <span className="ds-shell-chip ds-shell-chip--ghost">{formatRoleLabel(value)}</span>
        ),
      },
      {
        title: 'Authority source',
        dataIndex: 'authoritySource',
        width: 160,
        render: (value: string | null) =>
          value ? (
            <span
              className={`ds-shell-chip ${sourceTone[value] === 'warning' ? 'ds-shell-chip--warning' : 'ds-shell-chip--ghost'}`}
            >
              {value.replace(/_/g, ' ')}
            </span>
          ) : (
            '-'
          ),
      },
      {
        title: 'Effective permissions',
        key: 'permissions',
        width: 140,
        render: (_, record) => record.effectivePermissions.length,
      },
      {
        title: 'Overrides',
        dataIndex: 'overrideCount',
        width: 110,
      },
      {
        title: 'Effective window',
        key: 'window',
        render: (_, record) => (
          <span>
            {record.effectiveFrom ? formatDateTime(record.effectiveFrom) : 'Now'} →{' '}
            {record.effectiveUntil ? formatDateTime(record.effectiveUntil) : 'Open-ended'}
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
                label: 'Open detail',
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

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <PageShell
        title="Admin Authority"
        description="Review canonical roles, break-glass posture, and permission overrides."
      >
        <QueryStateView kind="loading" title="Loading authority workspace..." />
      </PageShell>
    );
  }

  if (listQuery.isError) {
    return (
      <PageShell
        title="Admin Authority"
        description="Review canonical roles, break-glass posture, and permission overrides."
      >
        <QueryStateView
          kind="error"
          description="Unable to load authority records."
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
        title="Admin Authority"
        description="Keep canonical role, authority source, and effective permissions visible in one governance workspace."
        headerExtra={
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching}
              onClick={() => {
                void listQuery.refetch();
              }}
            >
              Refresh
            </Button>
          </div>
        }
      >
        <FilterBar>
          <Form form={form} layout="inline" className="ds-toolbar-form">
            <Form.Item
              label="Search"
              name="keyword"
              className="ds-toolbar-field ds-toolbar-field--lg"
            >
              <Input allowClear placeholder="Email or username" />
            </Form.Item>
            <Form.Item className="ds-toolbar-field ds-toolbar-actions">
              <Space>
                <Button type="primary" onClick={applyFilters}>
                  Apply filters
                </Button>
                <Button onClick={resetFilters}>Reset</Button>
              </Space>
            </Form.Item>
          </Form>
          <div className="ds-filter-toolbar-meta">
            <span>
              {listQuery.data?.pagination.total ?? 0} authority record
              {(listQuery.data?.pagination.total ?? 0) === 1 ? '' : 's'}
            </span>
            <span>
              {activeFilterCount > 0
                ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}`
                : 'No active filters'}
            </span>
            <span>
              Last sync:{' '}
              {listQuery.dataUpdatedAt
                ? formatDateTime(new Date(listQuery.dataUpdatedAt).toISOString())
                : '-'}
            </span>
          </div>
        </FilterBar>

        <DataTableShell
          title="Authority assignments"
          meta="Use the list to find the operator quickly, then open detail for role and override changes."
          toolbar={
            <DataTableToolbar>
              <span className="ds-toolbar-summary">
                Page {listQuery.data?.pagination.page ?? 1} of{' '}
                {listQuery.data?.pagination.totalPages ?? 1}
              </span>
            </DataTableToolbar>
          }
        >
          <DataTable
            rowKey="userId"
            columns={columns}
            minHeight={360}
            dataSource={listQuery.data?.items ?? []}
            emptyNode={<EmptyState description="No authority records matched the current filter." />}
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
        title="Authority detail"
        width={920}
      >
        {!selectedUserId ? (
          <EmptyState description="Select an authority record to inspect permissions." />
        ) : detailQuery.isLoading && !detail ? (
          <QueryStateView kind="loading" compact title="Loading authority detail..." />
        ) : detailQuery.isError ? (
          <QueryStateView
            kind="error"
            compact
            description="Unable to load authority detail."
            onRetry={() => {
              void detailQuery.refetch();
            }}
          />
        ) : !detail ? (
          <EmptyState description="Authority detail is unavailable." />
        ) : (
          <div className="ds-settings-stack">
            <div className="ds-detail-overview-grid">
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Authority source</span>
                <strong className="ds-summary-tile-value">
                  {detail.authoritySource ? detail.authoritySource.replace(/_/g, ' ') : 'none'}
                </strong>
                <span className="ds-summary-tile-meta">Current authority resolution path.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">DB role</span>
                <strong className="ds-summary-tile-value">{formatRoleLabel(detail.role)}</strong>
                <span className="ds-summary-tile-meta">Canonical role stored in the authority DB.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Overrides</span>
                <strong className="ds-summary-tile-value">{detail.overrides.length}</strong>
                <span className="ds-summary-tile-meta">Grant or deny diffs applied on top of the base role.</span>
              </div>
              <div className="ds-summary-tile">
                <span className="ds-summary-tile-label">Effective permissions</span>
                <strong className="ds-summary-tile-value">{detail.effectivePermissions.length}</strong>
                <span className="ds-summary-tile-meta">Permissions the runtime will currently honor.</span>
              </div>
            </div>

            <SurfaceCard
              eyebrow="Identity"
              title={detail.user.email}
              description="Review the operator identity and authority timing before editing roles or overrides."
            >
              <div className="ds-detail-list">
                <div className="ds-detail-list-item">
                  <span>Username</span>
                  <strong>{detail.user.username ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Authority source</span>
                  <strong>{detail.authoritySource ?? '-'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Effective from</span>
                  <strong>{detail.effectiveFrom ? formatDateTime(detail.effectiveFrom) : 'Now'}</strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Effective until</span>
                  <strong>
                    {detail.effectiveUntil ? formatDateTime(detail.effectiveUntil) : 'Open-ended'}
                  </strong>
                </div>
                <div className="ds-detail-list-item">
                  <span>Break-glass eligible</span>
                  <strong>{detail.breakGlassEligible ? 'Yes' : 'No'}</strong>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Change log reason"
              title="Operator note"
              description="Use a reason whenever you change the canonical role or override list so later reviewers understand why the change happened."
            >
              <Input.TextArea
                rows={3}
                value={changeReason}
                placeholder="Reason for this authority change"
                onChange={(event) => setChangeReason(event.target.value)}
              />
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Canonical role"
              title="DB-backed role assignment"
              description="Keep the base role explicit. Remove the DB role only when you intentionally want break-glass or no authority source to take over."
            >
              <div className="ds-admin-form-grid">
                <Select
                  value={draftRole}
                  placeholder="Select canonical role"
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
                    Save role
                  </Button>
                  <Button
                    danger
                    disabled={!detail.role}
                    loading={deleteRoleMutation.isPending}
                    onClick={() => setRemoveRoleConfirmOpen(true)}
                  >
                    Remove DB role
                  </Button>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Permission overrides"
              title="Grant / deny diffs"
              description="Use overrides sparingly. Prefer the base role when possible, and keep the diff set short enough to review quickly."
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
                  Add override
                </Button>
              }
            >
              {draftOverrides.length > 0 ? (
                <div className="ds-admin-override-list">
                  {draftOverrides.map((override) => (
                    <div key={override.id} className="ds-admin-override-row">
                      <Select
                        value={override.permission}
                        placeholder="Permission"
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
                          { label: 'Grant', value: 'grant' },
                          { label: 'Deny', value: 'deny' },
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
                          setDraftOverrides((current) =>
                            current.filter((item) => item.id !== override.id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  title="No overrides configured"
                  description="Save an empty list when you want the DB diff set cleared."
                />
              )}

              <div className="ds-settings-action-bar">
                <div className="ds-settings-action-copy">
                  Overrides apply on top of the canonical role. A deny should be rare and explicitly justified.
                </div>
                <Button type="primary" loading={overridesMutation.isPending} onClick={() => overridesMutation.mutate()}>
                  Save overrides
                </Button>
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Effective permissions"
              title="Runtime permission set"
              description="This is the final permission set the admin panel should honor after role plus overrides are resolved."
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
                <EmptyState compact description="No effective permissions were returned." />
              )}
            </SurfaceCard>
          </div>
        )}
      </AppDrawer>

      <ConfirmDialog
        open={removeRoleConfirmOpen}
        title="Remove canonical DB role?"
        description="This removes the DB-backed role assignment for the selected operator. Continue only if that fallback behavior is intentional."
        confirmText="Remove role"
        danger
        loading={deleteRoleMutation.isPending}
        onCancel={() => setRemoveRoleConfirmOpen(false)}
        onConfirm={() => deleteRoleMutation.mutate()}
      />
    </>
  );
};
