type AppEnvironment = 'DEV' | 'TEST' | 'STAGING' | 'PROD';

const DEFAULT_DASHBOARD_REFETCH_INTERVAL_MS = 15_000;
const DEFAULT_BACKGROUND_REFETCH_INTERVAL_MS = 60_000;

const normalizeEnvironment = (value: string | undefined): AppEnvironment => {
  const normalized = value?.trim().toUpperCase();

  if (normalized === 'PROD' || normalized === 'PRODUCTION') {
    return 'PROD';
  }

  if (normalized === 'STAGING' || normalized === 'UAT') {
    return 'STAGING';
  }

  if (normalized === 'TEST' || normalized === 'QA') {
    return 'TEST';
  }

  return 'DEV';
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const normalizeOptionalUrl = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

interface PollingConfig {
  default: number;
  background: number;
}

const getPollingConfig = (): PollingConfig => {
  const env = normalizeEnvironment(import.meta.env.VITE_APP_ENV);
  const isProduction = env === 'PROD' || env === 'STAGING';

  return {
    default: parsePositiveInteger(
      import.meta.env.VITE_DASHBOARD_REFETCH_INTERVAL_MS,
      DEFAULT_DASHBOARD_REFETCH_INTERVAL_MS,
    ),
    background: isProduction
      ? parsePositiveInteger(
          import.meta.env.VITE_DASHBOARD_BACKGROUND_INTERVAL_MS,
          DEFAULT_BACKGROUND_REFETCH_INTERVAL_MS,
        )
      : DEFAULT_BACKGROUND_REFETCH_INTERVAL_MS,
  };
};

const environment = normalizeEnvironment(import.meta.env.VITE_APP_ENV);
const liveUpdatesUrl =
  normalizeOptionalUrl(import.meta.env.VITE_LIVE_UPDATES_URL) ??
  normalizeOptionalUrl(import.meta.env.VITE_WS_URL);

const environmentLabelMap: Record<AppEnvironment, string> = {
  DEV: 'Phát triển',
  TEST: 'Kiểm thử',
  STAGING: 'Staging',
  PROD: 'Production',
};

export const appConfig = {
  environment,
  environmentLabel: environmentLabelMap[environment],
  dashboardRefetchIntervalMs: parsePositiveInteger(
    import.meta.env.VITE_DASHBOARD_REFETCH_INTERVAL_MS,
    DEFAULT_DASHBOARD_REFETCH_INTERVAL_MS,
  ),
  pollingConfig: getPollingConfig(),
  adminWriteActionsEnabled:
    (import.meta.env.VITE_ADMIN_WRITE_ACTIONS_ENABLED ?? 'false').toLowerCase() === 'true',
  liveUpdatesUrl,
  liveUpdatesMode: liveUpdatesUrl ? 'live' : 'polling',
  liveUpdatesLabel: liveUpdatesUrl ? 'Luồng trực tiếp' : 'Làm mới theo chu kỳ',
} as const;

export type AppConfig = typeof appConfig;
