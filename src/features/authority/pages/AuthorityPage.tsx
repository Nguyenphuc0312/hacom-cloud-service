import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { authorityClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { AuthorityListItem, AuthorityOverrideEffect, Role } from '@/api/types';
import { QueryStateView } from '@/components/QueryStates';

const { Title, Text } = Typography;

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

const sourceColor: Record<string, string> = {
  db: 'blue',
  break_glass: 'gold',
};

export const AuthorityPage = () => {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<Exclude<Role, 'superadmin' | 'admin'> | undefined>();
  const [draftOverrides, setDraftOverrides] = useState<DraftOverride[]>([]);

  const params = useMemo(
    () => ({
      page: 1,
      limit: 20,
      keyword: keyword || undefined,
    }),
    [keyword],
  );

  const listQuery = useQuery({
    queryKey: queryKeys.authorityUsers(JSON.stringify(params)),
    queryFn: () => authorityClient.listUsers(params),
  });

  const detailQuery = useQuery({
    queryKey: selectedUserId ? queryKeys.authorityUserDetail(selectedUserId) : ['authority-user-detail-empty'],
    queryFn: () => authorityClient.getUser(selectedUserId ?? ''),
    enabled: Boolean(selectedUserId),
  });

  useEffect(() => {
    if (!detailQuery.data) {
      setDraftRole(undefined);
      setDraftOverrides([]);
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

  const refreshAuthorityData = async (userId?: string | null) => {
    await queryClient.invalidateQueries({ queryKey: ['authority-users'] });
    if (userId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.authorityUserDetail(userId) });
    }
  };

  const roleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId || !draftRole) {
        throw new Error('Chua chon role.');
      }

      return authorityClient.updateRole(selectedUserId, {
        role: draftRole,
      });
    },
    onSuccess: async () => {
      message.success('Da cap nhat role.');
      await refreshAuthorityData(selectedUserId);
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Cap nhat role that bai.');
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) {
        throw new Error('Chua chon user.');
      }

      return authorityClient.deleteRole(selectedUserId);
    },
    onSuccess: async () => {
      message.success('Da xoa role DB.');
      await refreshAuthorityData(selectedUserId);
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Xoa role that bai.');
    },
  });

  const overridesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) {
        throw new Error('Chua chon user.');
      }

      const overrides = draftOverrides
        .filter((override) => override.permission)
        .map((override) => ({
          permission: override.permission as string,
          effect: override.effect,
        }));

      return authorityClient.replaceOverrides(selectedUserId, {
        overrides,
      });
    },
    onSuccess: async () => {
      message.success('Da cap nhat overrides.');
      await refreshAuthorityData(selectedUserId);
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Cap nhat overrides that bai.');
    },
  });

  if (listQuery.isLoading && !listQuery.data) {
    return <QueryStateView kind="loading" title="Dang tai admin authority..." />;
  }

  if (listQuery.isError) {
    return (
      <QueryStateView kind="error" title="Khong the tai admin authority" onRetry={() => listQuery.refetch()} />
    );
  }

  const items = listQuery.data?.items ?? [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Admin Authority
        </Title>
        <Text type="secondary">
          DB canonical role va permission overrides cho admin accounts. Break-glass chi dung khi user chua co authority DB.
        </Text>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="Tim theo email hoac username"
            style={{ width: 320 }}
            onSearch={setKeyword}
          />
        </Space>

        <Table<AuthorityListItem>
          rowKey="userId"
          dataSource={items}
          pagination={false}
          onRow={(record) => ({
            onClick: () => setSelectedUserId(record.userId),
          })}
          columns={[
            {
              title: 'Email',
              dataIndex: 'email',
            },
            {
              title: 'User',
              dataIndex: 'username',
              render: (value: string | undefined) => value ?? '-',
            },
            {
              title: 'Role',
              dataIndex: 'role',
              render: (value: Role | null) => value ? <Tag color="purple">{value}</Tag> : <Tag>none</Tag>,
            },
            {
              title: 'Source',
              dataIndex: 'authoritySource',
              render: (value: string | null) =>
                value ? <Tag color={sourceColor[value] ?? 'default'}>{value}</Tag> : <Tag>none</Tag>,
            },
            {
              title: 'Effective Permissions',
              render: (_, record) => record.effectivePermissions.length,
            },
            {
              title: 'Overrides',
              dataIndex: 'overrideCount',
            },
          ]}
        />
      </Card>

      <Drawer
        width={860}
        title="Authority Detail"
        open={Boolean(selectedUserId)}
        onClose={() => setSelectedUserId(null)}
      >
        {detailQuery.isLoading || !detailQuery.data ? (
          <QueryStateView kind="loading" compact title="Dang tai authority detail..." />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Email">{detailQuery.data.user.email}</Descriptions.Item>
              <Descriptions.Item label="Username">{detailQuery.data.user.username ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Authority Source">
                {detailQuery.data.authoritySource ? (
                  <Tag color={sourceColor[detailQuery.data.authoritySource] ?? 'default'}>
                    {detailQuery.data.authoritySource}
                  </Tag>
                ) : (
                  <Tag>none</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="DB Role">
                {detailQuery.data.role ? <Tag color="purple">{detailQuery.data.role}</Tag> : <Tag>none</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Break-glass Eligible">
                {detailQuery.data.breakGlassEligible ? 'Yes' : 'No'}
              </Descriptions.Item>
            </Descriptions>

            <Card
              size="small"
              title="Canonical Role"
              extra={
                <Space>
                  <Button
                    type="primary"
                    onClick={() => roleMutation.mutate()}
                    loading={roleMutation.isPending}
                    disabled={!draftRole}
                  >
                    Save Role
                  </Button>
                  <Button
                    danger
                    onClick={() => deleteRoleMutation.mutate()}
                    loading={deleteRoleMutation.isPending}
                  >
                    Remove DB Role
                  </Button>
                </Space>
              }
            >
              <Select
                value={draftRole}
                onChange={setDraftRole}
                placeholder="Chon role DB"
                style={{ width: 240 }}
                options={ROLE_OPTIONS}
                allowClear
              />
            </Card>

            <Card size="small" title="Base Permissions">
              <Space wrap>
                {detailQuery.data.basePermissions.map((permission) => (
                  <Tag key={permission}>{permission}</Tag>
                ))}
                {detailQuery.data.basePermissions.length === 0 ? <Text type="secondary">Khong co.</Text> : null}
              </Space>
            </Card>

            <Card
              size="small"
              title="Permission Overrides"
              extra={
                <Space>
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
                    Add Override
                  </Button>
                  <Button
                    type="primary"
                    onClick={() => overridesMutation.mutate()}
                    loading={overridesMutation.isPending}
                  >
                    Save Overrides
                  </Button>
                </Space>
              }
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {draftOverrides.map((override) => (
                  <Space key={override.id} wrap>
                    <Select
                      value={override.permission}
                      style={{ width: 300 }}
                      placeholder="Permission"
                      options={PERMISSION_OPTIONS.map((permission) => ({
                        value: permission,
                        label: permission,
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
                      style={{ width: 120 }}
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
                        setDraftOverrides((current) => current.filter((item) => item.id !== override.id))
                      }
                    >
                      Remove
                    </Button>
                  </Space>
                ))}
                {draftOverrides.length === 0 ? (
                  <Text type="secondary">Khong co override. Luu danh sach rong de xoa het diff trong DB.</Text>
                ) : null}
              </Space>
            </Card>

            <Card size="small" title="Effective Permissions">
              <Space wrap>
                {detailQuery.data.effectivePermissions.map((permission) => (
                  <Tag key={permission} color="green">
                    {permission}
                  </Tag>
                ))}
                {detailQuery.data.effectivePermissions.length === 0 ? (
                  <Text type="secondary">Khong co effective permission.</Text>
                ) : null}
              </Space>
            </Card>
          </Space>
        )}
      </Drawer>
    </Space>
  );
};
