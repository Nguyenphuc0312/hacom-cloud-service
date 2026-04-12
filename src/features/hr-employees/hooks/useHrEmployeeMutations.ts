import { useMutation, useQueryClient } from '@tanstack/react-query';

import { hrEmployeesClient } from '@/api/clients';
import type {
  CommitHrImportPayload,
  ProvisionHrEmployeeAccountPayload,
  ValidateHrImportPayload,
} from '@/api/types';
import { invalidateHrEmployeeQueries } from '../queryUtils';

export const useValidateHrImportMutation = () =>
  useMutation({
    mutationFn: (payload: ValidateHrImportPayload) => hrEmployeesClient.validateHrImport(payload),
  });

export const useCommitHrImportMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ batchId, payload }: { batchId: string; payload?: CommitHrImportPayload }) =>
      hrEmployeesClient.commitHrImport(batchId, payload),
    onSuccess: async () => {
      await invalidateHrEmployeeQueries(queryClient);
    },
  });
};

export const useProvisionHrEmployeeAccountMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      payload,
    }: {
      employeeId: string;
      payload?: ProvisionHrEmployeeAccountPayload;
    }) => hrEmployeesClient.provisionHrEmployeeAccount(employeeId, payload),
    onSuccess: async (_, variables) => {
      await invalidateHrEmployeeQueries(queryClient, variables.employeeId);
    },
  });
};
