import { Alert, Button, Card, Descriptions, Drawer, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { hrEmployeesClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import type { HrEmployee } from '@/api/types';
import { ProvisionAccountButton } from './ProvisionAccountButton';

const readValue = (value?: string | null) => value || '-';

interface HrEmployeeDetailDrawerProps {
  employeeId?: string | null;
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
  onProvisioned?: (employeeId: string) => void | Promise<void>;
}

const renderSection = (title: string, items: Array<{ label: string; value: React.ReactNode }>) => (
  <Card title={title} size="small">
    <Descriptions column={1} size="small" items={items} />
  </Card>
);

const renderAccountData = (employee: HrEmployee) =>
  renderSection('Dữ liệu tài khoản', [
    {
      label: 'Người dùng liên kết',
      value: employee.linkedUser?.id || '-',
    },
    {
      label: 'Định danh đăng nhập',
      value: employee.linkedUser?.loginIdentifier || '-',
    },
    {
      label: 'Trạng thái cấp tài khoản',
      value: (
        <StatusBadge
          status={employee.provisioningStatus}
          title="Trạng thái cấp tài khoản từ pipeline HR / provisioning"
        />
      ),
    },
    {
      label: 'Trạng thái kích hoạt',
      value: (
        <StatusBadge
          status={employee.activationStatus}
          title="Trạng thái kích hoạt / truy cập tài khoản hiện tại"
        />
      ),
    },
    {
      label: 'Trạng thái tài khoản',
      value: employee.linkedUser?.accountState ? (
        <StatusBadge status={employee.linkedUser.accountState} />
      ) : (
        '-'
      ),
    },
  ]);

export const HrEmployeeDetailDrawer = ({
  employeeId,
  open,
  canWrite,
  onClose,
  onProvisioned,
}: HrEmployeeDetailDrawerProps) => {
  const manualRefreshLockRef = React.useRef(false);
  const [manualRefreshLoading, setManualRefreshLoading] = React.useState(false);

  const detailQuery = useQuery({
    queryKey: queryKeys.hrEmployeeDetail(employeeId ?? ''),
    queryFn: () => hrEmployeesClient.getById(employeeId ?? ''),
    enabled: open && Boolean(employeeId),
  });

  const employee = detailQuery.data;

  const handleRefresh = React.useCallback(async () => {
    if (manualRefreshLockRef.current) {
      return;
    }

    manualRefreshLockRef.current = true;
    setManualRefreshLoading(true);
    try {
      await detailQuery.refetch();
    } finally {
      manualRefreshLockRef.current = false;
      setManualRefreshLoading(false);
    }
  }, [detailQuery]);

  return (
    <Drawer
      title="Chi tiết nhân sự"
      width={520}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          <Button
            onClick={() => void handleRefresh()}
            loading={detailQuery.isFetching || manualRefreshLoading}
          >
            Làm mới
          </Button>
          {employee ? (
            <ProvisionAccountButton
              employee={employee}
              canWrite={canWrite}
              buttonText="Cấp tài khoản"
              onSuccess={async () => {
                await detailQuery.refetch();
                if (employeeId) {
                  await Promise.resolve(onProvisioned?.(employeeId));
                }
              }}
            />
          ) : null}
        </Space>
      }
    >
      {!employeeId ? (
        <EmptyState description="Chọn một nhân sự để xem chi tiết." />
      ) : detailQuery.isLoading ? (
        <LoadingState tip="Đang tải chi tiết nhân sự..." />
      ) : detailQuery.isError ? (
        <ErrorState
          subTitle={getErrorMessage(detailQuery.error)}
          extra={<Button onClick={() => detailQuery.refetch()}>Thử lại</Button>}
        />
      ) : !employee ? (
        <EmptyState description="Chi tiết nhân sự hiện không khả dụng." />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Các trường hồ sơ và tài khoản được render theo cơ chế phòng thủ."
            description="Nếu backend chưa expose một trường nào đó trong môi trường này, drawer sẽ hiển thị giá trị dự phòng an toàn thay vì lỗi."
          />

          <Typography.Text type="secondary">
            Cập nhật lần cuối: {employee.updatedAt || '-'}
          </Typography.Text>

          {renderSection('Dữ liệu nguồn HR', [
            { label: 'Mã nhân viên', value: readValue(employee.employeeCode) },
            {
              label: 'Họ tên từ HR',
              value: readValue(employee.fullNameFromHr || employee.fullName),
            },
            {
              label: 'Email từ HR',
              value: readValue(employee.emailFromHr || employee.email),
            },
            {
              label: 'Phòng ban',
              value: readValue(employee.departmentName || employee.orgUnit),
            },
            { label: 'Mã đơn vị', value: readValue(employee.unitCode) },
            { label: 'Trạng thái', value: <StatusBadge status={employee.status} /> },
          ])}

          {renderAccountData(employee)}

          {renderSection('Dữ liệu hồ sơ', [
            {
              label: 'Tên hiển thị',
              value: readValue(employee.linkedUser?.displayName),
            },
            {
              label: 'Ảnh đại diện',
              value: employee.linkedUser?.id
                ? 'Có thể lấy từ hồ sơ chat khi backend expose chi tiết profile.'
                : '-',
            },
          ])}

          <Card title="Thao tác" size="small">
            <Space wrap>
              <ProvisionAccountButton
                employee={employee}
                canWrite={canWrite}
                onSuccess={async () => {
                  await detailQuery.refetch();
                  if (employeeId) {
                    await Promise.resolve(onProvisioned?.(employeeId));
                  }
                }}
              />
              <Button disabled title="Chức năng gửi lại kích hoạt chưa được expose ở backend admin.">
                Gửi lại kích hoạt
              </Button>
            </Space>
          </Card>
        </Space>
      )}
    </Drawer>
  );
};

export default HrEmployeeDetailDrawer;
