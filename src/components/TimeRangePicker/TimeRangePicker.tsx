import { Segmented } from 'antd';

import type { TimeRange } from '@/api/types/metrics/metrics';

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const options: { label: string; value: TimeRange }[] = [
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
];

export const TimeRangePicker = ({ value, onChange }: TimeRangePickerProps) => {
  return (
    <Segmented
      value={value}
      options={options}
      onChange={(nextValue) => onChange(nextValue as TimeRange)}
    />
  );
};
