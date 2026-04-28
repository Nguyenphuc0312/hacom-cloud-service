import React from 'react';
import { Pagination } from 'antd';

interface TablePaginationProps {
  total: number;
  pageSize: number;
  current: number;
  onChange: (page: number, pageSize: number) => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  total,
  pageSize,
  current,
  onChange,
}) => (
  <div className="ds-table-pagination">
    <Pagination
      total={total}
      pageSize={pageSize}
      current={current}
      onChange={onChange}
      showSizeChanger
      size="small"
      showTotal={(t) => `Tổng ${t}`}
      pageSizeOptions={['10', '20', '50', '100']}
    />
  </div>
);
