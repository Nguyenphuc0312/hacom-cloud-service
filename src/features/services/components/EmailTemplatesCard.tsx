import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Col, Form, Input, Modal, Row, Select, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';

import { emailTemplatesClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { EmailTemplateRecord, UpsertEmailTemplateDraftRequest } from '@/api/types';
import { AdminTable } from '@/components/AdminTable';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { FormSection } from '@/components/FormSection';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { StatusBadge } from '@/components/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

const TEMPLATE_CODE_OPTIONS = [
  { label: 'EMAIL_OTP', value: 'EMAIL_OTP' },
  { label: 'EMAIL_VERIFICATION', value: 'EMAIL_VERIFICATION' },
  { label: 'PASSWORD_RESET', value: 'PASSWORD_RESET' },
];

interface FormPayload {
  code: string;
  name: string;
  description?: string;
  subjectTemplate: string;
  htmlTemplate?: string;
  textTemplate?: string;
  variablesSchema?: string;
  sampleData?: string;
}

const toJsonOrUndefined = (value?: string): Record<string, unknown> | undefined => {
  if (!value || !value.trim()) {
    return undefined;
  }

  return JSON.parse(value) as Record<string, unknown>;
};

export const EmailTemplatesCard = () => {
  const [form] = Form.useForm<FormPayload>();
  const [activeCode, setActiveCode] = useState<string>('EMAIL_OTP');
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: queryKeys.emailTemplates,
    queryFn: emailTemplatesClient.list,
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.emailTemplateDetail(activeCode),
    queryFn: () => emailTemplatesClient.getByCode(activeCode),
    enabled: Boolean(activeCode),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.emailTemplates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.emailTemplateDetail(activeCode) }),
    ]);
  };

  const upsertMutation = useMutation({
    mutationFn: async (payload: FormPayload) => {
      const body: UpsertEmailTemplateDraftRequest = {
        name: payload.name,
        description: payload.description,
        subjectTemplate: payload.subjectTemplate,
        htmlTemplate: payload.htmlTemplate,
        textTemplate: payload.textTemplate,
        variablesSchema: toJsonOrUndefined(payload.variablesSchema),
        sampleData: toJsonOrUndefined(payload.sampleData),
      };
      return emailTemplatesClient.upsertDraft(payload.code, body);
    },
    onSuccess: async (_, variables) => {
      message.success(`Draft saved for ${variables.code}.`);
      await refresh();
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Unable to save the draft.');
    },
  });

  const publishMutation = useMutation({
    mutationFn: (code: string) => emailTemplatesClient.publish(code),
    onSuccess: async () => {
      message.success('Template published.');
      await refresh();
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ code, version }: { code: string; version: number }) =>
      emailTemplatesClient.rollback(code, { version }),
    onSuccess: async () => {
      message.success('Template rolled back.');
      await refresh();
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (payload: FormPayload) =>
      emailTemplatesClient.preview(payload.code, {
        sampleData: toJsonOrUndefined(payload.sampleData),
      }),
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Preview failed.');
    },
  });

  const selectedTemplate = detailQuery.data;

  const onLoadTemplate = (record?: EmailTemplateRecord) => {
    const target = record ?? selectedTemplate;
    if (!target) {
      return;
    }

    const source = target.draft ?? target.published;
    form.setFieldsValue({
      code: target.code,
      name: target.name,
      description: target.description ?? '',
      subjectTemplate: source?.subjectTemplate ?? '',
      htmlTemplate: source?.htmlTemplate ?? '',
      textTemplate: source?.textTemplate ?? '',
      variablesSchema: source?.variablesSchema
        ? JSON.stringify(source.variablesSchema, null, 2)
        : '',
      sampleData: source?.sampleData ? JSON.stringify(source.sampleData, null, 2) : '',
    });
  };

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }

    const source = detailQuery.data.draft ?? detailQuery.data.published;
    form.setFieldsValue({
      code: detailQuery.data.code,
      name: detailQuery.data.name,
      description: detailQuery.data.description ?? '',
      subjectTemplate: source?.subjectTemplate ?? '',
      htmlTemplate: source?.htmlTemplate ?? '',
      textTemplate: source?.textTemplate ?? '',
      variablesSchema: source?.variablesSchema
        ? JSON.stringify(source.variablesSchema, null, 2)
        : '',
      sampleData: source?.sampleData ? JSON.stringify(source.sampleData, null, 2) : '',
    });
  }, [detailQuery.data, form]);

  const columns = useMemo<ColumnsType<EmailTemplateRecord>>(
    () => [
      {
        title: 'Code',
        dataIndex: 'code',
      },
      {
        title: 'Draft',
        render: (_, record) =>
          record.draft ? (
            <Space size={8}>
              <StatusBadge status="pending" />
              <span>v{record.draft.version}</span>
            </Space>
          ) : (
            <StatusBadge status="inactive" />
          ),
      },
      {
        title: 'Published',
        render: (_, record) =>
          record.published ? (
            <Space size={8}>
              <StatusBadge status="active" />
              <span>v{record.published.version}</span>
            </Space>
          ) : (
            <StatusBadge status="unknown" />
          ),
      },
      {
        title: 'Selection',
        render: (_, record) =>
          record.code === activeCode ? <span className="ds-shell-chip">Editing</span> : '-',
      },
    ],
    [activeCode],
  );

  if (listQuery.isLoading) {
    return <QueryStateView kind="loading" title="Loading email templates..." />;
  }

  if (listQuery.isError) {
    return (
      <QueryStateView
        kind="error"
        description="Unable to load email templates."
        onRetry={() => {
          void listQuery.refetch();
        }}
      />
    );
  }

  const handleSaveDraft = async () => {
    const payload = await form.validateFields();
    await upsertMutation.mutateAsync(payload);
  };

  const handlePreview = async () => {
    const payload = await form.validateFields();
    const preview = await previewMutation.mutateAsync(payload);
    message.success('Preview generated.');

    const content = [preview.subject, preview.text ?? '', preview.html ?? '']
      .filter(Boolean)
      .join('\n\n-----\n\n');

    Modal.info({
      title: `Preview ${preview.code} v${preview.version}`,
      width: 860,
      content: <Input.TextArea value={content} autoSize={{ minRows: 10, maxRows: 20 }} readOnly />,
    });
  };

  const handlePublish = async () => {
    await publishMutation.mutateAsync(activeCode);
  };

  const handleRollback = async () => {
    const version = selectedTemplate?.published?.version;
    if (!version) {
      message.warning('There is no published version to roll back to.');
      return;
    }

    await rollbackMutation.mutateAsync({ code: activeCode, version });
  };

  return (
    <div className="ds-settings-stack">
      <DataTableShell
        title="Template registry"
        meta="Keep draft and published versions visible before the operator opens the editor."
        toolbar={
          <DataTableToolbar>
            <Button
              onClick={() => {
                void refresh();
              }}
            >
              Refresh registry
            </Button>
          </DataTableToolbar>
        }
      >
        <AdminTable
          rowKey="id"
          columns={columns}
          minHeight={220}
          dataSource={listQuery.data?.items ?? []}
          emptyNode={<EmptyState description="No email templates are registered yet." />}
          pagination={false}
          onRow={(record) => ({
            onClick: () => {
              setActiveCode(record.code);
              onLoadTemplate(record);
            },
            style: { cursor: 'pointer' },
          })}
        />
      </DataTableShell>

      <SurfaceCard
        eyebrow="Template editor"
        title={activeCode}
        description="Runtime uses only published templates. Drafts, preview, publish, and rollback stay in one editor flow so operators do not switch context."
        status={
          selectedTemplate ? (
            <div className="ds-page-toolbar-group">
              {selectedTemplate.draft ? <StatusBadge status="pending" /> : null}
              {selectedTemplate.published ? <StatusBadge status="active" /> : null}
            </div>
          ) : null
        }
      >
        <Form form={form} layout="vertical">
          <div className="ds-settings-form-grid">
            <FormSection
              title="Template identity"
              description="Choose the template code first, then load the current draft or published source into the editor."
            >
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="code" label="Template code" rules={[{ required: true }]}>
                    <Select
                      options={TEMPLATE_CODE_OPTIONS}
                      onChange={(value) => setActiveCode(value)}
                      placeholder="Select template code"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="name" label="Template name" rules={[{ required: true }]}>
                    <Input placeholder="Email OTP" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="description" label="Description">
                    <Input placeholder="Template used for email OTP verification" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="subjectTemplate"
                label="Subject template"
                rules={[{ required: true }]}
              >
                <Input placeholder="Your OTP code is {{otp}}" />
              </Form.Item>
            </FormSection>

            <FormSection
              title="Message body"
              description="Keep HTML and text variants side by side so operators can review both before preview and publish."
            >
              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <Form.Item name="htmlTemplate" label="HTML template">
                    <Input.TextArea
                      rows={8}
                      placeholder="<p>Hello {{displayName}}, OTP: <b>{{otp}}</b></p>"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={12}>
                  <Form.Item name="textTemplate" label="Text template">
                    <Input.TextArea
                      rows={8}
                      placeholder="Hello {{displayName}}, your OTP is {{otp}}"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </FormSection>

            <FormSection
              title="Schema and sample data"
              description="Sample data powers preview. Schema documents the variables that the runtime expects."
            >
              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <Form.Item name="variablesSchema" label="Variables schema (JSON)">
                    <Input.TextArea
                      rows={6}
                      placeholder='{"otp":{"required":true},"displayName":{"required":false}}'
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={12}>
                  <Form.Item name="sampleData" label="Sample data (JSON)">
                    <Input.TextArea rows={6} placeholder='{"otp":"123456","displayName":"Nguyen"}' />
                  </Form.Item>
                </Col>
              </Row>
            </FormSection>
          </div>

          <div className="ds-settings-action-bar">
            <div className="ds-settings-action-copy">
              Drafts are safe to edit and preview. Publish only when the content is ready for runtime. Rollback creates a new version from the last published source of truth.
            </div>
            <Space wrap>
              <Button onClick={() => onLoadTemplate()} disabled={!selectedTemplate}>
                Load current
              </Button>
              <Button type="primary" onClick={handleSaveDraft} loading={upsertMutation.isPending}>
                Save draft
              </Button>
              <Button onClick={handlePreview} loading={previewMutation.isPending}>
                Preview
              </Button>
              <Button onClick={handlePublish} loading={publishMutation.isPending}>
                Publish
              </Button>
              <Button danger onClick={handleRollback} loading={rollbackMutation.isPending}>
                Rollback
              </Button>
            </Space>
          </div>
        </Form>
      </SurfaceCard>
    </div>
  );
};

export default EmailTemplatesCard;
