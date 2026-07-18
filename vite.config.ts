import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
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
  // chat-api (ticket "Báo cáo sự cố") — origin khác admin/auth, phải proxy riêng.
  const chatApiProxyTarget = resolveHttpProxyTarget(
    env.VITE_DEV_CHAT_API_PROXY_TARGET,
    'https://chat.hacomholdings.com.vn',
  );

  // Backend chặn theo Origin (403 nếu origin lạ). changeOrigin chỉ đổi Host, không đổi Origin,
  // nên khi proxy sang backend thật ta phải viết lại Origin = origin của chính target đó.
  const rewriteOriginToTarget =
    (target: string): NonNullable<ProxyOptions['configure']> =>
    (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        const origin = new URL(target).origin;
        proxyReq.setHeader('origin', origin);
        proxyReq.setHeader('referer', `${origin}/`);
      });
    };

  return {
    plugins: [react()],
    // Keep the production bundle rooted at the host root so one build can be deployed everywhere.
    base: '/',
    build: {
      assetsDir: 'assets',
      emptyOutDir: true,
    },
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
          configure: rewriteOriginToTarget(adminProxyTarget),
        },
        '/api/v1/auth': {
          target: authProxyTarget,
          changeOrigin: true,
          secure: false,
          configure: rewriteOriginToTarget(authProxyTarget),
        },
        '/api/v1/support': {
          target: chatApiProxyTarget,
          changeOrigin: true,
          secure: false,
          configure: rewriteOriginToTarget(chatApiProxyTarget),
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup/setup.ts',
    },
  };
});
