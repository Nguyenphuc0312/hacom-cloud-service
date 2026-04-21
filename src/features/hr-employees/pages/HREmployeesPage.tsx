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
import { FeatureDisabledNotice } from '@/components/FeatureDisabledNotice';
import { FilterBar } from '@/components/FilterBar';
import { PageShell } from '@/components/PageShell';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { isAdminWriteActionsEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/utils/date';
import { canManageHrEmployees } from '@/utils/role';
import { HrEmployeeDetailDrawer } from '../components/HrEmployeeDetailDrawer';
import { HrImportWizard } from '../components/HrImportWizard';
import { ProvisionAccountButton } from '../components/ProvisionAccountButton';

const statusOptions: Array<{ label: string; value: 'all' | HrEmployeeStatus }> = [
  { label: 'Mọi trạng thái', value: 'all' },
  { label: 'Đang hoạt động', value: 'ACTIVE' },
  { label: 'Không hoạt động', value: 'INACTIVE' },
  { label: 'Đã nghỉ việc', value: 'LEFT' },
  { label: 'Tạm ngưng', value: 'SUSPENDED' },
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
      message.success('Đã tạo hồ sơ nhân sự.');
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
      message.success('Đã cập nhật hồ sơ nhân sự.');
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
      message.success('Đã vô hiệu hóa hồ sơ nhân sự.');
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
      message.info('Các thao tác ghi của nhân sự đang bị tắt theo cấu hình phát hành.');
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
        message.info('Các thao tác ghi của nhân sự đang bị tắt theo cấu hình phát hành.');
        return;
      }

      Modal.confirm({
        title: 'Vô hiệu hóa hồ sơ nhân sự',
        content:
          'Thao tác này tuân theo ngữ nghĩa hiện tại của backend cho việc vô hiệu hóa hoặc xóa mềm. Chỉ tiếp tục khi bản ghi này cần rời khỏi danh sách đang hoạt động.',
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
        title: 'Mã nhân viên',
        dataIndex: 'employeeCode',
        render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        title: 'Họ tên từ HR',
        render: (_, record) => displayValue(record.fullNameFromHr || record.fullName),
      },
      {
        title: 'Email từ HR',
        render: (_, record) => displayValue(record.emailFromHr || record.email),
      },
      {
        title: 'Phòng ban',
        render: (_, record) => displayValue(record.departmentName || record.orgUnit),
      },
      {
        title: 'Mã đơn vị',
        dataIndex: 'unitCode',
        render: (value: string | null | undefined) => displayValue(value),
      },
      {
        title: 'Trạng thái cấp tài khoản',
        dataIndex: 'provisioningStatus',
        render: (value: HrEmployee['provisioningStatus']) => <StatusBadge status={value} />,
      },
      {
        title: 'Kích hoạt',
        dataIndex: 'activationStatus',
        render: (value: HrEmployee['activationStatus']) => <StatusBadge status={value} />,
      },
      {
        title: 'Người dùng liên kết',
        dataIndex: 'linkedUser',
        render: (value: HrEmployee['linkedUser']) => value?.loginIdentifier || value?.id || '-',
      },
      {
        title: 'Cập nhật lúc',
        dataIndex: 'updatedAt',
        render: (value: string | null) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: 'Cấp',
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
                label: 'Mở chi tiết',
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
                label: 'Vô hiệu hóa',
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
        title="Danh bạ nhân sự"
        description="Quản lý hồ sơ nhân viên, import và cấp tài khoản."
      >
        <QueryStateView kind="loading" title="Đang tải danh bạ nhân sự..." />
      </PageShell>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <PageShell
        title="Danh bạ nhân sự"
        description="Quản lý hồ sơ nhân viên, import và cấp tài khoản."
      >
        <QueryStateView
          kind="error"
          description="Không thể tải danh bạ nhân sự."
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
      title="Danh bạ nhân sự"
      description="Page này ưu tiên danh bạ và provisioning. Import và tạo mới chỉ là luồng phụ."
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
      {(!isAdminWriteActionsEnabled || !canManageHrEmployees(currentRole)) && (
        <FeatureDisabledNotice
          description={
            !isAdminWriteActionsEnabled
              ? 'Các thao tác ghi của nhân sự đang bị tắt theo cấu hình phát hành.'
              : 'Vai trò hiện tại của bạn chỉ có thể xem danh bạ, không thể tạo, sửa hoặc vô hiệu hóa hồ sơ.'
          }
        />
      )}

      <FilterBar>
        <Form form={filterForm} layout="inline" className="ds-toolbar-form" initialValues={{ status: 'all' }}>
          <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
            <Input allowClear placeholder="Tìm mã nhân viên, tên hoặc email" />
          </Form.Item>
          <Form.Item name="status" className="ds-toolbar-field ds-toolbar-field--md">
            <Select options={statusOptions} />
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
          <span>
            {data?.pagination.total ?? 0} nhân viên phù hợp
          </span>
          <span>
            {activeFilterCount > 0
              ? `${activeFilterCount} bộ lọc đang hoạt động`
              : 'Không có bộ lọc đang hoạt động'}
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

      <DataTableShell
        title="Hồ sơ nhân viên"
        meta="Bảng là trọng tâm. Import và tạo mới được đẩy xuống toolbar để page không biến thành super-screen."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">Đang hiển thị {data?.items.length ?? 0} dòng</span>
            <Button size="small" disabled={!canWriteHrActions} onClick={() => setImportOpen(true)}>
              Import file HR
            </Button>
            <Button size="small" disabled={!canWriteHrActions} onClick={openCreate}>
              Tạo thủ công
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
          emptyNode={<EmptyState description="Không có nhân viên nào khớp với bộ lọc hiện tại." />}
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
        title={creating ? 'Tạo hồ sơ nhân sự' : 'Sửa hồ sơ nhân sự'}
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
          <QueryStateView kind="loading" compact title="Đang tải chi tiết nhân viên..." />
        ) : !creating && detailQuery.isError ? (
          <QueryStateView kind="error" compact description="Không thể tải chi tiết nhân viên." />
        ) : (
          <Form<FormValues> form={editForm} layout="vertical" requiredMark={false}>
            <Form.Item
              name="employeeCode"
              label="Mã nhân viên"
              rules={[{ required: true, message: 'Mã nhân viên là bắt buộc.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="fullName"
              label="Họ tên"
              rules={[{ required: true, message: 'Họ tên là bắt buộc.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email', message: 'Nhập địa chỉ email hợp lệ.' }]}
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
              rules={[{ required: true, message: 'Trạng thái là bắt buộc.' }]}
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
