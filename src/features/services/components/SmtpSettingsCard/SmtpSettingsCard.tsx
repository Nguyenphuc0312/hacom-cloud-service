import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Col, Form, Input, InputNumber, Modal, Row, Space, Switch, message } from 'antd';
import { useEffect, useState } from 'react';

import { smtpClient } from '@/api/clients/smtpClient/smtpClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { UpdateSmtpSettingsRequest } from '@/api/types/smtp/smtp';
import { FormSection } from '@/components/FormSection/FormSection';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
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
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDiscardVisible, setConfirmDiscardVisible] = useState(false);

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
    setIsDirty(false);
  }, [form, settingsQuery.data]);

  // Track form changes
  useEffect(() => {
    const interval = setInterval(() => {
      const currentValues = form.getFieldsValue();
      const hasChanges =
        currentValues.host !== (settingsQuery.data?.draft?.host ?? settingsQuery.data?.active?.host) ||
        currentValues.port !== (settingsQuery.data?.draft?.port ?? settingsQuery.data?.active?.port) ||
        currentValues.secure !== (settingsQuery.data?.draft?.secure ?? settingsQuery.data?.active?.secure) ||
        currentValues.user !== (settingsQuery.data?.draft?.user ?? settingsQuery.data?.active?.user) ||
        currentValues.fromName !== (settingsQuery.data?.draft?.fromName ?? settingsQuery.data?.active?.fromName) ||
        currentValues.fromEmail !== (settingsQuery.data?.draft?.fromEmail ?? settingsQuery.data?.active?.fromEmail) ||
        currentValues.replyTo !== (settingsQuery.data?.draft?.replyTo ?? settingsQuery.data?.active?.replyTo ?? '');

      setIsDirty(hasChanges);
    }, 500);

    return () => clearInterval(interval);
  }, [form, settingsQuery.data]);

  // Browser navigation warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời khỏi trang này?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const refreshSettings = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.smtpSettings });
  };

  const saveDraftMutation = useMutation({
    mutationFn: smtpClient.updateSettings,
    onSuccess: async () => {
      message.success('Đã lưu bản nháp SMTP.');
      setIsDirty(false);
      await refreshSettings();
    },
  });

  const activateMutation = useMutation({
    mutationFn: smtpClient.activateDraft,
    onSuccess: async () => {
      message.success('Đã kích hoạt bản nháp SMTP.');
      setIsDirty(false);
      await refreshSettings();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: smtpClient.deactivateActive,
    onSuccess: async () => {
      message.success('Đã tắt cấu hình SMTP đang hoạt động.');
      setIsDirty(false);
      await refreshSettings();
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: smtpClient.testConnection,
    onSuccess: () => {
      message.success('Kết nối SMTP thành công.');
    },
    onError: () => {
      message.error('Kết nối SMTP thất bại. Vui lòng kiểm tra lại cấu hình.');
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

  const handleDiscardChanges = () => {
    setConfirmDiscardVisible(true);
  };

  const confirmDiscard = () => {
    const draft = settingsQuery.data?.draft ?? settingsQuery.data?.active;
    if (draft) {
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
    } else {
      form.setFieldsValue(emptyFormValues);
    }
    setIsDirty(false);
    setConfirmDiscardVisible(false);
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
              <div className="ds-settings-empty">
                <span>Chưa có cấu hình SMTP đang hoạt động.</span>
              </div>
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
              <div className="ds-settings-empty">
                <span>Chưa có bản nháp SMTP nào được chuẩn bị.</span>
              </div>
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
            <FormSection title="Transport">
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

            <FormSection title="Danh tính người gửi">
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
            {isDirty && (
              <span className="ds-settings-dirty-indicator">
                Có thay đổi chưa lưu
              </span>
            )}
            <Space wrap>
              <Button
                type="primary"
                htmlType="submit"
                loading={saveDraftMutation.isPending}
                disabled={!isDirty}
              >
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
              {isDirty && (
                <Button onClick={handleDiscardChanges}>
                  Hủy thay đổi
                </Button>
              )}
            </Space>
          </div>
        </Form>
      </SurfaceCard>

      {/* Confirm Discard Modal */}
      <Modal
        title="Xác nhận hủy thay đổi"
        open={confirmDiscardVisible}
        onCancel={() => setConfirmDiscardVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmDiscardVisible(false)}>
            Tiếp tục chỉnh sửa
          </Button>,
          <Button key="discard" danger onClick={confirmDiscard}>
            Hủy thay đổi
          </Button>,
        ]}
      >
        <p>Bạn có chắc muốn hủy các thay đổi chưa lưu không?</p>
        <p>Các thay đổi của bạn sẽ bị mất.</p>
      </Modal>
    </div>
  );
};

export default SmtpSettingsCard;
