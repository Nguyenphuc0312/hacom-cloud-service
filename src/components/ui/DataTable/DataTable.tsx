import type { TableProps } from 'antd';
import type { ReactNode } from 'react';

import { AdminTable } from '@/components/AdminTable/AdminTable';

export interface DataTablePagination {
  current?: number;
  pageSize?: number;
  total?: number;
  onChange?: (page: number, pageSize: number) => void;
  onShowSizeChange?: (current: number, size: number) => void;
  showSizeChanger?: boolean;
  hideOnSinglePage?: boolean;
}

export interface DataTableProps<T extends object> extends Omit<TableProps<T>, 'pagination'> {
  /** Enable virtual scrolling for large datasets */
  virtualScroll?: boolean;
  /** Virtual scroll row height */
  virtualRowHeight?: number;
  /** Loading skeleton rows */
  loadingSkeletonRows?: number;
  /** Minimum container height */
  minHeight?: number;
  /** Custom container class */
  containerClassName?: string;
  /** Custom empty state node */
  emptyNode?: ReactNode;
  /** Server-side pagination config */
  pagination?: DataTablePagination | false;
  /** Show total count in pagination */
  showTotal?: boolean;
  /** Page size options */
  pageSizeOptions?: string[];
}

/**
 * Enhanced DataTable with virtual scroll, standard pagination, and column types
 */
export function DataTable<T extends object>({
  virtualScroll = false,
  loadingSkeletonRows = 6,
  minHeight = 320,
  scroll,
  pagination,
  showTotal = true,
  pageSizeOptions = ['10', '20', '50', '100'],
  ...props
}: DataTableProps<T>) {
  const resolvedPagination: TableProps<T>['pagination'] =
    pagination === false
      ? false
      : {
          showSizeChanger: true,
          pageSizeOptions,
          showTotal: showTotal
            ? (total: number, range: [number, number]) => `${range[0]}-${range[1]} / ${total}`
            : undefined,
          ...(typeof pagination === 'object' ? pagination : {}),
        };

  const resolvedScroll = scroll ?? { x: 1120, y: 560 };

  return (
    <AdminTable<T>
      virtual={virtualScroll}
      loadingSkeletonRows={loadingSkeletonRows}
      minHeight={minHeight}
      scroll={resolvedScroll}
      pagination={resolvedPagination}
      {...props}
    />
  );
}
