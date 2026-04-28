import { Skeleton, Table } from 'antd';
import type { TableProps } from 'antd';
import type { ReactNode } from 'react';
import { commonMessages } from '../../shared/messages/common/common';

interface AdminTableProps<T extends object> extends TableProps<T> {
  loadingSkeletonRows?: number;
  minHeight?: number;
  containerClassName?: string;
  emptyNode?: ReactNode;
}

const joinClassNames = (...parts: Array<string | undefined>): string =>
  parts.filter(Boolean).join(' ');

export function AdminTable<T extends object>({
  loading,
  dataSource,
  loadingSkeletonRows = 5,
  minHeight = 220,
  containerClassName,
  className,
  locale,
  emptyNode,
  ...tableProps
}: AdminTableProps<T>) {
  const hasRows = Array.isArray(dataSource) && dataSource.length > 0;

  if (loading && !hasRows) {
    return (
      <div
        className={joinClassNames('admin-table', containerClassName)}
        style={{ minHeight }}
        aria-busy="true"
        aria-live="polite"
      >
        <Skeleton active paragraph={{ rows: loadingSkeletonRows }} title={false} />
      </div>
    );
  }

  return (
    <div className={joinClassNames('admin-table', containerClassName)} style={{ minHeight }}>
      <Table<T>
        className={joinClassNames('admin-table-inner', className)}
        loading={loading}
        dataSource={dataSource}
        locale={{
          emptyText: emptyNode || commonMessages.table.empty,
          ...locale,
        }}
        {...tableProps}
      />
    </div>
  );
}
