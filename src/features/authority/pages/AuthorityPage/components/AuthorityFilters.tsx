import { Button, Form, Input, Space } from 'antd';

import { FilterBar } from '@/components/FilterBar/FilterBar';
import { formatDateTime } from '@/utils/date/date';

interface AuthorityFiltersProps {
  form: ReturnType<typeof Form.useForm>[0];
  total: number;
  activeFilterCount: number;
  dataUpdatedAt: number;
  onApply: () => void;
  onReset: () => void;
}

export const AuthorityFilters = ({
  form,
  total,
  activeFilterCount,
  dataUpdatedAt,
  onApply,
  onReset,
}: AuthorityFiltersProps) => (
  <FilterBar className="authority-page-filter">
    <Form form={form} layout="inline" className="ds-toolbar-form">
      <Form.Item name="keyword" className="ds-toolbar-field ds-toolbar-field--lg">
        <Input allowClear placeholder="Email hoặc username" />
      </Form.Item>
      <Form.Item className="ds-toolbar-field ds-toolbar-actions">
        <Space>
          <Button type="primary" onClick={onApply}>
            Áp dụng bộ lọc
          </Button>
          <Button onClick={onReset}>Đặt lại</Button>
        </Space>
      </Form.Item>
    </Form>
    <div className="ds-filter-toolbar-meta">
      <span>{total} bản ghi phân quyền</span>
      <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang bật` : 'Không có bộ lọc'}</span>
      <span>Đồng bộ gần nhất: {dataUpdatedAt ? formatDateTime(new Date(dataUpdatedAt).toISOString()) : '-'}</span>
    </div>
  </FilterBar>
);
