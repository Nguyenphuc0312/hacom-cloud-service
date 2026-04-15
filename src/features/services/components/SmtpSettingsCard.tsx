import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Col, Form, Input, InputNumber, Row, Space, Switch, message } from 'antd';
import { useEffect } from 'react';

import { smtpClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { UpdateSmtpSettingsRequest } from '@/api/types';
import { FormSection } from '@/components/FormSection';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { StatusBadge } from '@/components/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
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
      message.success('SMTP draft saved.');
      await refreshSettings();
    },
  });

  const activateMutation = useMutation({
    mutationFn: smtpClient.activateDraft,
    onSuccess: async () => {
      message.success('SMTP draft activated.');
      await refreshSettings();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: smtpClient.deactivateActive,
    onSuccess: async () => {
      message.success('Active SMTP configuration disabled.');
      await refreshSettings();
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: smtpClient.testConnection,
    onSuccess: () => {
      message.success('SMTP connection succeeded.');
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
    return <QueryStateView kind="loading" title="Loading SMTP settings..." />;
  }

  if (settingsQuery.isError) {
    return (
      <QueryStateView
        kind="error"
        description="Unable to load SMTP settings."
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
        eyebrow="Runtime state"
        title="SMTP deployment"
        description="Keep active and draft configurations visible side by side so operators do not guess which version is actually serving outbound email."
        status={<StatusBadge status={active ? 'active' : draft ? 'pending' : 'unknown'} />}
      >
        <div className="ds-settings-summary-grid">
          <div className="ds-settings-summary-card">
            <div className="ds-settings-summary-head">
              <span className="ds-settings-summary-title">Active</span>
              {active ? <StatusBadge status="active" /> : <StatusBadge status="inactive" />}
            </div>
            {active ? (
              <div className="ds-settings-summary-meta">
                <strong>{active.fromEmail}</strong>
                <span>
                  {active.host}:{active.port} {active.secure ? '(secure)' : '(plain)'}
                </span>
                <span>Updated {formatDateTime(active.updatedAt)}</span>
                <span>Password: {active.passMasked || '-'}</span>
              </div>
            ) : (
              <EmptyState description="No active SMTP configuration yet." />
            )}
          </div>

          <div className="ds-settings-summary-card">
            <div className="ds-settings-summary-head">
              <span className="ds-settings-summary-title">Draft</span>
              {draft ? <StatusBadge status={draft.status} /> : <StatusBadge status="unknown" />}
            </div>
            {draft ? (
              <div className="ds-settings-summary-meta">
                <strong>{draft.fromEmail}</strong>
                <span>
                  {draft.host}:{draft.port} {draft.secure ? '(secure)' : '(plain)'}
                </span>
                <span>Updated {formatDateTime(draft.updatedAt)}</span>
                <span>Password: {draft.passMasked || '-'}</span>
              </div>
            ) : (
              <EmptyState description="No SMTP draft has been prepared." />
            )}
          </div>

          <div className="ds-settings-summary-card">
            <div className="ds-settings-summary-head">
              <span className="ds-settings-summary-title">Release flow</span>
              <StatusBadge status="info" />
            </div>
            <div className="ds-settings-summary-meta">
              <span>1. Save a draft.</span>
              <span>2. Test the draft against the target server.</span>
              <span>3. Activate only after the connection succeeds.</span>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        eyebrow="Configuration"
        title="Connection profile"
        description="Separate transport details from sender identity so edits stay easy to review before activation."
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
              description="Host, port, and authentication values used to reach the mail server."
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Host"
                    name="host"
                    rules={[{ required: true, message: 'SMTP host is required.' }]}
                  >
                    <Input placeholder="smtp.example.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item
                    label="Port"
                    name="port"
                    rules={[{ required: true, message: 'SMTP port is required.' }]}
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
                    rules={[{ required: true, message: 'SMTP user is required.' }]}
                  >
                    <Input placeholder="mailer@example.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="SMTP password"
                    name="password"
                    extra="Leave blank if the current draft password should stay unchanged."
                  >
                    <Input.Password placeholder="••••••••" autoComplete="new-password" />
                  </Form.Item>
                </Col>
              </Row>
            </FormSection>

            <FormSection
              title="Sender identity"
              description="These values shape the outbound email identity visible to recipients."
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="From name"
                    name="fromName"
                    rules={[{ required: true, message: 'Display name is required.' }]}
                  >
                    <Input placeholder="Hacom Chat" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="From email"
                    name="fromEmail"
                    rules={[{ required: true, type: 'email', message: 'Enter a valid sender email.' }]}
                  >
                    <Input placeholder="noreply@example.com" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                label="Reply-to"
                name="replyTo"
                rules={[{ type: 'email', message: 'Enter a valid reply-to email.' }]}
              >
                <Input placeholder="support@example.com" />
              </Form.Item>
            </FormSection>
          </div>

          <div className="ds-settings-action-bar">
            <div className="ds-settings-action-copy">
              Save the draft first, test it with the exact transport values above, and only then activate it. Deactivation is destructive and should be used sparingly.
            </div>
            <Space wrap>
              <Button type="primary" htmlType="submit" loading={saveDraftMutation.isPending}>
                Save draft
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
          </div>
        </Form>
      </SurfaceCard>
    </div>
  );
};

export default SmtpSettingsCard;
