import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { hrEmployeesClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type {
  CreateHrEmployeePayload,
  HrEmployee,
  HrEmployeeListQuery,
  HrEmployeeStatus,
  UpdateHrEmployeePayload,
} from '@/api/types';
import { AdminTable } from '@/components/AdminTable';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { FilterBar } from '@/components/FilterBar';
import { PageShell } from '@/components/PageShell';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/utils/date';
import { canManageHrEmployees } from '@/utils/role';
import { HrEmployeeDetailDrawer } from '../components/HrEmployeeDetailDrawer';
import { HrImportWizard } from '../components/HrImportWizard';
import { ProvisionAccountButton } from '../components/ProvisionAccountButton';

const statusOptions: Array<{ label: string; value: 'all' | HrEmployeeStatus }> = [
  { label: 'Any status', value: 'all' },
  { label: 'ACTIVE', value: 'ACTIVE' },
  { label: 'INACTIVE', value: 'INACTIVE' },
  { label: 'LEFT', value: 'LEFT' },
  { label: 'SUSPENDED', value: 'SUSPENDED' },
];

interface FormValues {
  employeeCode: string;
  email: string;
  fullName: string;
  phone?: string;
  orgUnit?: string;
  title?: string;
  status: HrEmployeeStatus;
}

const displayValue = (value?: string | null): string => value || '-';

export const HREmployeesPage = () => {
  const [filterForm] = Form.useForm();
  const [editForm] = Form.useForm<FormValues>();
  const queryClient = useQueryClient();
  const currentRole = useAuthStore((state) => state.user?.role);
  const canWriteHrActions = isAdminWriteActionsEnabled && canManageHrEmployees(currentRole);

  const [params, setParams] = useState<HrEmployeeListQuery>({
    page: 1,
    limit: 20,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const activeFilterCount = [params.keyword, params.status].filter(Boolean).length;

  const refreshHrViews = useCallback(
    async (employeeId?: string) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.hrEmployeesRoot });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });

      if (employeeId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.hrEmployeeDetail(employeeId) });
      }
    },
    [queryClient],
  );

  const listQuery = useQuery({
    queryKey: queryKeys.hrEmployeesList(JSON.stringify(params)),
    queryFn: () => hrEmployeesClient.list(params),
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.hrEmployeeDetail(editingId ?? ''),
    queryFn: () => hrEmployeesClient.getById(editingId ?? ''),
    enabled: Boolean(editingId) && editorOpen,
  });

  useEffect(() => {
    if (creating) {
      editForm.setFieldsValue({
        employeeCode: '',
        email: '',
        fullName: '',
        phone: '',
        orgUnit: '',
        title: '',
        status: 'ACTIVE',
      });
      return;
    }

    if (detailQuery.data) {
      editForm.setFieldsValue({
        employeeCode: detailQuery.data.employeeCode,
        email: detailQuery.data.email,
        fullName: detailQuery.data.fullName,
        phone: detailQuery.data.phone ?? undefined,
        orgUnit: detailQuery.data.orgUnit ?? undefined,
        title: detailQuery.data.title ?? undefined,
        status: detailQuery.data.status,
      });
    }
  }, [creating, detailQuery.data, editForm]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateHrEmployeePayload) => hrEmployeesClient.create(payload),
    onSuccess: () => {
      message.success('HR employee created.');
      setEditorOpen(false);
      setCreating(false);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hrEmployeesList(JSON.stringify(params)),
      });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateHrEmployeePayload) =>
      hrEmployeesClient.update(editingId ?? '', payload),
    onSuccess: () => {
      message.success('HR employee updated.');
      setEditorOpen(false);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hrEmployeesList(JSON.stringify(params)),
      });
      if (editingId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.hrEmployeeDetail(editingId) });
      }
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => hrEmployeesClient.remove(id),
    onSuccess: () => {
      message.success('HR employee deactivated.');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hrEmployeesList(JSON.stringify(params)),
      });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const submitEditor = async () => {
    const values = await editForm.validateFields();

    if (creating) {
      await createMutation.mutateAsync({
        employeeCode: values.employeeCode,
        email: values.email,
        fullName: values.fullName,
        phone: values.phone || undefined,
        orgUnit: values.orgUnit || undefined,
        title: values.title || undefined,
        status: values.status,
      });
      return;
    }

    await updateMutation.mutateAsync({
      employeeCode: values.employeeCode,
      email: values.email,
      fullName: values.fullName,
      phone: values.phone || undefined,
      orgUnit: values.orgUnit || undefined,
      title: values.title || undefined,
      status: values.status,
    });
  };

  const openCreate = () => {
    if (!canWriteHrActions) {
      message.info('HR write actions are disabled by release configuration.');
      return;
    }

    setCreating(true);
    setEditingId(null);
    setEditorOpen(true);
  };

  const openEdit = (employee: HrEmployee) => {
    setCreating(false);
    setEditingId(employee.id);
    setEditorOpen(true);
  };

  const openDetail = (employee: HrEmployee) => {
    setDetailId(employee.id);
    setDetailOpen(true);
  };

  const confirmRemove = useCallback(
    (employee: HrEmployee) => {
      if (!canWriteHrActions) {
        message.info('HR write actions are disabled by release configuration.');
        return;
      }

      Modal.confirm({
        title: 'Deactivate HR employee',
        content:
          'This follows the current backend semantics for deactivation or soft delete. Continue only when the record should leave the active roster.',
        okText: 'Confirm',
        cancelText: 'Cancel',
        onOk: async () => {
          await deleteMutation.mutateAsync(employee.id);
        },
      });
    },
    [canWriteHrActions, deleteMutation],
  );

  const columns = useMemo<ColumnsType<HrEmployee>>(
    () => [
      {
        title: 'Employee code',
        dataIndex: 'employeeCode',
        render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        title: 'HR full name',
        render: (_, record) => displayValue(record.fullNameFromHr || record.fullName),
      },
      {
        title: 'Email from HR',
        render: (_, record) => displayValue(record.emailFromHr || record.email),
      },
      {
        title: 'Department',
        render: (_, record) => displayValue(record.departmentName || record.orgUnit),
      },
      {
        title: 'Unit code',
        dataIndex: 'unitCode',
        render: (value: string | null | undefined) => displayValue(value),
      },
      {
        title: 'Provisioning',
        dataIndex: 'provisioningStatus',
        render: (value: HrEmployee['provisioningStatus']) => <StatusBadge status={value} />,
      },
      {
        title: 'Activation',
        dataIndex: 'activationStatus',
        render: (value: HrEmployee['activationStatus']) => <StatusBadge status={value} />,
      },
      {
        title: 'Linked user',
        dataIndex: 'linkedUser',
        render: (value: HrEmployee['linkedUser']) => value?.loginIdentifier || value?.id || '-',
      },
      {
        title: 'Updated at',
        dataIndex: 'updatedAt',
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: 'Provision',
        key: 'provision',
        width: 160,
        render: (_, record) => (
          <ProvisionAccountButton
            employee={record}
            canWrite={canWriteHrActions}
            onSuccess={() => refreshHrViews(record.id)}
          />
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
                onClick: () => openDetail(record),
              },
              {
                key: 'edit',
                label: 'Edit record',
                disabled: !canWriteHrActions,
                onClick: () => openEdit(record),
              },
              {
                key: 'deactivate',
                label: 'Deactivate',
                danger: true,
                disabled: !canWriteHrActions,
                onClick: () => confirmRemove(record),
              },
            ]}
          />
        ),
      },
    ],
    [canWriteHrActions, confirmRemove, refreshHrViews],
  );

  const applyFilters = () => {
    const values = filterForm.getFieldsValue() as {
      keyword?: string;
      status?: 'all' | HrEmployeeStatus;
    };
    setParams((prev) => ({
      ...prev,
      page: 1,
      keyword: values.keyword?.trim() || undefined,
      status: values.status && values.status !== 'all' ? values.status : undefined,
    }));
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setParams((prev) => ({
      ...prev,
      page: 1,
      keyword: undefined,
      status: undefined,
    }));
  };

  if (listQuery.isLoading) {
    return (
      <PageShell
        title="HR Directory"
        description="Manage employee records, import batches, and account provisioning from one consistent operator workspace."
      >
        <QueryStateView kind="loading" title="Loading HR directory..." />
      </PageShell>
    );
  }

  if (listQuery.isError) {
    return (
      <PageShell
        title="HR Directory"
        description="Manage employee records, import batches, and account provisioning from one consistent operator workspace."
      >
        <QueryStateView
          kind="error"
          description="Unable to load the HR directory."
          onRetry={() => {
            void listQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const data = listQuery.data;

  return (
    <PageShell
      title="HR Directory"
      description="Keep import, provisioning, and record maintenance in one place, while pushing destructive actions into controlled flows instead of cluttering every row."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <span className="ds-shell-chip">
              {data?.pagination.total ?? 0} matched employee{(data?.pagination.total ?? 0) === 1 ? '' : 's'}
            </span>
            <span className="ds-shell-chip ds-shell-chip--ghost">
              {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
            </span>
          </div>
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
            <Button disabled={!canWriteHrActions} onClick={() => setImportOpen(true)}>
              Import HR file
            </Button>
            <Button type="primary" disabled={!canWriteHrActions} onClick={openCreate}>
              New employee
            </Button>
          </div>
        </div>
      }
    >
      {(!isAdminWriteActionsEnabled || !canManageHrEmployees(currentRole)) && (
        <FeatureDisabledNotice
          description={
            !isAdminWriteActionsEnabled
              ? 'HR write actions are disabled by release configuration.'
              : 'Your current role can review the directory but cannot create, edit, or deactivate records.'
          }
        />
      )}

      <FilterBar>
        <div className="ds-toolbar-lead">
          <span className="ds-toolbar-eyebrow">Directory query</span>
          <strong className="ds-toolbar-title">Keep the roster easy to scan</strong>
          <span className="ds-toolbar-description">
            Filter by keyword and lifecycle state first. Open the drawer only when an operator actually needs detail or provisioning work.
          </span>
        </div>

        <Form form={filterForm} layout="inline" className="ds-toolbar-form" initialValues={{ status: 'all' }}>
          <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
            <Input allowClear placeholder="Search employee code, name, or email" />
          </Form.Item>
          <Form.Item name="status" className="ds-toolbar-field ds-toolbar-field--md">
            <Select options={statusOptions} />
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
      </FilterBar>

      <DataTableShell
        title="Employee records"
        meta={`${data?.pagination.total ?? 0} record(s) matched the current filters`}
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">
              <span className="ds-shell-chip ds-shell-chip--ghost">
                Page {data?.pagination.page ?? 1} of{' '}
                {Math.max(
                  1,
                  Math.ceil((data?.pagination.total ?? 0) / Math.max(data?.pagination.limit ?? 1, 1)),
                )}
              </span>
            </span>
          </DataTableToolbar>
        }
      >
        <AdminTable
          rowKey="id"
          columns={columns}
          minHeight={320}
          dataSource={data?.items ?? []}
          emptyNode={<EmptyState description="No HR employees matched the current filters." />}
          onRow={(record) => ({
            onClick: () => openDetail(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: data?.pagination.page,
            pageSize: data?.pagination.limit,
            total: data?.pagination.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              setParams((prev) => ({ ...prev, page, limit: pageSize }));
            },
          }}
        />
      </DataTableShell>

      <HrImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCommitted={() => refreshHrViews()}
      />

      <HrEmployeeDetailDrawer
        open={detailOpen}
        employeeId={detailId}
        canWrite={canWriteHrActions}
        onProvisioned={(employeeId) => refreshHrViews(employeeId)}
        onClose={() => setDetailOpen(false)}
      />

      <Modal
        open={editorOpen}
        title={creating ? 'Create HR employee' : 'Edit HR employee'}
        okText={creating ? 'Create' : 'Save'}
        cancelText="Cancel"
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        onCancel={() => {
          setEditorOpen(false);
          setCreating(false);
          setEditingId(null);
          editForm.resetFields();
        }}
        onOk={() => {
          void submitEditor();
        }}
      >
        {!creating && detailQuery.isLoading ? (
          <QueryStateView kind="loading" compact title="Loading employee detail..." />
        ) : !creating && detailQuery.isError ? (
          <QueryStateView kind="error" compact description="Unable to load employee detail." />
        ) : (
          <Form<FormValues> form={editForm} layout="vertical" requiredMark={false}>
            <Form.Item
              name="employeeCode"
              label="Employee code"
              rules={[{ required: true, message: 'Employee code is required.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="fullName"
              label="Full name"
              rules={[{ required: true, message: 'Full name is required.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email address.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input />
            </Form.Item>
            <Form.Item name="orgUnit" label="Department">
              <Input />
            </Form.Item>
            <Form.Item name="title" label="Title">
              <Input />
            </Form.Item>
            <Form.Item
              name="status"
              label="Status"
              rules={[{ required: true, message: 'Status is required.' }]}
            >
              <Select
                options={statusOptions
                  .filter((item) => item.value !== 'all')
                  .map((item) => ({
                    label: item.label,
                    value: item.value,
                  }))}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </PageShell>
  );
};
