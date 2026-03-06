import dayjs from 'dayjs';

export const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm:ss') : '-';
};

export const toIso = (value: dayjs.Dayjs): string => value.toISOString();
