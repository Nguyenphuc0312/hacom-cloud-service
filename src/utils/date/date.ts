import dayjs from 'dayjs';

export const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm:ss') : '-';
};

export const formatRelativeTime = (value?: string): string => {
  if (!value) return '-';

  const date = dayjs(value);
  if (!date.isValid()) return '-';

  const diffMinutes = date.diff(dayjs(), 'minute');
  const absMinutes = Math.abs(diffMinutes);
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

  if (absMinutes < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  const diffHours = date.diff(dayjs(), 'hour');
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  const diffDays = date.diff(dayjs(), 'day');
  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, 'day');
  }

  return date.format('DD/MM/YYYY');
};

export const toIso = (value: dayjs.Dayjs): string => value.toISOString();
