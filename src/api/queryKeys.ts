export const queryKeys = {
  me: ['me'] as const,
  overview: (range: string) => ['overview', range] as const,
  services: (status: string) => ['services', status] as const,
  metricSeries: (query: string, range: string, step: string, service: string) =>
    ['metric-series', query, range, step, service] as const,
  slo: (range: string) => ['slo', range] as const,
  smtpSettings: ['smtp-settings'] as const,
  incidents: (status: string, severity: string) => ['incidents', status, severity] as const,
  audit: (params: string) => ['audit', params] as const,
  users: ['users'] as const,
};
