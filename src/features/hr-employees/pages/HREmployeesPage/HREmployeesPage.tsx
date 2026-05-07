import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { hrEmployeesClient } from '@/api/clients/hrEmployeesClient/hrEmployeesClient';
import { getErrorMessage } from '@/api/error/error';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { CreateHrEmployeePayload, HrEmployee, HrEmployeeListQuery, HrEmployeeStatus, UpdateHrEmployeePayload } from '@/api/types/hr-employees/hr-employees';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { FilterBar } from '@/components/FilterBar/FilterBar';
import { MetaCell } from '@/components/MetaCell/MetaCell';
import { PageShell } from '@/components/PageShell/PageShell';
import { EmptyState, QueryStateView } from '@/components/QueryStates/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { DataTable } from '@/components/ui/DataTable/DataTable';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags/featureFlags';
import { useAuthStore } from '@/store/authStore/authStore';
import { canManageHrEmployees } from '@/utils/role/role';
import { HrEmployeeDetailDrawer } from '../../components/HrEmployeeDetailDrawer/HrEmployeeDetailDrawer';
import { HrImportWizard } from '../../components/HrImportWizard/HrImportWizard';
import { ProvisionAccountButton } from '../../components/ProvisionAccountButton/ProvisionAccountButton';
import './HREmployeesPage.css';

