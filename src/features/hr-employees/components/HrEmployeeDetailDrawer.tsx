import { useQuery } from '@tanstack/react-query';
import { Button, Space } from 'antd';
import { useCallback, useRef, useState } from 'react';

import { hrEmployeesClient } from '@/api/clients';
import type { HrEmployee } from '@/api/types';
import { getErrorMessage } from '@/api/error';
import { queryKeys } from '@/api/queryKeys';
import { AppDrawer } from '@/components/AppDrawer';
import { AppIcon } from '@/components/AppIcon';
import { StatusBadge } from '@/components/StatusBadge';
import { QueryStateView } from '@/components/QueryStates';
import { EmptyState } from '@/components/ui/EmptyState';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatDateTime } from '@/utils/date';
import { ProvisionAccountButton } from './ProvisionAccountButton';

const readValue = (value?: string | null) => value || '-';

interface HrEmployeeDetailDrawerProps {
  employeeId?: string | null;
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
  onProvisioned?: (employeeId: string) => void | Promise<void>;
}

const renderProfileRows = (employee: HrEmployee) => (
  <div className="ds-detail-list">
    <div className="ds-detail-list-item">
      <span>Mã nhân viên</span>
      <strong>{readValue(employee.employeeCode)}</strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Họ tên</span>
      <strong>{readValue(employee.fullNameFromHr || employee.fullName)}</strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Email</span>
      <strong>{readValue(employee.emailFromHr || employee.email)}</strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Phòng ban</span>
      <strong>{readValue(employee.departmentName || employee.orgUnit)}</strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Mã đơn vị</span>
      <strong>{readValue(employee.unitCode)}</strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Trạng thái HR</span>
      <strong>
        <StatusBadge status={employee.status} />
      </strong>
    </div>
  </div>
);

const renderAccountRows = (employee: HrEmployee) => (
  <div className="ds-detail-list">
    <div className="ds-detail-list-item">
      <span>Người dùng liên kết</span>
      <strong>{employee.linkedUser?.id || '-'}</strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Định danh đăng nhập</span>
      <strong>{employee.linkedUser?.loginIdentifier || '-'}</strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Cấp tài khoản</span>
      <strong>
        <StatusBadge status={employee.provisioningStatus} />
      </strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Kích hoạt</span>
      <strong>
        <StatusBadge status={employee.activationStatus} />
      </strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Trạng thái tài khoản</span>
      <strong>
        {employee.linkedUser?.accountState ? (
          <StatusBadge status={employee.linkedUser.accountState} />
        ) : (
          '-'
        )}
      </strong>
    </div>
    <div className="ds-detail-list-item">
      <span>Cập nhật</span>
      <strong>{employee.updatedAt ? formatDateTime(employee.updatedAt) : '-'}</strong>
    </div>
  </div>
);

export const HrEmployeeDetailDrawer = ({
  employeeId,
  open,
  canWrite,
  onClose,
  onProvisioned,
}: HrEmployeeDetailDrawerProps) => {
  const manualRefreshLockRef = useRef(false);
  const [manualRefreshLoading, setManualRefreshLoading] = useState(false);
  const detailQuery = useQuery({
    queryKey: queryKeys.hrEmployeeDetail(employeeId ?? ''),
    queryFn: () => hrEmployeesClient.getById(employeeId ?? ''),
    enabled: open && Boolean(employeeId),
  });

  const employee = detailQuery.data;

  const handleRefresh = useCallback(async () => {
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
    <AppDrawer
      open={open}
      onClose={onClose}
      title="Chi tiết nhân sự"
      width={560}
      footer={
        employee ? (
          <div className="ds-app-drawer-footer">
            <Space>
              <Button
                icon={<AppIcon name="refresh" size={14} />}
                loading={detailQuery.isFetching || manualRefreshLoading}
                onClick={() => {
                  void handleRefresh();
                }}
              >
                Làm mới
              </Button>
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
            </Space>
          </div>
        ) : undefined
      }
    >
      {!employeeId ? (
        <EmptyState description="Chọn một nhân sự để xem chi tiết." />
      ) : detailQuery.isLoading ? (
        <QueryStateView kind="loading" compact title="Đang tải chi tiết nhân sự..." />
      ) : detailQuery.isError ? (
        <QueryStateView
          kind="error"
          compact
          description={getErrorMessage(detailQuery.error)}
          onRetry={() => {
            void detailQuery.refetch();
          }}
        />
      ) : !employee ? (
        <EmptyState description="Chi tiết nhân sự hiện không khả dụng." />
      ) : (
        <div className="ds-settings-stack">
          <SurfaceCard
            eyebrow="Hồ sơ HR"
            title={readValue(employee.fullNameFromHr || employee.fullName)}
            description="Drawer này chỉ để inspect nhanh và cấp tài khoản khi đủ điều kiện."
            status={<StatusBadge status={employee.status} />}
          >
            {renderProfileRows(employee)}
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Liên kết tài khoản"
            title="Trạng thái provisioning"
            description="Giữ đúng phần cần vận hành: định danh, trạng thái cấp và trạng thái kích hoạt."
          >
            {renderAccountRows(employee)}
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Hành động"
            title="Tác vụ nhanh"
            description="Edit sâu nên đi qua luồng chỉnh sửa riêng; drawer không mang thêm wizard hoặc helper text dài."
          >
            <div className="ds-settings-action-bar">
              <span className="ds-settings-action-copy">
                Dùng cấp tài khoản khi bản ghi HR đã đủ email công ty và chưa liên kết người dùng.
              </span>
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
                <Button disabled>Gửi lại kích hoạt</Button>
              </Space>
            </div>
          </SurfaceCard>
        </div>
      )}
    </AppDrawer>
  );
};

export default HrEmployeeDetailDrawer;
