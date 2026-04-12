import { Button, Modal, Tooltip, message } from 'antd';
import { useCallback, useRef } from 'react';

import { getErrorMessage } from '@/api/error';
import type { HrEmployee } from '@/api/types';
import { useAuthStore } from '@/store/authStore';
import { useProvisionHrEmployeeAccountMutation } from '../hooks/useHrEmployeeMutations';

const getProvisionDisableReason = (employee: HrEmployee, canWrite: boolean): string | null => {
  if (!canWrite) {
    return 'Provision action is disabled by current role or release flag.';
  }

  if (!employee.email) {
    return 'Missing company email.';
  }

  if (employee.linkedUser?.id) {
    return 'Employee already linked to an account.';
  }

  if (employee.provisioningStatus === 'PROVISIONED' || employee.provisioningStatus === 'PENDING') {
    return `Provisioning status is ${employee.provisioningStatus}.`;
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
  buttonText = 'Provision',
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
      title: 'Provision account',
      content:
        'Tao tai khoan cho nhan su nay theo contract backend hien tai. Du lieu danh sach va chi tiet se duoc refresh sau khi thanh cong.',
      okText: 'Provision',
      cancelText: 'Cancel',
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
              ? `Provisioned account ${result.loginIdentifier}.`
              : 'Provisioned account successfully.',
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
