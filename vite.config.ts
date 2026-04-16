import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const resolveHttpProxyTarget = (value: string | undefined, fallback: string): string => {
  const normalized = value?.trim();
  if (normalized && /^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return fallback;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const adminProxyTarget = resolveHttpProxyTarget(
    env.VITE_DEV_ADMIN_PROXY_TARGET,
    'http://localhost:3201',
  );
  const authProxyTarget = resolveHttpProxyTarget(
    env.VITE_DEV_AUTH_PROXY_TARGET,
    'http://localhost:3101',
  );

  return {
    plugins: [react()],
    base: env.VITE_APP_BASE_PATH || '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5174,
      strictPort: true,
      proxy: {
        '/api/v1/admin': {
          target: adminProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/api/v1/auth': {
          target: authProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  };
});
