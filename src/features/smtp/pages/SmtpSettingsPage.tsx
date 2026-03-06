import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { auditClient, smtpClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import type { AuditEntry, SendTestEmailRequest, SmtpSettings } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { formatDateTime } from '@/utils/date';

const { Text } = Typography;

const smtpSchema = z.object({
  host: z.string().min(1, 'Host là bắt buộc.'),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1, 'User là bắt buộc.'),
  password: z.string().optional(),
  fromName: z.string().min(1, 'From name là bắt buộc.'),
  fromEmail: z.string().email('From email không hợp lệ.'),
  replyTo: z.string().optional(),
});

const sendTestEmailSchema = z.object({
  to: z.string().email('Email người nhận không hợp lệ.'),
  subject: z.string().min(1, 'Subject là bắt buộc.'),
  text: z.string().min(1, 'Nội dung là bắt buộc.'),
});

type SmtpFormValues = z.infer<typeof smtpSchema>;

type SendTestFormValues = z.infer<typeof sendTestEmailSchema>;

export const SmtpSettingsPage = () => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SmtpFormValues>();
  const [sendTestForm] = Form.useForm<SendTestFormValues>();
  const [showPasswordUpdate, setShowPasswordUpdate] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sendTestModalOpen, setSendTestModalOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: queryKeys.smtpSettings,
    queryFn: smtpClient.getSettings,
  });

  const auditQuery = useQuery({
    queryKey: queryKeys.audit('resource=smtp.config'),
    queryFn: () => auditClient.getAudit({ resource: 'smtp.config' }),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;

    form.setFieldsValue({
      host: settingsQuery.data.host,
      port: settingsQuery.data.port,
      secure: settingsQuery.data.secure,
      user: settingsQuery.data.user,
      fromName: settingsQuery.data.fromName,
      fromEmail: settingsQuery.data.fromEmail,
      replyTo: settingsQuery.data.replyTo,
      password: undefined,
    });
  }, [settingsQuery.data, form]);

  const updateMutation = useMutation({
    mutationFn: smtpClient.updateSettings,
    onSuccess: () => {
      message.success('Lưu SMTP settings thành công.');
      setShowPasswordUpdate(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.smtpSettings });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit('resource=smtp.config') });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: smtpClient.testConnection,
    onSuccess: (response) => {
      setTestResult(response);
      message.success(response.message);
    },
    onError: (error) => {
      setTestResult({ success: false, message: getErrorMessage(error) });
      message.error(getErrorMessage(error));
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: smtpClient.sendTestEmail,
    onSuccess: (response) => {
      message.success(response.message);
      setSendTestModalOpen(false);
      sendTestForm.resetFields();
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const submitForm = (values: SmtpFormValues) => {
    const parsed = smtpSchema.safeParse(values);
    if (!parsed.success) {
      message.error(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
      return;
    }

    const payload = {
      host: parsed.data.host,
      port: parsed.data.port,
      secure: parsed.data.secure,
      user: parsed.data.user,
      password: showPasswordUpdate ? parsed.data.password : undefined,
      fromName: parsed.data.fromName,
      fromEmail: parsed.data.fromEmail,
      replyTo: parsed.data.replyTo || undefined,
    };

    updateMutation.mutate(payload);
  };

  const submitSendTestEmail = () => {
    const values = sendTestForm.getFieldsValue();
    const parsed = sendTestEmailSchema.safeParse(values);

    if (!parsed.success) {
      message.error(parsed.error.issues[0]?.message ?? 'Dữ liệu email test không hợp lệ.');
      return;
    }

    sendTestEmailMutation.mutate(parsed.data as SendTestEmailRequest);
  };

  const auditColumns: ColumnsType<AuditEntry> = [
    { title: 'Time', dataIndex: 'time', render: (value: string) => formatDateTime(value) },
    { title: 'Actor', dataIndex: 'actor' },
    { title: 'Action', dataIndex: 'action' },
    { title: 'Resource', dataIndex: 'resource' },
    { title: 'IP', dataIndex: 'ip', render: (value?: string) => value ?? '-' },
  ];

  if (settingsQuery.isLoading) {
    return <LoadingState tip="Đang tải SMTP settings..." />;
  }

  if (settingsQuery.isError) {
    return <ErrorState subTitle="Không thể tải cấu hình SMTP." />;
  }

  const smtpData = settingsQuery.data as SmtpSettings | undefined;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="SMTP Settings"
        description="Cấu hình gửi email cảnh báo/incident"
        extra={
          <Space>
            <Button onClick={() => testConnectionMutation.mutate()} loading={testConnectionMutation.isPending}>
              Test connection
            </Button>
            <Button type="default" onClick={() => setSendTestModalOpen(true)}>
              Send test email
            </Button>
          </Space>
        }
      />

      <Card>
        <Form<SmtpFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={submitForm}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Form.Item label="Host" name="host" rules={[{ required: true }]}>
              <Input placeholder="smtp.gmail.com" />
            </Form.Item>
            <Form.Item label="Port" name="port" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={65535} />
            </Form.Item>
            <Form.Item label="Secure" name="secure" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item label="User" name="user" rules={[{ required: true }]}>
              <Input placeholder="smtp-user" />
            </Form.Item>

            <Card size="small" className="nested-card">
              <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text type="secondary">Password hiện tại: {smtpData?.passMasked ?? '********'}</Text>
                <Button type="link" onClick={() => setShowPasswordUpdate((prev) => !prev)}>
                  {showPasswordUpdate ? 'Cancel password update' : 'Update password'}
                </Button>
              </Space>
              {showPasswordUpdate ? (
                <Form.Item
                  style={{ marginTop: 8, marginBottom: 0 }}
                  label="New password"
                  name="password"
                  rules={[{ required: true, message: 'Vui lòng nhập password mới.' }]}
                >
                  <Input.Password />
                </Form.Item>
              ) : null}
            </Card>

            <Form.Item label="From Name" name="fromName" rules={[{ required: true }]}>
              <Input placeholder="Chat Alert Bot" />
            </Form.Item>
            <Form.Item label="From Email" name="fromEmail" rules={[{ required: true }]}>
              <Input placeholder="alerts@company.com" />
            </Form.Item>
            <Form.Item label="Reply To" name="replyTo">
              <Input placeholder="support@company.com" />
            </Form.Item>

            <div>
              <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
                Save
              </Button>
            </div>
          </Space>
        </Form>

        {testResult ? (
          <Alert
            style={{ marginTop: 12 }}
            type={testResult.success ? 'success' : 'error'}
            message={testResult.success ? 'Test successful' : 'Test failed'}
            description={testResult.message}
            showIcon
          />
        ) : null}
      </Card>

      <Card title="Recent SMTP Audit Trail">
        {auditQuery.isError ? (
          <ErrorState subTitle="Không thể tải SMTP audit trail." />
        ) : (
          <Table
            rowKey="id"
            loading={auditQuery.isLoading}
            columns={auditColumns}
            dataSource={auditQuery.data?.items?.slice(0, 10) ?? []}
            pagination={false}
            locale={{
              emptyText: <EmptyState description="Chưa có bản ghi audit SMTP" />,
            }}
          />
        )}
      </Card>

      <Modal
        title="Send Test Email"
        open={sendTestModalOpen}
        onCancel={() => setSendTestModalOpen(false)}
        onOk={submitSendTestEmail}
        confirmLoading={sendTestEmailMutation.isPending}
      >
        <Form<SendTestFormValues> form={sendTestForm} layout="vertical" requiredMark={false}>
          <Form.Item label="To" name="to" rules={[{ required: true }]}>
            <Input placeholder="you@company.com" />
          </Form.Item>
          <Form.Item label="Subject" name="subject" rules={[{ required: true }]}>
            <Input placeholder="SMTP health check" />
          </Form.Item>
          <Form.Item label="Text" name="text" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="SMTP is working" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
