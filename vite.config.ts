import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const normalizeBasePath = (value?: string): string => {
  const rawValue = value?.trim();
  if (!rawValue || rawValue === "/") {
    return "/";
  }

  const withLeadingSlash = rawValue.startsWith("/") ? rawValue : `/${rawValue}`;
  return `${withLeadingSlash.replace(/\/+$/, "")}/`;
};

const resolveHttpProxyTarget = (
  value: string | undefined,
  fallback: string,
): string => {
  const normalized = value?.trim();
  if (normalized && /^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return fallback;
};

const resolveWsProxyTarget = (
  value: string | undefined,
  fallback: string,
): string => {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  if (/^wss?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized.replace(/^http/i, "ws");
  }

  return fallback;
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = resolveHttpProxyTarget(
    env.VITE_DEV_API_PROXY_TARGET,
    "http://localhost:3001",
  );
  const authProxyTarget = resolveHttpProxyTarget(
    env.VITE_DEV_AUTH_PROXY_TARGET,
    "http://localhost:3101",
  );
  const wsProxyTarget = resolveWsProxyTarget(
    env.VITE_DEV_WS_PROXY_TARGET,
    "ws://localhost:8001",
  );

  return {
    base: normalizeBasePath(env.VITE_APP_BASE_PATH),
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, "/");

            if (normalizedId.includes("node_modules")) {
              if (
                normalizedId.includes("/react/") ||
                normalizedId.includes("/react-dom/") ||
                normalizedId.includes("/react-router/") ||
                normalizedId.includes("/react-router-dom/") ||
                normalizedId.includes("/i18next/") ||
                normalizedId.includes("/react-i18next/") ||
                normalizedId.includes("/scheduler/")
              ) {
                return "react-vendor";
              }
            }

            if (
              normalizedId.includes("/src/components/info/UserProfile") ||
              normalizedId.includes("/src/components/info/GroupInfo") ||
              normalizedId.includes("/src/components/chat/SearchPanel") ||
              normalizedId.includes("/src/components/chat/PinnedMessagesPanel")
            ) {
              return "chat-side-panels";
            }

            if (
              normalizedId.includes("/src/components/modals/NewChatModal") ||
              normalizedId.includes("/src/components/modals/ImagePreviewModal") ||
              normalizedId.includes("/src/components/modals/FilePreviewModal")
            ) {
              return "chat-overlays";
            }

            return undefined;
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: true,
    },
    server: {
      host: "0.0.0.0",
      port: 5100,
      strictPort: true,
      proxy: {
        "/api/v1/auth": {
          target: authProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/api/v1": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/ws": {
          target: wsProxyTarget,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
