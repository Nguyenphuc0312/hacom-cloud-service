import { Select } from 'antd';
import type { SelectProps } from 'antd';
import clsx from 'clsx';

export const FilterSelect = ({
  className,
  popupMatchSelectWidth = false,
  ...props
}: SelectProps) => (
  <Select
    {...props}
    className={clsx('ds-filter-select', className)}
    popupMatchSelectWidth={popupMatchSelectWidth}
  />
);
