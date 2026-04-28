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
  ...props
}: DataTableProps<T>) {
  return (
    <AdminTable<T>
      virtual
      loadingSkeletonRows={loadingSkeletonRows}
      minHeight={minHeight}
      scroll={scroll ?? { x: 1120, y: 560 }}
      {...props}
    />
  );
}
