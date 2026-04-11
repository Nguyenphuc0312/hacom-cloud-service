import { Card } from 'antd';
import type { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
}

export const FilterBar = ({ children }: FilterBarProps) => {
  return <Card className="filter-bar">{children}</Card>;
};
