import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { usersClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { AdminUser, Role, UsersListResponse } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { formatDateTime } from '@/utils/date';

const roleOptions: { label: string; value: Role }[] = [
  { label: 'superadmin', value: 'superadmin' },
  { label: 'admin', value: 'admin' },
  { label: 'viewer', value: 'viewer' },
];

const createUserSchema = z.object({
  email: z.string().email('Email không hợp lệ.'),
  role: z.enum(['superadmin', 'admin', 'viewer']),
  password: z.string().min(8, 'Password tối thiểu 8 ký tự.').optional().or(z.literal('')),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

export const AdminUsersPage = () => {
  const queryClient = useQueryClient();
  const [createForm] = Form.useForm<CreateUserFormValues>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: usersClient.getUsers,
  });

  const createUserMutation = useMutation({
    mutationFn: usersClient.createUser,
    onSuccess: () => {
      message.success('Tạo user thành công.');
      setCreateModalOpen(false);
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => usersClient.updateRole(id, { role }),
    onMutate: async ({ id, role }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users });
      const previousData = queryClient.getQueryData<UsersListResponse>(queryKeys.users);

      queryClient.setQueryData<UsersListResponse>(queryKeys.users, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((item) =>
            item.id === id ? { ...item, role, updatedAt: new Date().toISOString() } : item,
          ),
        };
      });

      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.users, context.previousData);
      }
      message.error(getErrorMessage(error));
    },
    onSuccess: () => message.success('Cập nhật role thành công.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => usersClient.resetPassword(id),
    onSuccess: (response) => {
      setTempPassword(response.tempPassword);
      message.success('Reset password thành công.');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersClient.deactivate(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users });
      const previousData = queryClient.getQueryData<UsersListResponse>(queryKeys.users);

      queryClient.setQueryData<UsersListResponse>(queryKeys.users, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((item) => (item.id === id ? { ...item, active: false } : item)),
        };
      });

      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.users, context.previousData);
      }
      message.error(getErrorMessage(error));
    },
    onSuccess: () => message.success('Deactivate user thành công.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });

  const columns = useMemo<ColumnsType<AdminUser>>(
    () => [
      {
        title: 'Email',
        dataIndex: 'email',
      },
      {
        title: 'Role',
        dataIndex: 'role',
        render: (role: Role, record) => (
          <Select
            value={role}
            options={roleOptions}
            style={{ width: 130 }}
            onChange={(nextRole) => updateRoleMutation.mutate({ id: record.id, role: nextRole })}
          />
        ),
      },
      {
        title: 'Status',
        dataIndex: 'active',
        render: (active: boolean) => (
          <Tag color={active ? 'green' : 'default'}>{active ? 'ACTIVE' : 'INACTIVE'}</Tag>
        ),
      },
      {
        title: 'Created At',
        dataIndex: 'createdAt',
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Updated At',
        dataIndex: 'updatedAt',
        render: (value?: string) => formatDateTime(value),
      },
      {
        title: 'Actions',
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => resetPasswordMutation.mutate(record.id)}>
              Reset password
            </Button>
            <Popconfirm
              title="Deactivate user"
              description="Bạn chắc chắn muốn deactivate user này?"
              okText="Deactivate"
              cancelText="Cancel"
              onConfirm={() => deactivateMutation.mutate(record.id)}
            >
              <Button size="small" danger disabled={!record.active}>
                Deactivate
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deactivateMutation, resetPasswordMutation, updateRoleMutation],
  );

  const submitCreateUser = () => {
    const values = createForm.getFieldsValue();
    const parsed = createUserSchema.safeParse(values);

    if (!parsed.success) {
      message.error(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
      return;
    }

    createUserMutation.mutate({
      email: parsed.data.email,
      role: parsed.data.role,
      password: parsed.data.password || undefined,
    });
  };

  if (usersQuery.isLoading) {
    return <LoadingState tip="Đang tải danh sách admin users..." />;
  }

  if (usersQuery.isError) {
    return <ErrorState subTitle="Không thể tải admin users." />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Admin Users"
        description="Quản lý user hệ thống admin"
        extra={
          <Button type="primary" onClick={() => setCreateModalOpen(true)}>
            Create user
          </Button>
        }
      />

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={usersQuery.data?.items ?? []}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <EmptyState description="Chưa có user quản trị" /> }}
        />
      </Card>

      <Modal
        title="Create Admin User"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={submitCreateUser}
        confirmLoading={createUserMutation.isPending}
      >
        <Form<CreateUserFormValues> form={createForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Email" name="email" rules={[{ required: true }]}>
            <Input placeholder="new-admin@company.com" />
          </Form.Item>
          <Form.Item label="Role" name="role" initialValue="viewer" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item label="Password (optional)" name="password">
            <Input.Password placeholder="Để trống nếu backend tự sinh password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Temporary Password"
        open={Boolean(tempPassword)}
        onCancel={() => setTempPassword(null)}
        footer={null}
      >
        <Typography.Paragraph>
          Temporary password: <Typography.Text copyable strong>{tempPassword}</Typography.Text>
        </Typography.Paragraph>
      </Modal>
    </Space>
  );
};
