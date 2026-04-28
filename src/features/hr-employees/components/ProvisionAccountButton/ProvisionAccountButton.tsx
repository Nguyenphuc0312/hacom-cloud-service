import { Button, Modal, Tooltip, message } from 'antd';
import { useCallback, useRef } from 'react';

import { getErrorMessage } from '@/api/error/error';
import type { HrEmployee } from '@/api/types/hr-employees/hr-employees';
import { useAuthStore } from '@/store/authStore/authStore';
import { useProvisionHrEmployeeAccountMutation } from '../../hooks/useHrEmployeeMutations/useHrEmployeeMutations';

const getProvisionDisableReason = (employee: HrEmployee, canWrite: boolean): string | null => {
  if (!canWrite) {
    return 'Thao tác cấp tài khoản bị tắt bởi vai trò hiện tại hoặc cờ phát hành.';
  }

  if (!employee.email) {
    return 'Thiếu email công ty.';
  }

  if (employee.linkedUser?.id) {
    return 'Nhân sự đã được liên kết với một tài khoản.';
  }

  if (employee.provisioningStatus === 'PROVISIONED' || employee.provisioningStatus === 'PENDING') {
    return `Trạng thái cấp tài khoản hiện là ${employee.provisioningStatus}.`;
  }

  return null;
};

interface ProvisionAccountButtonProps {
  employee: HrEmployee;
  canWrite: boolean;
  buttonText?: string;
  onSuccess?: () => void | Promise<void>;
}

export const ProvisionAccountButton = ({
  employee,
  canWrite,
  buttonText = 'Cấp tài khoản',
  onSuccess,
}: ProvisionAccountButtonProps) => {
  const currentAdmin = useAuthStore((state) => state.user);
  const provisionMutation = useProvisionHrEmployeeAccountMutation();
  const disableReason = getProvisionDisableReason(employee, canWrite);
  const provisionLockRef = useRef(false);

  const handleClick = useCallback(() => {
    if (disableReason) {
      message.info(disableReason);
      return;
    }

    Modal.confirm({
      title: 'Cấp tài khoản',
      content:
        'Tạo tài khoản cho nhân sự này theo contract backend hiện tại. Dữ liệu danh sách và chi tiết sẽ được làm mới sau khi thành công.',
      okText: 'Cấp tài khoản',
      cancelText: 'Hủy',
      onOk: async () => {
        if (provisionLockRef.current) {
          return;
        }

        provisionLockRef.current = true;
        try {
          const result = await provisionMutation.mutateAsync({
            employeeId: employee.id,
            payload: {
              actorId: currentAdmin?.id,
              actorEmail: currentAdmin?.email,
              actorRole: currentAdmin?.role,
              reason: 'phase2_provision_action',
            },
          });
          message.success(
            result.loginIdentifier
              ? `Đã cấp tài khoản ${result.loginIdentifier}.`
              : 'Đã cấp tài khoản thành công.',
          );
          await Promise.resolve(onSuccess?.());
        } catch (error) {
          message.error(getErrorMessage(error));
          throw error;
        } finally {
          provisionLockRef.current = false;
        }
      },
    });
  }, [
    currentAdmin?.email,
    currentAdmin?.id,
    currentAdmin?.role,
    disableReason,
    employee.id,
    onSuccess,
    provisionMutation,
  ]);

  const buttonNode = (
    <Button
      size="small"
      disabled={Boolean(disableReason) || provisionMutation.isPending}
      loading={provisionMutation.isPending}
      onClick={handleClick}
    >
      {buttonText}
    </Button>
  );

  if (!disableReason) {
    return buttonNode;
  }

  return <Tooltip title={disableReason}>{buttonNode}</Tooltip>;
};

export default ProvisionAccountButton;
