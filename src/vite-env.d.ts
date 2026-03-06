/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_API_BASE_URL: string;
  readonly VITE_APP_ENV?: 'DEV' | 'STAGING' | 'PROD' | string;
  readonly VITE_DASHBOARD_REFETCH_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
