import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
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
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { formatDateTime } from '@/utils/date';

const statusOptions: Array<{ label: string; value: 'all' | HrEmployeeStatus }> = [
  { label: 'Tất cả status', value: 'all' },
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

export const HREmployeesPage = () => {
  const [filterForm] = Form.useForm();
  const [editForm] = Form.useForm<FormValues>();
  const queryClient = useQueryClient();

  const [params, setParams] = useState<HrEmployeeListQuery>({
    page: 1,
    limit: 20,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
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
      message.success('Đã tạo HR employee.');
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
      message.success('Đã cập nhật HR employee.');
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
      message.success('Đã xử lý deactivate/delete HR employee.');
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
    setCreating(true);
    setEditingId(null);
    setEditorOpen(true);
  };

  const openEdit = (employee: HrEmployee) => {
    setCreating(false);
    setEditingId(employee.id);
    setEditorOpen(true);
  };

  const confirmRemove = useCallback(
    (employee: HrEmployee) => {
      Modal.confirm({
        title: 'Deactivate/Delete HR employee',
        content:
          'Hành động này tuân theo semantics backend (deactivate hoặc soft delete). Dữ liệu có thể không bị xóa cứng.',
        okText: 'Xác nhận',
        cancelText: 'Hủy',
        onOk: async () => {
          await deleteMutation.mutateAsync(employee.id);
        },
      });
    },
    [deleteMutation],
  );

  const columns = useMemo<ColumnsType<HrEmployee>>(
    () => [
      {
        title: 'Employee code',
        dataIndex: 'employeeCode',
        render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        title: 'Họ tên',
        dataIndex: 'fullName',
      },
      {
        title: 'Email',
        dataIndex: 'email',
      },
      {
        title: 'Org unit',
        dataIndex: 'orgUnit',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        render: (value: HrEmployeeStatus) => {
          if (value === 'ACTIVE') return <Tag color="green">ACTIVE</Tag>;
          if (value === 'INACTIVE') return <Tag color="default">INACTIVE</Tag>;
          if (value === 'SUSPENDED') return <Tag color="red">SUSPENDED</Tag>;
          return <Tag color="gold">LEFT</Tag>;
        },
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
            <Button size="small" onClick={() => openEdit(record)}>
              Xem/Sửa
            </Button>
            <Button size="small" danger onClick={() => confirmRemove(record)}>
              Deactivate
            </Button>
          </Space>
        ),
      },
    ],
    [confirmRemove],
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
    return <LoadingState tip="Đang tải HR employees..." />;
  }

  if (listQuery.isError) {
    return (
      <ErrorState
        subTitle="Không thể tải danh sách HR employees."
        extra={<Button onClick={() => listQuery.refetch()}>Thử lại</Button>}
      />
    );
  }

  const data = listQuery.data;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="HR Employees"
        description="CRUD tối thiểu cho hồ sơ nhân sự theo contract backend thực tế"
        extra={
          <Button type="primary" onClick={openCreate}>
            Tạo HR employee
          </Button>
        }
      />

      <Card>
        <Form form={filterForm} layout="inline" initialValues={{ status: 'all' }}>
          <Form.Item name="keyword">
            <Input allowClear placeholder="Tìm mã nhân sự, tên, email" style={{ width: 280 }} />
          </Form.Item>
          <Form.Item name="status">
            <Select style={{ width: 180 }} options={statusOptions} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={applyFilters}>
                Áp dụng
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
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          locale={{ emptyText: <EmptyState description="Không có HR employee phù hợp." /> }}
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
      </Card>

      <Modal
        open={editorOpen}
        title={creating ? 'Tạo HR employee' : 'Chi tiết/Sửa HR employee'}
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
          <LoadingState tip="Đang tải chi tiết HR employee..." />
        ) : !creating && detailQuery.isError ? (
          <ErrorState subTitle="Không tải được chi tiết HR employee." />
        ) : (
          <Form<FormValues> form={editForm} layout="vertical" requiredMark={false}>
            <Form.Item
              name="employeeCode"
              label="Employee code"
              rules={[{ required: true, message: 'Bắt buộc' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="fullName"
              label="Họ tên"
              rules={[{ required: true, message: 'Bắt buộc' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email', message: 'Email không hợp lệ' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại">
              <Input />
            </Form.Item>
            <Form.Item name="orgUnit" label="Bộ phận">
              <Input />
            </Form.Item>
            <Form.Item name="title" label="Chức danh">
              <Input />
            </Form.Item>
            <Form.Item
              name="status"
              label="Status"
              rules={[{ required: true, message: 'Bắt buộc' }]}
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
    </Space>
  );
};
