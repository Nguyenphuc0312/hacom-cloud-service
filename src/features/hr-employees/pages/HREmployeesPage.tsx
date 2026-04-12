import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';

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
import { FilterBar } from '@/components/FilterBar';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/utils/date';
import { canManageHrEmployees } from '@/utils/role';
import { HrEmployeeDetailDrawer } from '../components/HrEmployeeDetailDrawer';
import { HrImportWizard } from '../components/HrImportWizard';
import { ProvisionAccountButton } from '../components/ProvisionAccountButton';

const statusOptions: Array<{ label: string; value: 'all' | HrEmployeeStatus }> = [
  { label: 'Tat ca status', value: 'all' },
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
      message.success('Da tao HR employee.');
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
      message.success('Da cap nhat HR employee.');
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
      message.success('Da xu ly deactivate/delete HR employee.');
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

  const confirmRemove = (employee: HrEmployee) => {
    if (!canWriteHrActions) {
      message.info('HR write actions are disabled by release configuration.');
      return;
    }

    Modal.confirm({
      title: 'Deactivate/Delete HR employee',
      content:
        'Hanh dong nay tuan theo semantics backend hien tai (deactivate hoac soft delete).',
      okText: 'Confirm',
      cancelText: 'Cancel',
      onOk: async () => {
        await deleteMutation.mutateAsync(employee.id);
      },
    });
  };

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
        title: 'Provisioning status',
        dataIndex: 'provisioningStatus',
        render: (value: HrEmployee['provisioningStatus']) => <StatusBadge status={value} />,
      },
      {
        title: 'Activation status',
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
        title: 'Actions',
        key: 'actions',
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                openDetail(record);
              }}
            >
              Detail
            </Button>
            <ProvisionAccountButton
              employee={record}
              canWrite={canWriteHrActions}
              onSuccess={() =>
                queryClient.invalidateQueries({
                  queryKey: queryKeys.hrEmployeesList(JSON.stringify(params)),
                })
              }
            />
            <Button
              size="small"
              disabled={!canWriteHrActions}
              onClick={(event) => {
                event.stopPropagation();
                openEdit(record);
              }}
            >
              Edit
            </Button>
            <Button
              size="small"
              danger
              disabled={!canWriteHrActions}
              onClick={(event) => {
                event.stopPropagation();
                confirmRemove(record);
              }}
            >
              Deactivate
            </Button>
          </Space>
        ),
      },
    ],
    [canWriteHrActions, params, queryClient],
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

  if (listQuery.isLoading) {
    return <LoadingState tip="Dang tai HR employees..." />;
  }

  if (listQuery.isError) {
    return (
      <ErrorState
        subTitle="Khong the tai danh sach HR employees."
        extra={<Button onClick={() => listQuery.refetch()}>Thu lai</Button>}
      />
    );
  }

  const data = listQuery.data;

  return (
    <PageShell
      title="HR Employees"
      description="Quan ly nhan su, import tu HR va cap tai khoan theo release-safe flow."
      headerExtra={
        <Space>
          <Button disabled={!canWriteHrActions} onClick={() => setImportOpen(true)}>
            Import HR file
          </Button>
          <Button type="primary" disabled={!canWriteHrActions} onClick={openCreate}>
            Tao HR employee
          </Button>
        </Space>
      }
    >
      {(!isAdminWriteActionsEnabled || !canManageHrEmployees(currentRole)) && (
        <Card>
          <Typography.Text type="secondary">
            {!isAdminWriteActionsEnabled
              ? 'HR write actions are disabled by release configuration.'
              : 'Role hien tai khong co quyen create/update/deactivate HR employee.'}
          </Typography.Text>
        </Card>
      )}

      <FilterBar>
        <Form form={filterForm} layout="inline" initialValues={{ status: 'all' }}>
          <Form.Item name="keyword">
            <Input allowClear placeholder="Tim ma nhan su, ten, email" style={{ width: 280 }} />
          </Form.Item>
          <Form.Item name="status">
            <Select style={{ width: 180 }} options={statusOptions} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={applyFilters}>
                Ap dung
              </Button>
              <Button
                onClick={() => {
                  filterForm.resetFields();
                  setParams((prev) => ({
                    ...prev,
                    page: 1,
                    keyword: undefined,
                    status: undefined,
                  }));
                }}
              >
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </FilterBar>

      <DataTableShell
        title="HR employees"
        meta={`${data?.pagination.total ?? 0} record(s) matched current filters`}
      >
        <AdminTable
          rowKey="id"
          columns={columns}
          minHeight={320}
          dataSource={data?.items ?? []}
          emptyNode={<EmptyState description="Khong co HR employee phu hop." />}
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

      <HrImportWizard open={importOpen} onClose={() => setImportOpen(false)} />

      <HrEmployeeDetailDrawer
        open={detailOpen}
        employeeId={detailId}
        canWrite={canWriteHrActions}
        onClose={() => setDetailOpen(false)}
      />

      <Modal
        open={editorOpen}
        title={creating ? 'Tao HR employee' : 'Edit HR employee'}
        okText={creating ? 'Tao' : 'Luu'}
        cancelText="Huy"
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
          <LoadingState tip="Dang tai chi tiet HR employee..." />
        ) : !creating && detailQuery.isError ? (
          <ErrorState subTitle="Khong tai duoc chi tiet HR employee." />
        ) : (
          <Form<FormValues> form={editForm} layout="vertical" requiredMark={false}>
            <Form.Item
              name="employeeCode"
              label="Employee code"
              rules={[{ required: true, message: 'Bat buoc' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="fullName"
              label="Full name"
              rules={[{ required: true, message: 'Bat buoc' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email', message: 'Email khong hop le' }]}
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
              rules={[{ required: true, message: 'Bat buoc' }]}
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
