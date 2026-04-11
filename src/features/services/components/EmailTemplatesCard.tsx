import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMemo, useState } from 'react';

import { emailTemplatesClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { EmailTemplateRecord, UpsertEmailTemplateDraftRequest } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';

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
      message.success(`Đã lưu draft template ${variables.code}.`);
      await refresh();
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Lưu draft thất bại.');
    },
  });

  const publishMutation = useMutation({
    mutationFn: (code: string) => emailTemplatesClient.publish(code),
    onSuccess: async () => {
      message.success('Đã publish template.');
      await refresh();
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ code, version }: { code: string; version: number }) =>
      emailTemplatesClient.rollback(code, { version }),
    onSuccess: async () => {
      message.success('Đã rollback template.');
      await refresh();
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (payload: FormPayload) =>
      emailTemplatesClient.preview(payload.code, {
        sampleData: toJsonOrUndefined(payload.sampleData),
      }),
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Preview thất bại.');
    },
  });

  const selectedTemplate = detailQuery.data;

  const columns = useMemo(
    () => [
      {
        title: 'Code',
        dataIndex: 'code',
      },
      {
        title: 'Draft',
        render: (_: unknown, record: EmailTemplateRecord) =>
          record.draft ? <Tag color="gold">v{record.draft.version}</Tag> : <Tag>-</Tag>,
      },
      {
        title: 'Published',
        render: (_: unknown, record: EmailTemplateRecord) =>
          record.published ? <Tag color="green">v{record.published.version}</Tag> : <Tag>-</Tag>,
      },
      {
        title: 'Action',
        render: (_: unknown, record: EmailTemplateRecord) => (
          <Button size="small" onClick={() => setActiveCode(record.code)}>
            Edit
          </Button>
        ),
      },
    ],
    [],
  );

  if (listQuery.isLoading) {
    return <LoadingState tip="Đang tải email templates..." />;
  }

  if (listQuery.isError) {
    return (
      <ErrorState
        subTitle="Không thể tải danh sách email template."
        extra={<Button onClick={() => listQuery.refetch()}>Thử lại</Button>}
      />
    );
  }

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

  const handleSaveDraft = async () => {
    const payload = await form.validateFields();
    await upsertMutation.mutateAsync(payload);
  };

  const handlePreview = async () => {
    const payload = await form.validateFields();
    const preview = await previewMutation.mutateAsync(payload);
    message.success('Preview thành công.');

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
      message.warning('Không có published version để rollback.');
      return;
    }

    await rollbackMutation.mutateAsync({ code: activeCode, version });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Email templates
          </Typography.Title>
          <Typography.Text type="secondary">
            Quản lý draft/publish/rollback template email cho OTP và các flow auth.
          </Typography.Text>

          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={listQuery.data?.items ?? []}
            pagination={false}
            locale={{ emptyText: <EmptyState description="Chưa có email template." /> }}
          />
        </Space>
      </Card>

      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Nguyên tắc"
            description="Runtime chỉ dùng template đã publish. Draft có thể preview trước khi publish. Rollback sẽ tạo version mới dựa trên version đã publish trước đó."
          />

          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="code" label="Template code" rules={[{ required: true }]}>
                  <Select
                    options={TEMPLATE_CODE_OPTIONS}
                    onChange={(value) => setActiveCode(value)}
                    placeholder="Chọn code"
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
                  <Input placeholder="Template dùng cho OTP xác thực email" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="subjectTemplate" label="Subject template" rules={[{ required: true }]}>
              <Input placeholder="Mã OTP của bạn là {{otp}}" />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <Form.Item name="htmlTemplate" label="HTML template">
                  <Input.TextArea
                    rows={8}
                    placeholder="<p>Xin chào {{displayName}}, OTP: <b>{{otp}}</b></p>"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} lg={12}>
                <Form.Item name="textTemplate" label="Text template">
                  <Input.TextArea
                    rows={8}
                    placeholder="Xin chào {{displayName}}, OTP của bạn là {{otp}}"
                  />
                </Form.Item>
              </Col>
            </Row>

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
          </Form>
        </Space>
      </Card>
    </Space>
  );
};

export default EmailTemplatesCard;
