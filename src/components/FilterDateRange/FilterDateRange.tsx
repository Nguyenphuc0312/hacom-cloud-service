import { DatePicker } from 'antd';
import type { ComponentProps } from 'react';
import clsx from 'clsx';

type FilterDateRangeProps = ComponentProps<typeof DatePicker.RangePicker>;

export const FilterDateRange = ({ className, ...props }: FilterDateRangeProps) => (
  <DatePicker.RangePicker {...props} className={clsx('ds-filter-date-range', className)} />
);
