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
import { useMemo, useState } from 'react';

import { accessClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { AccessRequestListItem } from '@/api/types';
import { QueryStateView } from '@/components/QueryStates';

const { Title, Text } = Typography;

const statusColors: Record<string, string> = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
  revoked: 'volcano',
  expired: 'default',
};

export const AccessRequestsPage = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | undefined>('pending');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      status,
      ip: keyword || undefined,
      email: keyword || undefined,
    }),
    [keyword, status],
  );

  const listQuery = useQuery({
    queryKey: queryKeys.accessIpRequests(JSON.stringify(params)),
    queryFn: () => accessClient.listRequests(params),
  });

  const detailQuery = useQuery({
    queryKey: selectedId ? queryKeys.accessIpRequestDetail(selectedId) : ['access-ip-request-detail-empty'],
    queryFn: () => accessClient.getRequestDetail(selectedId ?? ''),
    enabled: Boolean(selectedId),
  });

  const historyQuery = useQuery({
    queryKey: selectedId ? queryKeys.accessIpRequestHistory(selectedId) : ['access-ip-request-history-empty'],
    queryFn: () => accessClient.getRequestHistory(selectedId ?? ''),
    enabled: Boolean(selectedId),
  });

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['access-ip-requests'] });
    if (selectedId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accessIpRequestDetail(selectedId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.accessIpRequestHistory(selectedId) });
    }
  };

  const actionMutation = useMutation({
    mutationFn: async ({
      action,
      id,
    }: {
      action: 'approve' | 'reject' | 'revoke';
      id: string;
    }) => {
      if (action === 'approve') {
        return accessClient.approveRequest(id, {});
      }
      if (action === 'reject') {
        return accessClient.rejectRequest(id, { reason: 'Rejected from admin panel' });
      }
      return accessClient.revokeRequest(id, { reason: 'Revoked from admin panel' });
    },
    onSuccess: async () => {
      message.success('Cap nhat thanh cong.');
      await refreshAll();
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Cap nhat that bai.');
    },
  });

  if (listQuery.isLoading && !listQuery.data) {
    return <QueryStateView kind="loading" title="Dang tai danh sach IP requests..." />;
  }

  if (listQuery.isError) {
    return (
      <QueryStateView
        kind="error"
        title="Khong the tai danh sach IP requests"
        onRetry={() => listQuery.refetch()}
      />
    );
  }

  const items = listQuery.data?.items ?? [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          IP Access Requests
        </Title>
        <Text type="secondary">
          Theo doi IP pending/approved/rejected/revoked cho admin host.
        </Text>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 180 }}
            allowClear
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'revoked', label: 'Revoked' },
              { value: 'expired', label: 'Expired' },
            ]}
          />
          <Input.Search
            allowClear
            placeholder="Tim theo IP hoac email"
            onSearch={setKeyword}
            style={{ width: 280 }}
          />
        </Space>

        <Table<AccessRequestListItem>
          rowKey="id"
          dataSource={items}
          pagination={false}
          onRow={(record) => ({
            onClick: () => setSelectedId(record.id),
          })}
          columns={[
            {
              title: 'IP',
              dataIndex: 'normalizedIp',
            },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (value: string) => <Tag color={statusColors[value] ?? 'default'}>{value}</Tag>,
            },
            {
              title: 'Users',
              dataIndex: 'requestUserCount',
            },
            {
              title: 'Last Seen',
              dataIndex: 'lastSeenAt',
            },
            {
              title: 'Risk',
              render: (_, record) => (
                <Space>
                  {record.risk.sharedIp ? <Tag color="orange">shared</Tag> : null}
                  {record.risk.expiringSoon ? <Tag color="gold">expiring</Tag> : null}
                </Space>
              ),
            },
            {
              title: 'Actions',
              render: (_, record) => (
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      actionMutation.mutate({ action: 'approve', id: record.id });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={(event) => {
                      event.stopPropagation();
                      actionMutation.mutate({ action: 'reject', id: record.id });
                    }}
                  >
                    Reject
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title="IP Request Detail"
        width={720}
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
      >
        {detailQuery.isLoading || !detailQuery.data ? (
          <QueryStateView kind="loading" compact title="Dang tai chi tiet..." />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="IP">{detailQuery.data.normalizedIp}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColors[detailQuery.data.status] ?? 'default'}>
                  {detailQuery.data.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Scope">{detailQuery.data.scope}</Descriptions.Item>
              <Descriptions.Item label="Reason">{detailQuery.data.reason ?? 'Khong co'}</Descriptions.Item>
              <Descriptions.Item label="Note">{detailQuery.data.note ?? 'Khong co'}</Descriptions.Item>
              <Descriptions.Item label="Forwarded Chain">
                {detailQuery.data.lastForwardedChain.join(', ') || 'Khong co'}
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="Linked Users">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {detailQuery.data.linkedUsers.map((user) => (
                  <Text key={user.userId}>
                    {user.email ?? user.username ?? user.userId} - {user.lastSeenAt}
                  </Text>
                ))}
              </Space>
            </Card>

            <Card size="small" title="History">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {(historyQuery.data?.items ?? []).map((item) => (
                  <Text key={item.id}>
                    {item.createdAt} - {item.action} - {item.note ?? item.reason ?? 'No note'}
                  </Text>
                ))}
              </Space>
            </Card>

            <Space>
              <Button
                type="primary"
                onClick={() => selectedId && actionMutation.mutate({ action: 'approve', id: selectedId })}
              >
                Approve
              </Button>
              <Button
                danger
                onClick={() => selectedId && actionMutation.mutate({ action: 'reject', id: selectedId })}
              >
                Reject
              </Button>
              <Button onClick={() => selectedId && actionMutation.mutate({ action: 'revoke', id: selectedId })}>
                Revoke
              </Button>
            </Space>
          </Space>
        )}
      </Drawer>
    </Space>
  );
};
