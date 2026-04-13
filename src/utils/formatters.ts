export const formatNumber = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat().format(value);
};

export const formatPercent = (value?: number | null, digits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return `${value.toFixed(digits)}%`;
};

export const formatMs = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return `${Math.round(value)} ms`;
};

export const formatRate = (value?: number | null, suffix = '/s'): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(2)}${suffix}`;
};

export const formatBytes = (value?: number | null, perSecond = false): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let currentValue = value;
  let unitIndex = 0;

  while (currentValue >= 1024 && unitIndex < units.length - 1) {
    currentValue /= 1024;
    unitIndex += 1;
  }

  const normalized = currentValue >= 10 ? currentValue.toFixed(1) : currentValue.toFixed(2);
  return `${normalized} ${units[unitIndex]}${perSecond ? '/s' : ''}`;
};