const statusOptions: Array<{ label: string; value: 'all' | HrEmployeeStatus }> = [
  { label: 'Tất cả trạng thái', value: 'all' },
  { label: 'Hoạt động', value: 'ACTIVE' },
  { label: 'Ngừng hoạt động', value: 'INACTIVE' },
  { label: 'Đã nghỉ', value: 'LEFT' },
  { label: 'Tạm khóa', value: 'SUSPENDED' },
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
      message.success('Đã tạo hồ sơ nhân sự HR.');
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
      message.success('Đã cập nhật hồ sơ nhân sự HR.');
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
      message.success('Đã vô hiệu hồ sơ nhân sự HR.');
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
      message.info('Thao tác ghi HR đang bị tắt theo release hoặc vai trò hiện tại.');
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
        title: 'Vô hiệu hồ sơ nhân sự HR?',
        content:
          'Thao tác này đi theo cơ chế deactivate hoặc soft-delete của backend. Chỉ tiếp tục khi hồ sơ không còn thuộc luồng cấp tài khoản HR.',
        okText: 'Xác nhận',
        cancelText: 'Hủy',
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
        title: 'STT',
        key: 'rowNumber',
        width: 64,
        align: 'center',
        render: (_, __, index) =>
          ((listQuery.data?.pagination.page ?? params.page ?? 1) - 1) *
            (listQuery.data?.pagination.limit ?? params.limit ?? 20) +
          index +
          1,
      },
      {
        title: 'Nhân sự',
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
        title: 'Mã nhân viên',
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
        title: 'Phòng ban',
        width: 180,
        render: (_, record) => displayValue(record.departmentName || record.orgUnit),
      },
      {
        title: 'Mã đơn vị',
        dataIndex: 'unitCode',
        width: 120,
        render: (value: string | null | undefined) => displayValue(value),
      },
      {
        title: 'Chức danh',
        dataIndex: 'title',
        width: 160,
        render: (value: string | null | undefined) => displayValue(value),
      },
      {
        title: 'Tài khoản liên kết',
        dataIndex: 'linkedUser',
        width: 160,
        render: (value: HrEmployee['linkedUser']) =>
          value?.loginIdentifier || value?.id || <StatusBadge status="unlinked" />,
      },
      {
        title: 'Trạng thái',
        dataIndex: 'activationStatus',
        width: 132,
        render: (value: HrEmployee['activationStatus']) => <StatusBadge status={value} />,
      },
      {
        title: 'Cập nhật lúc',
        dataIndex: 'updatedAt',
        width: 160,
        render: (value: string | null) => <DateTimeCell value={value} />,
      },
      {
        title: 'Cấp tài khoản',
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
                label: 'Xem chi tiết',
                onClick: () => openDetail(record),
              },
              {
                key: 'edit',
                label: 'Sửa hồ sơ',
                disabled: !canWriteHrActions,
                onClick: () => openEdit(record),
              },
              {
                key: 'deactivate',
                label: 'Vô hiệu',
                danger: true,
                disabled: !canWriteHrActions,
                onClick: () => confirmRemove(record),
              },
            ]}
          />
        ),
      },
    ],
    [
      canWriteHrActions,
      confirmRemove,
      listQuery.data?.pagination.limit,
      listQuery.data?.pagination.page,
      params.limit,
      params.page,
      refreshHrViews,
    ],
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
        title="Nhân sự HR"
        description="Rà soát hồ sơ nhân sự đồng bộ từ HR và tài khoản liên kết."
      >
        <QueryStateView kind="loading" title="Đang tải nhân sự HR..." />
      </PageShell>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <PageShell
        title="Nhân sự HR"
        description="Rà soát hồ sơ nhân sự đồng bộ từ HR và tài khoản liên kết."
      >
        <QueryStateView
          kind="error"
          description="Không thể tải danh sách nhân sự HR."
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
      title="Nhân sự HR"
      description="Rà soát hồ sơ nhân sự đồng bộ từ HR và tài khoản liên kết."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<AppIcon name="refresh" size={14} />}
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
      <FilterBar className="hr-employees-page-filter">
        <Form
          form={filterForm}
          layout="inline"
          className="ds-toolbar-form"
          initialValues={{ status: 'all' }}
        >
          <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
            <Input allowClear placeholder="Tìm mã, tên hoặc email nhân sự..." />
          </Form.Item>
          <Form.Item name="status" className="ds-toolbar-field ds-toolbar-field--md">
            <Select options={statusOptions} aria-label="Lọc trạng thái nhân sự" />
          </Form.Item>
          <Form.Item className="ds-toolbar-field ds-toolbar-actions">
            <Space wrap>
              <Button type="primary" onClick={applyFilters}>
                Áp dụng
              </Button>
              <Button onClick={resetFilters}>Đặt lại</Button>
              <Button disabled={!canWriteHrActions} onClick={() => setImportOpen(true)}>
                Import file HR
              </Button>
              <Button disabled={!canWriteHrActions} onClick={openCreate}>
                Tạo thủ công
              </Button>
            </Space>
          </Form.Item>
        </Form>
        <div className="ds-filter-toolbar-meta">
          <span>{data?.pagination.total ?? 0} nhân sự</span>
          <span>
            {activeFilterCount > 0
              ? `${activeFilterCount} bộ lọc đang bật`
              : 'Chưa lọc'}
          </span>
          <span>
            Trang {data?.pagination.page ?? 1} /{' '}
            {Math.max(
              1,
              Math.ceil((data?.pagination.total ?? 0) / Math.max(data?.pagination.limit ?? 1, 1)),
            )}
          </span>
        </div>
      </FilterBar>

      <DataTableShell>
        <DataTable
          rowKey="id"
          columns={columns}
          minHeight={320}
          loading={listQuery.isFetching && !listQuery.isPending}
          dataSource={data?.items ?? []}
          emptyNode={
            <EmptyState description="Không có hồ sơ nhân sự khớp bộ lọc hiện tại." />
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
        title={creating ? 'Tạo hồ sơ nhân sự HR' : 'Sửa hồ sơ nhân sự HR'}
        okText={creating ? 'Tạo' : 'Lưu'}
        cancelText="Hủy"
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
          <QueryStateView kind="loading" compact title="Đang tải chi tiết nhân sự..." />
        ) : !creating && detailQuery.isError ? (
          <QueryStateView kind="error" compact description="Không thể tải chi tiết nhân sự." />
        ) : (
          <Form<FormValues> form={editForm} layout="vertical" requiredMark={false}>
            <Form.Item
              name="employeeCode"
              label="Mã nhân viên"
              rules={[{ required: true, message: 'Cần nhập mã nhân viên.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="fullName"
              label="Họ tên"
              rules={[{ required: true, message: 'Cần nhập họ tên.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email', message: 'Nhập email hợp lệ.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại">
              <Input />
            </Form.Item>
            <Form.Item name="orgUnit" label="Phòng ban">
              <Input />
            </Form.Item>
            <Form.Item name="title" label="Chức danh">
              <Input />
            </Form.Item>
            <Form.Item
              name="status"
              label="Trạng thái"
              rules={[{ required: true, message: 'Cần chọn trạng thái.' }]}
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
