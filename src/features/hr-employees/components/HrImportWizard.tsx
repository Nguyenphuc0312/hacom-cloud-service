import {
  Alert,
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Statistic,
  Steps,
  Table,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InboxOutlined, UploadOutlined } from '@ant-design/icons';
import React from 'react';

import { hrEmployeesClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import type { HrImportPreviewRow, HrImportValidationResult } from '@/api/types';
import { useAuthStore } from '@/store/authStore';
import {
  useCommitHrImportMutation,
  useValidateHrImportMutation,
} from '../hooks/useHrEmployeeMutations';

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

const isAcceptedFileName = (fileName: string): boolean =>
  ACCEPTED_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension));

const fileToBase64 = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Không thể đọc tệp đã chọn.'));
        return;
      }

      resolve(result.split(',').pop() || '');
    };
    reader.onerror = () => reject(new Error('Không thể đọc tệp đã chọn.'));
    reader.readAsDataURL(file);
  });

const previewColumns: ColumnsType<HrImportPreviewRow> = [
  { title: 'Dòng', dataIndex: 'rowNumber', width: 72 },
  { title: 'Mã nhân viên', dataIndex: 'employeeCode', render: (value) => value || '-' },
  { title: 'Họ tên', dataIndex: 'fullName', render: (value) => value || '-' },
  { title: 'Email', dataIndex: 'email', render: (value) => value || '-' },
  {
    title: 'Phòng ban',
    dataIndex: 'departmentName',
    render: (value) => value || '-',
  },
  { title: 'Mã đơn vị', dataIndex: 'unitCode', render: (value) => value || '-' },
  {
    title: 'Lỗi',
    dataIndex: 'errors',
    render: (value: string[]) =>
      value.length > 0 ? (
        <Space direction="vertical" size={2}>
          {value.map((item) => (
            <Typography.Text key={item} type="danger">
              {item}
            </Typography.Text>
          ))}
        </Space>
      ) : (
        '-'
      ),
  },
];

interface HrImportWizardProps {
  open: boolean;
  onClose: () => void;
  onCommitted?: (result: {
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    batchId: string;
  }) => void | Promise<void>;
}

