import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { authorityClient } from '@/api/clients/authorityClient/authorityClient';
import { getErrorMessage } from '@/api/error/error';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { AuthorityOverrideEffect } from '@/api/types/authority/authority';
import type { Role } from '@/api/types/auth/auth';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar/DataTableToolbar';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { DataTable } from '@/components/ui/DataTable/DataTable';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { AuthorityDetailDrawer } from './components/AuthorityDetailDrawer';
import { AuthorityFilters } from './components/AuthorityFilters';
import type { DraftOverride } from './types/authorityPageTypes';
import { useAuthorityColumns } from './hooks/useAuthorityColumns';
import './AuthorityPage.css';

const pageHeader = {
  eyebrow: 'Danh tính và truy cập',
  title: 'Quyền và vai trò',
  description: 'Quản trị vai trò chuẩn, nguồn phân quyền và các override runtime trong cùng một workspace.',
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
          effect: override.effect as AuthorityOverrideEffect,
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

  const openDetail = useCallback((userId: string) => setSelectedUserId(userId), []);
  const columns = useAuthorityColumns(openDetail);

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
        <AuthorityFilters
          form={form}
          total={listQuery.data?.pagination.total ?? 0}
          activeFilterCount={activeFilterCount}
          dataUpdatedAt={listQuery.dataUpdatedAt}
          onApply={applyFilters}
          onReset={resetFilters}
        />

        <DataTableShell
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

      <AuthorityDetailDrawer
        open={Boolean(selectedUserId)}
        selectedUserId={selectedUserId}
        detail={detailQuery.data}
        isLoading={detailQuery.isLoading}
        isError={detailQuery.isError}
        draftRole={draftRole}
        draftOverrides={draftOverrides}
        changeReason={changeReason}
        roleSaving={roleMutation.isPending}
        roleDeleting={deleteRoleMutation.isPending}
        overridesSaving={overridesMutation.isPending}
        onClose={() => {
          setSelectedUserId(null);
          setChangeReason('');
          setRemoveRoleConfirmOpen(false);
        }}
        onRetry={() => {
          void detailQuery.refetch();
        }}
        onDraftRoleChange={setDraftRole}
        onDraftOverridesChange={setDraftOverrides}
        onChangeReasonChange={setChangeReason}
        onSaveRole={() => roleMutation.mutate()}
        onRequestDeleteRole={() => setRemoveRoleConfirmOpen(true)}
        onSaveOverrides={() => overridesMutation.mutate()}
      />

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
