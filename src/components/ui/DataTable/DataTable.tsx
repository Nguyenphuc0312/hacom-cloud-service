import type { TableProps } from 'antd';
import type { ReactNode } from 'react';

import { AdminTable } from '@/components/AdminTable/AdminTable';

interface DataTableProps<T extends object> extends TableProps<T> {
  loadingSkeletonRows?: number;
  minHeight?: number;
  containerClassName?: string;
  emptyNode?: ReactNode;
}

export function DataTable<T extends object>({
  loadingSkeletonRows = 6,
  minHeight = 320,
  scroll,
  pagination,
  ...props
}: DataTableProps<T>) {
  const resolvedPagination =
    pagination === false
      ? false
      : {
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total: number, range: [number, number]) =>
            `${range[0]}-${range[1]} / ${total}`,
          ...pagination,
        };

  return (
    <AdminTable<T>
      virtual
      loadingSkeletonRows={loadingSkeletonRows}
      minHeight={minHeight}
      scroll={scroll ?? { x: 1120, y: 560 }}
      pagination={resolvedPagination}
      {...props}
    />
  );
}