export const HrImportWizard = ({ open, onClose, onCommitted }: HrImportWizardProps) => {
  const currentAdmin = useAuthStore((state) => state.user);
  const validateMutation = useValidateHrImportMutation();
  const commitMutation = useCommitHrImportMutation();
  const [file, setFile] = React.useState<File | null>(null);
  const [validation, setValidation] = React.useState<HrImportValidationResult | null>(null);
  const [commitResult, setCommitResult] = React.useState<{
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    batchId: string;
  } | null>(null);
  const [reportDownloading, setReportDownloading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const actionLockRef = React.useRef<'validate' | 'commit' | 'download' | null>(null);

  const currentStep = commitResult ? 2 : validation ? 1 : 0;

  const tryLockAction = React.useCallback(
    (action: 'validate' | 'commit' | 'download'): boolean => {
      if (
        actionLockRef.current ||
        validateMutation.isPending ||
        commitMutation.isPending ||
        reportDownloading
      ) {
        return false;
      }

      actionLockRef.current = action;
      return true;
    },
    [commitMutation.isPending, reportDownloading, validateMutation.isPending],
  );

  const releaseActionLock = React.useCallback((action: 'validate' | 'commit' | 'download') => {
    if (actionLockRef.current === action) {
      actionLockRef.current = null;
    }
  }, []);

  const resetState = React.useCallback(() => {
    setFile(null);
    setValidation(null);
    setCommitResult(null);
    setActionError(null);
    actionLockRef.current = null;
  }, []);

  const handleClose = React.useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleFileChange = React.useCallback((nextFile: File | null) => {
    setFile(nextFile);
    setValidation(null);
    setCommitResult(null);
    setActionError(null);
  }, []);

  const handleValidate = React.useCallback(async () => {
    if (!file) {
      message.warning('Hãy chọn tệp trước khi kiểm tra.');
      return;
    }

    if (!isAcceptedFileName(file.name)) {
      message.error('Chỉ hỗ trợ tệp .csv, .xlsx và .xls.');
      return;
    }

    if (!tryLockAction('validate')) {
      return;
    }

    setActionError(null);

    try {
      const fileBase64 = await fileToBase64(file);
      const result = await validateMutation.mutateAsync({
        fileName: file.name,
        fileBase64,
        actorId: currentAdmin?.id,
        actorEmail: currentAdmin?.email,
        actorRole: currentAdmin?.role,
      });
      setValidation(result);
      message.success('Đã hoàn tất kiểm tra.');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setActionError(errorMessage);
      message.error(errorMessage);
    } finally {
      releaseActionLock('validate');
    }
  }, [
    currentAdmin?.email,
    currentAdmin?.id,
    currentAdmin?.role,
    file,
    releaseActionLock,
    tryLockAction,
    validateMutation,
  ]);

  const handleCommit = React.useCallback(async () => {
    if (!validation?.batchId) {
      message.warning('Hãy kiểm tra import trước khi commit.');
      return;
    }

    if (!tryLockAction('commit')) {
      return;
    }

    setActionError(null);

    try {
      const result = await commitMutation.mutateAsync({
        batchId: validation.batchId,
        payload: {
          actorId: currentAdmin?.id,
          actorEmail: currentAdmin?.email,
          actorRole: currentAdmin?.role,
          reason: 'phase2_import_commit',
        },
      });
      const normalizedCommitResult = {
        batchId: result.batchId,
        inserted: result.inserted ?? result.importedRows,
        updated: result.updated ?? 0,
        skipped: result.skipped ?? 0,
        failed: result.failed ?? result.invalidRowCount,
      };
      setCommitResult(normalizedCommitResult);
      await Promise.resolve(onCommitted?.(normalizedCommitResult));
      message.success('Đã commit import thành công.');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setActionError(errorMessage);
      message.error(errorMessage);
    } finally {
      releaseActionLock('commit');
    }
  }, [
    commitMutation,
    currentAdmin?.email,
    currentAdmin?.id,
    currentAdmin?.role,
    onCommitted,
    releaseActionLock,
    tryLockAction,
    validation?.batchId,
  ]);

  const handleDownloadReport = React.useCallback(async () => {
    if (!validation?.batchId && !commitResult?.batchId) {
      return;
    }

    if (!tryLockAction('download')) {
      return;
    }

    setReportDownloading(true);
    setActionError(null);

    try {
      const batchId = commitResult?.batchId || validation?.batchId || '';
      const report = await hrEmployeesClient.downloadHrImportReport(batchId);
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${report.sourceFileName || 'hr-import-report'}-${batchId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setActionError(errorMessage);
      message.error(errorMessage);
    } finally {
      releaseActionLock('download');
      setReportDownloading(false);
    }
  }, [commitResult?.batchId, releaseActionLock, tryLockAction, validation?.batchId]);

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title="Trình hướng dẫn import HR"
      footer={null}
      width={1120}
      destroyOnHidden
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Steps
          current={currentStep}
          items={[{ title: 'Tải lên' }, { title: 'Kiểm tra xem trước' }, { title: 'Kết quả commit' }]}
        />

        {actionError ? (
          <Alert
            type="error"
            showIcon
            message="Thao tác thất bại"
            description={actionError}
            closable
            onClose={() => setActionError(null)}
          />
        ) : null}

        <Card title="Bước 1: Tải tệp lên" size="small">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Upload.Dragger
              beforeUpload={(nextFile) => {
                handleFileChange(nextFile as File);
                return false;
              }}
              maxCount={1}
              showUploadList={false}
              accept={ACCEPTED_EXTENSIONS.join(',')}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Thả tệp import HR vào đây hoặc bấm để chọn.</p>
              <p className="ant-upload-hint">Định dạng chấp nhận: .csv, .xlsx, .xls</p>
            </Upload.Dragger>

            {file ? (
              <Alert
                type="info"
                showIcon
                message={`Tệp đã chọn: ${file.name}`}
                description="Đổi tệp sẽ đặt lại phần xem trước kiểm tra và trạng thái commit."
              />
            ) : null}

            <Space>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={validateMutation.isPending}
                disabled={!file || validateMutation.isPending || commitMutation.isPending}
                onClick={() => void handleValidate()}
              >
                Kiểm tra xem trước
              </Button>
              <Button onClick={resetState}>Đặt lại</Button>
            </Space>
          </Space>
        </Card>

        {validation ? (
          <Card title="Bước 2: Kiểm tra xem trước" size="small">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Space wrap size={16}>
                <Statistic title="Tổng số dòng" value={validation.summary.totalRows} />
                <Statistic title="Dòng hợp lệ" value={validation.summary.validRows} />
                <Statistic title="Dòng không hợp lệ" value={validation.summary.invalidRows} />
                <Statistic title="Cảnh báo" value={validation.summary.warningCount} />
              </Space>

              {validation.errors.length > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  message="Phát hiện lỗi kiểm tra"
                  description={validation.errors.join(' | ')}
                />
              ) : null}

              {validation.warnings.length > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Cảnh báo kiểm tra"
                  description={validation.warnings.join(' | ')}
                />
              ) : null}

              <Table
                rowKey={(row) => `${row.rowNumber}-${row.employeeCode || 'empty'}`}
                size="small"
                pagination={{ pageSize: 6 }}
                columns={previewColumns}
                dataSource={validation.previewRows}
              />

              {validation.previewRows.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Không có dòng xem trước nào được trả về"
                  description="Việc kiểm tra đã hoàn tất nhưng backend trả về phần xem trước rỗng."
                />
              ) : null}

              <Space>
                <Button
                  type="primary"
                  loading={commitMutation.isPending}
                  disabled={
                    !validation.batchId || validateMutation.isPending || commitMutation.isPending
                  }
                  onClick={() => void handleCommit()}
                >
                  Thực thi import
                </Button>
                <Button onClick={() => handleFileChange(file)}>Đổi tệp</Button>
                <Button
                  onClick={() => void handleDownloadReport()}
                  loading={reportDownloading}
                  disabled={validateMutation.isPending || commitMutation.isPending}
                >
                  Tải báo cáo
                </Button>
              </Space>
            </Space>
          </Card>
        ) : null}

        {commitResult ? (
          <Card title="Bước 3: Kết quả commit" size="small">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Descriptions
                bordered
                size="small"
                column={2}
                items={[
                  { key: 'inserted', label: 'Đã thêm', children: commitResult.inserted },
                  { key: 'updated', label: 'Đã cập nhật', children: commitResult.updated },
                  { key: 'skipped', label: 'Đã bỏ qua', children: commitResult.skipped },
                  { key: 'failed', label: 'Thất bại', children: commitResult.failed },
                ]}
              />

              <Alert
                type="info"
                showIcon
                message="Kết quả commit được chuẩn hóa theo cơ chế phòng thủ"
                description="Nếu backend trong môi trường này chỉ trả về bộ đếm tổng hợp, inserted/failed sẽ được suy ra từ importedRows/invalidRowCount, còn updated và skipped mặc định bằng 0."
              />

              <Space>
                <Button onClick={() => void handleDownloadReport()} loading={reportDownloading}>
                  Tải báo cáo
                </Button>
                <Button type="primary" onClick={handleClose}>
                  Đóng
                </Button>
              </Space>
            </Space>
          </Card>
        ) : null}
      </Space>
    </Modal>
  );
};

export default HrImportWizard;
