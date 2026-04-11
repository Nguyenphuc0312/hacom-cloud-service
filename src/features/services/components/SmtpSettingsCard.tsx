import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect } from 'react';

import { smtpClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { UpdateSmtpSettingsRequest } from '@/api/types';
import { ErrorState, LoadingState, EmptyState } from '@/components/QueryStates';
import { formatDateTime } from '@/utils/date';

const emptyFormValues: UpdateSmtpSettingsRequest = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  fromName: '',
  fromEmail: '',
  replyTo: '',
};

export const SmtpSettingsCard = () => {
  const [form] = Form.useForm<UpdateSmtpSettingsRequest>();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: queryKeys.smtpSettings,
    queryFn: smtpClient.getSettings,
    staleTime: 30_000,
  });

  useEffect(() => {
    const draft = settingsQuery.data?.draft ?? settingsQuery.data?.active;
    if (!draft) {
      form.setFieldsValue(emptyFormValues);
      return;
    }

    form.setFieldsValue({
      host: draft.host,
      port: draft.port,
      secure: draft.secure,
      user: draft.user,
      password: '',
      fromName: draft.fromName,
      fromEmail: draft.fromEmail,
      replyTo: draft.replyTo ?? '',
    });
  }, [form, settingsQuery.data]);

  const refreshSettings = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.smtpSettings });
  };

  const saveDraftMutation = useMutation({
    mutationFn: smtpClient.updateSettings,
    onSuccess: async () => {
      message.success('Đã lưu draft SMTP.');
      await refreshSettings();
    },
  });

  const activateMutation = useMutation({
    mutationFn: smtpClient.activateDraft,
    onSuccess: async () => {
      message.success('Đã kích hoạt SMTP draft.');
      await refreshSettings();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: smtpClient.deactivateActive,
    onSuccess: async () => {
      message.success('Đã vô hiệu hóa SMTP active.');
      await refreshSettings();
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: smtpClient.testConnection,
    onSuccess: () => {
      message.success('Kết nối SMTP hợp lệ.');
    },
  });

  const handleSaveDraft = async () => {
    const values = await form.validateFields();
    await saveDraftMutation.mutateAsync(values);
  };

  const handleTestConnection = async () => {
    const values = await form.validateFields();
    await testConnectionMutation.mutateAsync(values);
  };

  if (settingsQuery.isLoading) {
    return <LoadingState tip="Đang tải cấu hình SMTP..." />;
  }

  if (settingsQuery.isError) {
    return (
      <ErrorState
        subTitle="Không thể tải cấu hình SMTP."
        extra={<Button onClick={() => settingsQuery.refetch()}>Thử lại</Button>}
      />
    );
  }

  const active = settingsQuery.data?.active ?? null;
  const draft = settingsQuery.data?.draft ?? null;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            SMTP settings
          </Typography.Title>
          <Typography.Text type="secondary">
            Quản lý cấu hình SMTP từ admin panel. Draft có thể test trước khi kích hoạt.
          </Typography.Text>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card size="small" title="Active">
                {active ? (
                  <Space direction="vertical" size={4}>
                    <Space>
                      <Tag color="green">ACTIVE</Tag>
                      <Typography.Text strong>{active.fromEmail}</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary">
                      {active.host}:{active.port} {active.secure ? '(secure)' : '(plain)'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Updated {formatDateTime(active.updatedAt)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Password: {active.passMasked || '-'}
                    </Typography.Text>
                  </Space>
                ) : (
                  <EmptyState description="Chưa có cấu hình active." />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title="Draft">
                {draft ? (
                  <Space direction="vertical" size={4}>
                    <Space>
                      <Tag color={draft.status === 'ACTIVE' ? 'green' : 'gold'}>{draft.status}</Tag>
                      <Typography.Text strong>{draft.fromEmail}</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary">
                      {draft.host}:{draft.port} {draft.secure ? '(secure)' : '(plain)'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Updated {formatDateTime(draft.updatedAt)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Password: {draft.passMasked || '-'}
                    </Typography.Text>
                  </Space>
                ) : (
                  <EmptyState description="Chưa có draft SMTP." />
                )}
              </Card>
            </Col>
          </Row>
        </Space>
      </Card>

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={emptyFormValues}
          onFinish={handleSaveDraft}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Host"
                name="host"
                rules={[{ required: true, message: 'Vui lòng nhập SMTP host.' }]}
              >
                <Input placeholder="smtp.example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                label="Port"
                name="port"
                rules={[{ required: true, message: 'Vui lòng nhập SMTP port.' }]}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Secure" name="secure" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="SMTP user"
                name="user"
                rules={[{ required: true, message: 'Vui lòng nhập SMTP user.' }]}
              >
                <Input placeholder="mailer@example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="SMTP password"
                name="password"
                extra="Để trống nếu không muốn thay đổi mật khẩu trong draft hiện tại."
              >
                <Input.Password placeholder="••••••••" autoComplete="new-password" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="From name"
                name="fromName"
                rules={[{ required: true, message: 'Vui lòng nhập tên hiển thị.' }]}
              >
                <Input placeholder="Hacom Chat" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="From email"
                name="fromEmail"
                rules={[{ required: true, type: 'email', message: 'From email không hợp lệ.' }]}
              >
                <Input placeholder="noreply@example.com" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Reply-to"
            name="replyTo"
            rules={[{ type: 'email', message: 'Reply-to không hợp lệ.' }]}
          >
            <Input placeholder="support@example.com" />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message="Quy trình"
            description="Lưu draft trước, test connection trên draft, sau đó kích hoạt nếu hợp lệ. Chỉ 1 cấu hình active tại một thời điểm."
          />

          <Divider />

          <Space wrap>
            <Button type="primary" htmlType="submit" loading={saveDraftMutation.isPending}>
              Lưu draft
            </Button>
            <Button onClick={handleTestConnection} loading={testConnectionMutation.isPending}>
              Test connection
            </Button>
            <Button onClick={() => activateMutation.mutate()} loading={activateMutation.isPending}>
              Activate draft
            </Button>
            <Button
              danger
              onClick={() => deactivateMutation.mutate()}
              loading={deactivateMutation.isPending}
              disabled={!active}
            >
              Deactivate active
            </Button>
          </Space>
        </Form>
      </Card>
    </Space>
  );
};

export default SmtpSettingsCard;
