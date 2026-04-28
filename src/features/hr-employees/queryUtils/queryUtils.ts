import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/api/queryKeys/queryKeys';

export const invalidateHrEmployeeQueries = async (
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  employeeId?: string | null,
): Promise<void> => {
  await queryClient.invalidateQueries({ queryKey: queryKeys.hrEmployeesRoot });

  if (employeeId) {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.hrEmployeeDetail(employeeId),
    });
  }
};
