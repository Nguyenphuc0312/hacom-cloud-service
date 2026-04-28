import { AppTooltip } from '@/components/AppTooltip/AppTooltip';
import { formatDateTime, formatRelativeTime } from '@/utils/date/date';

interface DateTimeCellProps {
  value?: string | null;
  relative?: boolean;
}

export const DateTimeCell = ({ value, relative = true }: DateTimeCellProps) => {
  if (!value) {
    return <span className="ds-muted-cell">-</span>;
  }

  return (
    <AppTooltip title={formatDateTime(value)}>
      <time className="ds-date-time-cell" dateTime={value}>
        {relative ? formatRelativeTime(value) : formatDateTime(value)}
      </time>
    </AppTooltip>
  );
};
