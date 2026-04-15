import type { TableProps } from 'antd';

import { AdminTable } from '@/components/AdminTable';

interface DataTableProps<T extends object> extends TableProps<T> {
  loadingSkeletonRows?: number;
  minHeight?: number;
  containerClassName?: string;
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
      scroll={scroll ?? { x: 'max-content', y: 560 }}
      {...props}
    />
  );
}
