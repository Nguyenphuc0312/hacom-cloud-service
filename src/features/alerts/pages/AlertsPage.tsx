import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { alertsClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { Incident, IncidentListResponse } from '@/api/types';
import { useCurrentUser } from '@/app/useCurrentUser';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/utils/date';
import { hasMinimumRole } from '@/utils/role';

const ackSchema = z.object({
  note: z.string().optional(),
});

const silenceSchema = z.object({
  durationMinutes: z.number().int().min(1).max(10080),
  comment: z.string().optional(),
});

type AckFormValues = z.infer<typeof ackSchema>;
type SilenceFormValues = z.infer<typeof silenceSchema>;

export const AlertsPage = () => {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const canManage = hasMinimumRole(user?.role, 'admin');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [activeFingerprint, setActiveFingerprint] = useState<string | null>(null);
  const [ackOpen, setAckOpen] = useState(false);
  const [silenceOpen, setSilenceOpen] = useState(false);
  const [ackForm] = Form.useForm<AckFormValues>();
  const [silenceForm] = Form.useForm<SilenceFormValues>();

  const incidentsKey = queryKeys.incidents(statusFilter, severityFilter);

  const incidentsQuery = useQuery({
    queryKey: incidentsKey,
    queryFn: () =>
      alertsClient.getIncidents({
        status: statusFilter === 'all' ? undefined : statusFilter,
        severity: severityFilter === 'all' ? undefined : severityFilter,
      }),
  });

  const ackMutation = useMutation({
    mutationFn: (payload: { fingerprint: string; note?: string }) =>
      alertsClient.ackIncident(payload.fingerprint, { note: payload.note }),
    onMutate: async ({ fingerprint }) => {
      await queryClient.cancelQueries({ queryKey: incidentsKey });
      const previousData = queryClient.getQueryData<IncidentListResponse>(incidentsKey);

      queryClient.setQueryData<IncidentListResponse>(incidentsKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((item) =>
            item.fingerprint === fingerprint
              ? { ...item, ackedBy: user?.email ?? 'current-user', ackedAt: new Date().toISOString() }
              : item,
          ),
        };
      });

      return { previousData };
    },
    onError: (error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(incidentsKey, context.previousData);
      }
      message.error(getErrorMessage(error));
    },
    onSuccess: () => {
      message.success('Ack incident thành công.');
      setAckOpen(false);
      ackForm.resetFields();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: incidentsKey });
    },
  });

  const silenceMutation = useMutation({
    mutationFn: (payload: { fingerprint: string; durationMinutes: number; comment?: string }) =>
      alertsClient.silenceIncident(payload.fingerprint, {
        durationMinutes: payload.durationMinutes,
        comment: payload.comment,
      }),
    onMutate: async ({ fingerprint }) => {
      await queryClient.cancelQueries({ queryKey: incidentsKey });
      const previousData = queryClient.getQueryData<IncidentListResponse>(incidentsKey);

      queryClient.setQueryData<IncidentListResponse>(incidentsKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((item) =>
            item.fingerprint === fingerprint ? { ...item, status: 'resolved' } : item,
          ),
        };
      });

      return { previousData };
    },
    onError: (error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(incidentsKey, context.previousData);
      }
      message.error(getErrorMessage(error));
    },
    onSuccess: () => {
      message.success('Silence incident thành công.');
      setSilenceOpen(false);
      silenceForm.resetFields();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: incidentsKey });
    },
  });

  const columns = useMemo<ColumnsType<Incident>>(
    () => [
      { title: 'Fingerprint', dataIndex: 'fingerprint', width: 180 },
      {
        title: 'Status',
        dataIndex: 'status',
        render: (value: string) => <StatusBadge status={value} />,
        width: 120,
      },
      {
        title: 'Severity',
        dataIndex: 'severity',
        render: (value?: string) => (value ? <Tag>{value.toUpperCase()}</Tag> : '-'),
        width: 120,
      },
      {
        title: 'Summary',
        render: (_, record) => record.summary || record.title || '-',
      },
      {
        title: 'Starts At',
        dataIndex: 'startsAt',
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Ends At',
        dataIndex: 'endsAt',
        render: (value?: string) => formatDateTime(value),
      },
      {
        title: 'Acked By',
        dataIndex: 'ackedBy',
        render: (value?: string) => value ?? '-',
      },
      {
        title: 'Acked At',
        dataIndex: 'ackedAt',
        render: (value?: string) => formatDateTime(value),
      },
      {
        title: 'Actions',
        width: 180,
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              disabled={!canManage || record.status === 'resolved'}
              onClick={() => {
                setActiveFingerprint(record.fingerprint);
                setAckOpen(true);
              }}
            >
              Ack
            </Button>
            <Button
              size="small"
              disabled={!canManage || record.status === 'resolved'}
              onClick={() => {
                setActiveFingerprint(record.fingerprint);
                setSilenceOpen(true);
              }}
            >
              Silence
            </Button>
          </Space>
        ),
      },
    ],
    [canManage],
  );

  if (incidentsQuery.isLoading) {
    return <LoadingState tip="Đang tải incidents..." />;
  }

  if (incidentsQuery.isError) {
    return <ErrorState subTitle="Không thể tải incidents." />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Alerts & Incidents"
        description="Theo dõi cảnh báo đang firing và lịch sử xử lý"
        extra={
          <Space>
            <Select
              value={statusFilter}
              style={{ width: 160 }}
              onChange={setStatusFilter}
              options={[
                { label: 'All status', value: 'all' },
                { label: 'Firing', value: 'firing' },
                { label: 'Resolved', value: 'resolved' },
              ]}
            />
            <Select
              value={severityFilter}
              style={{ width: 160 }}
              onChange={setSeverityFilter}
              options={[
                { label: 'All severity', value: 'all' },
                { label: 'Critical', value: 'critical' },
                { label: 'High', value: 'high' },
                { label: 'Medium', value: 'medium' },
                { label: 'Low', value: 'low' },
              ]}
            />
          </Space>
        }
      />

      <Card>
        <Table
          rowKey="fingerprint"
          columns={columns}
          dataSource={incidentsQuery.data?.items ?? []}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <EmptyState description="Không có incident" /> }}
        />
      </Card>

      <Modal
        title="Ack Incident"
        open={ackOpen}
        onCancel={() => {
          setAckOpen(false);
          ackForm.resetFields();
        }}
        onOk={() => {
          const values = ackForm.getFieldsValue();
          const parsed = ackSchema.safeParse(values);

          if (!parsed.success || !activeFingerprint) {
            message.error('Dữ liệu ack không hợp lệ.');
            return;
          }

          ackMutation.mutate({ fingerprint: activeFingerprint, note: parsed.data.note });
        }}
        confirmLoading={ackMutation.isPending}
      >
        <Form<AckFormValues> form={ackForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Note" name="note">
            <Input.TextArea rows={3} placeholder="Ghi chú khi ack incident" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Silence Incident"
        open={silenceOpen}
        onCancel={() => {
          setSilenceOpen(false);
          silenceForm.resetFields();
        }}
        onOk={() => {
          const values = silenceForm.getFieldsValue();
          const parsed = silenceSchema.safeParse(values);

          if (!parsed.success) {
            message.error(parsed.error.issues[0]?.message ?? 'Dữ liệu silence không hợp lệ.');
            return;
          }

          if (!activeFingerprint) {
            message.error('Không xác định incident cần silence.');
            return;
          }

          silenceMutation.mutate({
            fingerprint: activeFingerprint,
            durationMinutes: parsed.data.durationMinutes,
            comment: parsed.data.comment,
          });
        }}
        confirmLoading={silenceMutation.isPending}
      >
        <Form<SilenceFormValues> form={silenceForm} layout="vertical" requiredMark={false}>
          <Form.Item
            label="Duration minutes"
            name="durationMinutes"
            rules={[{ required: true, message: 'Vui lòng nhập duration.' }]}
          >
            <InputNumber min={1} max={10080} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Comment" name="comment">
            <Input.TextArea rows={3} placeholder="Lý do silence" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

