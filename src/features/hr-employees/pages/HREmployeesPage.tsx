import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { AppIcon } from '@/components/AppIcon';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { DateTimeCell } from '@/components/DateTimeCell';
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { FilterBar } from '@/components/FilterBar';
import { MetaCell } from '@/components/MetaCell';
import { PageShell } from '@/components/PageShell';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { canManageHrEmployees } from '@/utils/role';
import { HrEmployeeDetailDrawer } from '../components/HrEmployeeDetailDrawer';
import { HrImportWizard } from '../components/HrImportWizard';
import { ProvisionAccountButton } from '../components/ProvisionAccountButton';

const statusOptions: Array<{ label: string; value: 'all' | HrEmployeeStatus }> = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Left', value: 'LEFT' },
  { label: 'Suspended', value: 'SUSPENDED' },
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
    queryKey: queryKeys.hrEmployeesList(params),
    queryFn: () => hrEmployeesClient.list(params),
    placeholderData: keepPreviousData,
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
      message.success('HR employee record created.');
      setEditorOpen(false);
      setCreating(false);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hrEmployeesRoot,
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
      message.success('HR employee record updated.');
      setEditorOpen(false);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hrEmployeesRoot,
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
      message.success('HR employee record deactivated.');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hrEmployeesRoot,
      });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const submitEditor = async () => {
    const values = await editForm.validateFields();

    const payload = {
      employeeCode: values.employeeCode,
      email: values.email,
      fullName: values.fullName,
      phone: values.phone || undefined,
      orgUnit: values.orgUnit || undefined,
      title: values.title || undefined,
      status: values.status,
    };

    if (creating) {
      await createMutation.mutateAsync(payload);
      return;
    }

    await updateMutation.mutateAsync(payload);
  };

  const openCreate = () => {
    if (!canWriteHrActions) {
      message.info('HR write actions are disabled for the current release or role.');
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
        message.info('HR write actions are disabled for the current release or role.');
        return;
      }

      Modal.confirm({
        title: 'Deactivate HR employee record?',
        content:
          'This follows the backend deactivate or soft-delete semantics. Continue only when this record should leave active HR provisioning flows.',
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
        title: 'Employee',
        key: 'employee',
        width: 220,
        render: (_, record) => (
          <MetaCell
            primary={displayValue(record.fullNameFromHr || record.fullName)}
            secondary={record.emailFromHr || record.email || record.employeeCode}
          />
        ),
      },
      {
        title: 'Employee Code',
        dataIndex: 'employeeCode',
        width: 132,
        render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        title: 'Email',
        width: 220,
        render: (_, record) => (
          <Typography.Text className="ds-table-text-truncate">
            {displayValue(record.emailFromHr || record.email)}
          </Typography.Text>
        ),
      },
      {
        title: 'Department',
        width: 180,
        render: (_, record) => displayValue(record.departmentName || record.orgUnit),
      },
      {
        title: 'Unit Code',
        dataIndex: 'unitCode',
        width: 120,
        render: (value: string | null | undefined) => displayValue(value),
      },
      {
        title: 'Job Title',
        dataIndex: 'title',
        width: 160,
        render: (value: string | null | undefined) => displayValue(value),
      },
      {
        title: 'Linked User',
        dataIndex: 'linkedUser',
        width: 160,
        render: (value: HrEmployee['linkedUser']) =>
          value?.loginIdentifier || value?.id || <StatusBadge status="unlinked" />,
      },
      {
        title: 'Status',
        dataIndex: 'activationStatus',
        width: 132,
        render: (value: HrEmployee['activationStatus']) => <StatusBadge status={value} />,
      },
      {
        title: 'Updated At',
        dataIndex: 'updatedAt',
        width: 160,
        render: (value: string | null) => <DateTimeCell value={value} />,
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
                label: 'Open details',
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

  if (listQuery.isPending && !listQuery.data) {
    return (
      <PageShell
        title="HR Employees"
        description="Review employee records synced from HR and linked user accounts."
      >
        <QueryStateView kind="loading" title="Loading HR employees..." />
      </PageShell>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <PageShell
        title="HR Employees"
        description="Review employee records synced from HR and linked user accounts."
      >
        <QueryStateView
          kind="error"
          description="Unable to load HR employees."
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
      title="HR Employees"
      description="Review employee records synced from HR and linked user accounts."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<AppIcon name="refresh" size={14} />}
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
      {(!isAdminWriteActionsEnabled || !canManageHrEmployees(currentRole)) && (
        <FeatureDisabledNotice
          description={
            !isAdminWriteActionsEnabled
              ? 'HR write actions are disabled by the current release configuration.'
              : 'Your current role can review HR employees but cannot create, edit, or deactivate records.'
          }
        />
      )}

      <FilterBar>
        <Form
          form={filterForm}
          layout="inline"
          className="ds-toolbar-form"
          initialValues={{ status: 'all' }}
        >
          <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
            <Input allowClear placeholder="Search employee code, name, or email" />
          </Form.Item>
          <Form.Item name="status" className="ds-toolbar-field ds-toolbar-field--md">
            <Select options={statusOptions} aria-label="Employee status filter" />
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
          <span>{data?.pagination.total ?? 0} employees</span>
          <span>
            {activeFilterCount > 0
              ? `${activeFilterCount} active filters`
              : 'No active filters'}
          </span>
          <span>
            Page {data?.pagination.page ?? 1} /{' '}
            {Math.max(
              1,
              Math.ceil((data?.pagination.total ?? 0) / Math.max(data?.pagination.limit ?? 1, 1)),
            )}
          </span>
        </div>
      </FilterBar>

      <DataTableShell
        title="Employee Records"
        meta="Backend-backed HR records with compact account-link and provisioning actions."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">Showing {data?.items.length ?? 0} rows</span>
            <Button size="small" disabled={!canWriteHrActions} onClick={() => setImportOpen(true)}>
              Import HR file
            </Button>
            <Button size="small" disabled={!canWriteHrActions} onClick={openCreate}>
              Create manually
            </Button>
          </DataTableToolbar>
        }
      >
        <DataTable
          rowKey="id"
          columns={columns}
          minHeight={320}
          loading={listQuery.isFetching && !listQuery.isPending}
          dataSource={data?.items ?? []}
          emptyNode={
            <EmptyState description="No employee records match the current filters." />
          }
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
        title={creating ? 'Create HR employee record' : 'Edit HR employee record'}
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
          <QueryStateView kind="loading" compact title="Loading employee details..." />
        ) : !creating && detailQuery.isError ? (
          <QueryStateView kind="error" compact description="Unable to load employee details." />
        ) : (
          <Form<FormValues> form={editForm} layout="vertical" requiredMark={false}>
            <Form.Item
              name="employeeCode"
              label="Employee Code"
              rules={[{ required: true, message: 'Employee code is required.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="fullName"
              label="Full Name"
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
            <Form.Item name="title" label="Job Title">
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
