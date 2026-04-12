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
  renderSection('Account Data', [
    {
      label: 'Linked user',
      value: employee.linkedUser?.id || '-',
    },
    {
      label: 'Login identifier',
      value: employee.linkedUser?.loginIdentifier || '-',
    },
    {
      label: 'Provisioning status',
      value: (
        <StatusBadge
          status={employee.provisioningStatus}
          title="Provisioning status from HR/account provisioning pipeline"
        />
      ),
    },
    {
      label: 'Activation status',
      value: (
        <StatusBadge
          status={employee.activationStatus}
          title="Current activation/account access state"
        />
      ),
    },
    {
      label: 'Account state',
      value: employee.linkedUser?.accountState || '-',
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
      title="HR employee detail"
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
            Refresh
          </Button>
          {employee ? (
            <ProvisionAccountButton
              employee={employee}
              canWrite={canWrite}
              buttonText="Provision account"
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
        <EmptyState description="Select an HR employee to inspect details." />
      ) : detailQuery.isLoading ? (
        <LoadingState tip="Loading HR employee detail..." />
      ) : detailQuery.isError ? (
        <ErrorState
          subTitle={getErrorMessage(detailQuery.error)}
          extra={<Button onClick={() => detailQuery.refetch()}>Retry</Button>}
        />
      ) : !employee ? (
        <EmptyState description="HR employee detail is unavailable." />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Profile and account fields are rendered defensively."
            description="If backend has not exposed a field in this environment yet, the drawer shows a safe fallback instead of failing."
          />

          <Typography.Text type="secondary">
            Last updated: {employee.updatedAt || '-'}
          </Typography.Text>

          {renderSection('HR Source Data', [
            { label: 'Employee code', value: readValue(employee.employeeCode) },
            {
              label: 'HR full name',
              value: readValue(employee.fullNameFromHr || employee.fullName),
            },
            {
              label: 'Email from HR',
              value: readValue(employee.emailFromHr || employee.email),
            },
            {
              label: 'Department',
              value: readValue(employee.departmentName || employee.orgUnit),
            },
            { label: 'Unit code', value: readValue(employee.unitCode) },
            { label: 'Status', value: <StatusBadge status={employee.status} /> },
          ])}

          {renderAccountData(employee)}

          {renderSection('Profile Data', [
            {
              label: 'Display name',
              value: readValue(employee.linkedUser?.displayName),
            },
            {
              label: 'Avatar',
              value: employee.linkedUser?.id
                ? 'Available from chat profile when backend exposes profile detail.'
                : '-',
            },
          ])}

          <Card title="Actions" size="small">
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
              <Button disabled title="Resend activation is not exposed in the admin backend yet.">
                Resend activation
              </Button>
            </Space>
          </Card>
        </Space>
      )}
    </Drawer>
  );
};

export default HrEmployeeDetailDrawer;
