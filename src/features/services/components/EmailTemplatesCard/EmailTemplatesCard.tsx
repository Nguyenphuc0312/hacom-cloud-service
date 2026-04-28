import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Col, Form, Input, Modal, Row, Select, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';

import { emailTemplatesClient } from '@/api/clients/emailTemplatesClient/emailTemplatesClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { EmailTemplateRecord, UpsertEmailTemplateDraftRequest } from '@/api/types/email-templates/email-templates';
import { AdminTable } from '@/components/AdminTable/AdminTable';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar/DataTableToolbar';
import { FormSection } from '@/components/FormSection/FormSection';
import { EmptyState, QueryStateView } from '@/components/QueryStates/QueryStates';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard/SurfaceCard';

import '../../../settings/pages/SettingsPage/SettingsPage.css';
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
      message.success(`Đã lưu bản nháp cho ${variables.code}.`);
      await refresh();
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Không thể lưu bản nháp.');
    },
  });

  const publishMutation = useMutation({
    mutationFn: (code: string) => emailTemplatesClient.publish(code),
    onSuccess: async () => {
      message.success('Đã xuất bản mẫu.');
      await refresh();
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ code, version }: { code: string; version: number }) =>
      emailTemplatesClient.rollback(code, { version }),
    onSuccess: async () => {
      message.success('Đã rollback mẫu.');
      await refresh();
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (payload: FormPayload) =>
      emailTemplatesClient.preview(payload.code, {
        sampleData: toJsonOrUndefined(payload.sampleData),
      }),
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Xem trước thất bại.');
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
        title: 'Mã',
        dataIndex: 'code',
      },
      {
        title: 'Bản nháp',
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
        title: 'Đã xuất bản',
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
        title: 'Lựa chọn',
        render: (_, record) =>
          record.code === activeCode ? <span className="ds-shell-chip">Đang sửa</span> : '-',
      },
    ],
    [activeCode],
  );

  if (listQuery.isLoading) {
    return <QueryStateView kind="loading" title="Đang tải mẫu email..." />;
  }

  if (listQuery.isError) {
    return (
      <QueryStateView
        kind="error"
        description="Không thể tải mẫu email."
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
    message.success('Đã tạo bản xem trước.');

    const content = [preview.subject, preview.text ?? '', preview.html ?? '']
      .filter(Boolean)
      .join('\n\n-----\n\n');

    Modal.info({
      title: `Xem trước ${preview.code} v${preview.version}`,
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
      message.warning('Không có phiên bản đã xuất bản nào để rollback.');
      return;
    }

    await rollbackMutation.mutateAsync({ code: activeCode, version });
  };

  return (
    <div className="ds-settings-stack">
      <DataTableShell
        title="Danh mục mẫu"
        meta="Giữ bản nháp và phiên bản đã xuất bản hiển thị rõ trước khi operator mở trình sửa."
        toolbar={
          <DataTableToolbar>
            <Button
              onClick={() => {
                void refresh();
              }}
            >
              Làm mới danh mục
            </Button>
          </DataTableToolbar>
        }
      >
        <AdminTable
          rowKey="id"
          columns={columns}
          minHeight={220}
          dataSource={listQuery.data?.items ?? []}
          emptyNode={<EmptyState description="Chưa có mẫu email nào được đăng ký." />}
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
        eyebrow="Trình sửa mẫu"
        title={activeCode}
        description="Runtime chỉ dùng mẫu đã xuất bản. Bản nháp, xem trước, xuất bản và rollback được giữ trong cùng một luồng để operator không phải đổi ngữ cảnh."
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
              title="Danh tính mẫu"
              description="Chọn mã mẫu trước, sau đó nạp bản nháp hoặc bản đã xuất bản hiện tại vào trình sửa."
            >
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="code" label="Mã mẫu" rules={[{ required: true }]}>
                    <Select
                      options={TEMPLATE_CODE_OPTIONS}
                      onChange={(value) => setActiveCode(value)}
                      placeholder="Chọn mã mẫu"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="name" label="Tên mẫu" rules={[{ required: true }]}>
                    <Input placeholder="Email OTP" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="description" label="Mô tả">
                    <Input placeholder="Mẫu dùng cho xác minh OTP qua email" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="subjectTemplate"
                label="Mẫu tiêu đề"
                rules={[{ required: true }]}
              >
                <Input placeholder="Your OTP code is {{otp}}" />
              </Form.Item>
            </FormSection>

            <FormSection
              title="Nội dung tin"
              description="Giữ biến thể HTML và text cạnh nhau để operator có thể rà soát cả hai trước khi xem trước và xuất bản."
            >
              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <Form.Item name="htmlTemplate" label="Mẫu HTML">
                    <Input.TextArea
                      rows={8}
                      placeholder="<p>Hello {{displayName}}, OTP: <b>{{otp}}</b></p>"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={12}>
                  <Form.Item name="textTemplate" label="Mẫu text">
                    <Input.TextArea
                      rows={8}
                      placeholder="Hello {{displayName}}, your OTP is {{otp}}"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </FormSection>

            <FormSection
              title="Schema và dữ liệu mẫu"
              description="Dữ liệu mẫu phục vụ xem trước. Schema mô tả các biến mà runtime mong đợi."
            >
              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <Form.Item name="variablesSchema" label="Schema biến (JSON)">
                    <Input.TextArea
                      rows={6}
                      placeholder='{"otp":{"required":true},"displayName":{"required":false}}'
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={12}>
                  <Form.Item name="sampleData" label="Dữ liệu mẫu (JSON)">
                    <Input.TextArea rows={6} placeholder='{"otp":"123456","displayName":"Nguyen"}' />
                  </Form.Item>
                </Col>
              </Row>
            </FormSection>
          </div>

          <div className="ds-settings-action-bar">
            <div className="ds-settings-action-copy">
              Bản nháp an toàn để chỉnh sửa và xem trước. Chỉ xuất bản khi nội dung đã sẵn sàng cho runtime. Hoàn tác sẽ tạo phiên bản mới từ nguồn đã xuất bản gần nhất.
            </div>
            <Space wrap>
              <Button onClick={() => onLoadTemplate()} disabled={!selectedTemplate}>
                Nạp hiện tại
              </Button>
              <Button type="primary" onClick={handleSaveDraft} loading={upsertMutation.isPending}>
                Lưu bản nháp
              </Button>
              <Button onClick={handlePreview} loading={previewMutation.isPending}>
                Xem trước
              </Button>
              <Button onClick={handlePublish} loading={publishMutation.isPending}>
                Xuất bản
              </Button>
              <Button danger onClick={handleRollback} loading={rollbackMutation.isPending}>
                Hoàn tác phiên bản
              </Button>
            </Space>
          </div>
        </Form>
      </SurfaceCard>
    </div>
  );
};

export default EmailTemplatesCard;
