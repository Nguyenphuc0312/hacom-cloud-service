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
