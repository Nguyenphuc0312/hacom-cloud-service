import { Input } from 'antd';
import type { InputProps } from 'antd';
import clsx from 'clsx';

import { AppIcon } from '@/components/AppIcon/AppIcon';

export interface AdminSearchInputProps extends Omit<InputProps, 'prefix' | 'allowClear'> {
  width?: number | string;
}

export const AdminSearchInput = ({
  className,
  style,
  width,
  placeholder = 'Tìm kiếm...',
  'aria-label': ariaLabel = 'Tìm kiếm',
  ...props
}: AdminSearchInputProps) => (
  <Input
    {...props}
    allowClear
    aria-label={ariaLabel}
    className={clsx('ds-admin-search-input', className)}
    placeholder={placeholder}
    prefix={<AppIcon name="search" size={15} aria-hidden />}
    style={{ width, ...style }}
  />
);
