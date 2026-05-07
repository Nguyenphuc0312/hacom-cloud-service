import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Col, Form, Input, InputNumber, Row, Space, Switch, message } from 'antd';
import { useEffect } from 'react';

import { smtpClient } from '@/api/clients/smtpClient/smtpClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { UpdateSmtpSettingsRequest } from '@/api/types/smtp/smtp';
import { FormSection } from '@/components/FormSection/FormSection';
import { EmptyState, QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';
import { formatDateTime } from '@/utils/date/date';

import '../../../settings/pages/SettingsPage/SettingsPage.css';
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
      message.success('Đã lưu bản nháp SMTP.');
      await refreshSettings();
    },
  });

  const activateMutation = useMutation({
    mutationFn: smtpClient.activateDraft,
    onSuccess: async () => {
      message.success('Đã kích hoạt bản nháp SMTP.');
      await refreshSettings();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: smtpClient.deactivateActive,
    onSuccess: async () => {
      message.success('Đã tắt cấu hình SMTP đang hoạt động.');
      await refreshSettings();
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: smtpClient.testConnection,
    onSuccess: () => {
      message.success('Kết nối SMTP thành công.');
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
    return <QueryStateView kind="loading" title="Đang tải cấu hình SMTP..." />;
  }

  if (settingsQuery.isError) {
    return (
      <QueryStateView
        kind="error"
        description="Không thể tải cấu hình SMTP."
        onRetry={() => {
          void settingsQuery.refetch();
        }}
      />
    );
  }

  const active = settingsQuery.data?.active ?? null;
  const draft = settingsQuery.data?.draft ?? null;

  return (
    <div className="ds-settings-stack">
      <SurfaceCard
        eyebrow="Trạng thái runtime"
        title="Triển khai SMTP"
        status={<StatusBadge status={active ? 'active' : draft ? 'pending' : 'unknown'} />}
      >
        <div className="ds-settings-summary-grid">
          <div className="ds-settings-summary-card">
            <div className="ds-settings-summary-head">
              <span className="ds-settings-summary-title">Đang hoạt động</span>
              {active ? <StatusBadge status="active" /> : <StatusBadge status="inactive" />}
            </div>
            {active ? (
              <div className="ds-settings-summary-meta">
                <strong>{active.fromEmail}</strong>
                <span>
                  {active.host}:{active.port} {active.secure ? '(bảo mật)' : '(thường)'}
                </span>
                <span>Cập nhật {formatDateTime(active.updatedAt)}</span>
                <span>Mật khẩu: {active.passMasked || '-'}</span>
              </div>
            ) : (
              <EmptyState description="Chưa có cấu hình SMTP đang hoạt động." />
            )}
          </div>

          <div className="ds-settings-summary-card">
            <div className="ds-settings-summary-head">
              <span className="ds-settings-summary-title">Bản nháp</span>
              {draft ? <StatusBadge status={draft.status} /> : <StatusBadge status="unknown" />}
            </div>
            {draft ? (
              <div className="ds-settings-summary-meta">
                <strong>{draft.fromEmail}</strong>
                <span>
                  {draft.host}:{draft.port} {draft.secure ? '(bảo mật)' : '(thường)'}
                </span>
                <span>Cập nhật {formatDateTime(draft.updatedAt)}</span>
                <span>Mật khẩu: {draft.passMasked || '-'}</span>
              </div>
            ) : (
              <EmptyState description="Chưa có bản nháp SMTP nào được chuẩn bị." />
            )}
          </div>

          <div className="ds-settings-summary-card">
            <div className="ds-settings-summary-head">
              <span className="ds-settings-summary-title">Phát hành</span>
              <StatusBadge status="info" />
            </div>
            <div className="ds-settings-summary-meta">
              <span>Lưu nháp</span>
              <span>Kiểm tra</span>
              <span>Kích hoạt</span>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        eyebrow="Cấu hình"
        title="Hồ sơ kết nối"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={emptyFormValues}
          onFinish={handleSaveDraft}
        >
          <div className="ds-settings-form-grid">
            <FormSection
              title="Transport"
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Host"
                    name="host"
                    rules={[{ required: true, message: 'Host SMTP là bắt buộc.' }]}
                  >
                    <Input placeholder="smtp.example.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item
                    label="Cổng"
                    name="port"
                    rules={[{ required: true, message: 'Cổng SMTP là bắt buộc.' }]}
                  >
                    <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Bảo mật" name="secure" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Tài khoản SMTP"
                    name="user"
                    rules={[{ required: true, message: 'Tài khoản SMTP là bắt buộc.' }]}
                  >
                    <Input placeholder="mailer@example.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Mật khẩu SMTP"
                    name="password"
                    extra="Để trống nếu muốn giữ nguyên mật khẩu của bản nháp hiện tại."
                  >
                    <Input.Password placeholder="••••••••" autoComplete="new-password" />
                  </Form.Item>
                </Col>
              </Row>
            </FormSection>

            <FormSection
              title="Danh tính người gửi"
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Tên người gửi"
                    name="fromName"
                    rules={[{ required: true, message: 'Tên hiển thị là bắt buộc.' }]}
                  >
                    <Input placeholder="Hacom Chat" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Email người gửi"
                    name="fromEmail"
                    rules={[{ required: true, type: 'email', message: 'Nhập email người gửi hợp lệ.' }]}
                  >
                    <Input placeholder="noreply@example.com" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                label="Reply-to"
                name="replyTo"
                rules={[{ type: 'email', message: 'Nhập email reply-to hợp lệ.' }]}
              >
              <Input placeholder="support@example.com" />
              </Form.Item>
            </FormSection>
          </div>

          <div className="ds-settings-action-bar">
            <Space wrap>
              <Button type="primary" htmlType="submit" loading={saveDraftMutation.isPending}>
                Lưu bản nháp
              </Button>
              <Button onClick={handleTestConnection} loading={testConnectionMutation.isPending}>
                Kiểm tra kết nối
              </Button>
              <Button onClick={() => activateMutation.mutate()} loading={activateMutation.isPending}>
                Kích hoạt bản nháp
              </Button>
              <Button
                danger
                onClick={() => deactivateMutation.mutate()}
                loading={deactivateMutation.isPending}
                disabled={!active}
              >
                Tắt cấu hình đang chạy
              </Button>
            </Space>
          </div>
        </Form>
      </SurfaceCard>
    </div>
  );
};

export default SmtpSettingsCard;
