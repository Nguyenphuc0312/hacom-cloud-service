import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

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
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
  ) as { version?: string };
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
  const shouldAnalyzeBundle = mode === "analyze";

  return {
    base: normalizeBasePath(env.VITE_APP_BASE_PATH),
    define: {
      __CHAT_WEB_APP_VERSION__: JSON.stringify(
        env.VITE_APP_VERSION || packageJson.version || "0.0.0",
      ),
      __CHAT_WEB_BUILD_SHA__: JSON.stringify(
        env.VITE_APP_BUILD_SHA || env.GIT_SHA || env.COMMIT_SHA || "unknown",
      ),
      __CHAT_WEB_BUILD_TIME__: JSON.stringify(
        env.VITE_APP_BUILD_TIME || new Date().toISOString(),
      ),
    },
    plugins: [
      react(),
      shouldAnalyzeBundle &&
        visualizer({
          filename: "dist/bundle-analysis.html",
          gzipSize: true,
          brotliSize: true,
          template: "treemap",
        }),
    ].filter(Boolean),
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

            if (normalizedId.includes("/src/components/info/UserProfile")) {
              return "chat-panel-user-profile";
            }

            if (normalizedId.includes("/src/components/info/GroupInfo")) {
              return "chat-panel-group-info";
            }

            if (normalizedId.includes("/src/components/chat/SearchPanel")) {
              return "chat-panel-search";
            }

            if (
              normalizedId.includes("/src/components/chat/PinnedMessagesPanel")
            ) {
              return "chat-panel-pinned";
            }

            if (normalizedId.includes("/src/components/modals/NewChatModal")) {
              return "chat-modal-new-chat";
            }

            if (
              normalizedId.includes("/src/components/modals/ImagePreviewModal")
            ) {
              return "chat-modal-image-preview";
            }

            if (
              normalizedId.includes("/src/components/modals/FilePreviewModal")
            ) {
              return "chat-modal-file-preview";
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
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      exclude: [
        "e2e/**",
        "**/e2e/**",
        "dist/**",
        "node_modules/**",
        "playwright.config.*",
      ],
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
