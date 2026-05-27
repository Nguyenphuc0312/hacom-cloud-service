/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV: 'development' | 'staging' | 'production' | 'docker' | string;
  readonly VITE_APP_BASE_PATH: string;
  readonly VITE_DASHBOARD_REFETCH_INTERVAL_MS: string;
  readonly VITE_ADMIN_WRITE_ACTIONS_ENABLED: 'true' | 'false';
  readonly VITE_LIVE_UPDATES_URL: string;
  readonly VITE_WS_URL: string;

  // Admin API
  readonly VITE_ADMIN_API_BASE_URL: string;
  readonly VITE_AUTH_BASE_URL: string;
  readonly VITE_ADMIN_API_ROOT: string;

  // Dev proxy targets (Vite dev server only, not bundled)
  readonly VITE_DEV_ADMIN_PROXY_TARGET: string;
  readonly VITE_DEV_AUTH_PROXY_TARGET: string;

  // Legacy
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
