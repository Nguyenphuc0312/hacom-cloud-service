import fs from "node:fs";
import path from "node:path";
import { createLogger, loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";

// ---------------------------------------------------------------------------
// Custom logger — suppress benign WS disconnect noise from vite's proxy
// ---------------------------------------------------------------------------
const BENIGN_WS_PATTERNS = [/EPIPE/, /ECONNRESET/, /ERR_STREAM_DESTROYED/];
const isBenignWsLog = (msg: string) => BENIGN_WS_PATTERNS.some((re) => re.test(msg));

const baseLogger = createLogger();
const devLogger = {
  ...baseLogger,
  warn(msg: string, opts?: Parameters<typeof baseLogger.warn>[1]) {
    if (isBenignWsLog(msg)) return;
    baseLogger.warn(msg, opts);
  },
  error(msg: string, opts?: Parameters<typeof baseLogger.error>[1]) {
    if (isBenignWsLog(msg)) return;
    baseLogger.error(msg, opts);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizeBasePath = (value?: string): string => {
  const raw = value?.trim();
  if (!raw || raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return `${withSlash.replace(/\/+$/, "")}/`;
};

const resolveHttpTarget = (value: string | undefined, fallback: string): string => {
  const v = value?.trim();
  return v && /^https?:\/\//i.test(v) ? v : fallback;
};

/**
 * Vite's WS proxy (http-proxy) expects an HTTP/HTTPS target URL,
 * not a ws:// URL — it performs the HTTP→WS upgrade internally.
 */
const resolveWsTarget = (value: string | undefined, fallback: string): string => {
  const v = value?.trim();
  if (!v) return fallback;
  if (/^wss?:\/\//i.test(v)) return v.replace(/^wss?:\/\//i, (m) => (m.startsWith("wss") ? "https://" : "http://"));
  if (/^https?:\/\//i.test(v)) return v;
  return fallback;
};

/** EPIPE / ECONNRESET happen when the browser closes the connection — benign. */
const isBenignError = (err: Error): boolean => {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "EPIPE" || code === "ECONNRESET" || code === "ERR_STREAM_DESTROYED";
};

/**
 * Build an HTTP proxy entry that:
 *  - Spoofs Origin/Referer so upstream doesn't reject localhost
 *  - Silently drops EPIPE/ECONNRESET instead of flooding the console
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProxy = any;

const httpProxy = (target: string) => ({
  target,
  changeOrigin: true,
  secure: false,
  configure: (proxy: AnyProxy) => {
    proxy.on("proxyReq", (proxyReq: { setHeader: (k: string, v: string) => void }) => {
      proxyReq.setHeader("Origin", target);
      proxyReq.setHeader("Referer", `${target}/`);
    });

    proxy.on(
      "error",
      (err: Error, _req: IncomingMessage, res: ServerResponse | Socket) => {
        if (isBenignError(err)) return;
        console.error("[proxy:http]", err.message);
        if ("headersSent" in res && !(res as ServerResponse).headersSent) {
          (res as ServerResponse).writeHead(502).end(JSON.stringify({ error: "Bad Gateway" }));
        }
      },
    );
  },
});

/**
 * Build a WebSocket proxy entry that:
 *  - Spoofs Origin so upstream doesn't reject localhost
 *  - Silently drops EPIPE/ECONNRESET on disconnect
 */
const wsProxy = (target: string) => ({
  target,
  ws: true,
  changeOrigin: true,
  secure: false,
  configure: (proxy: AnyProxy) => {
    proxy.on("proxyReqWs", (proxyReq: { setHeader: (k: string, v: string) => void }) => {
      const wsOrigin = target.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws"));
      proxyReq.setHeader("Origin", wsOrigin);
    });

    proxy.on("error", (err: Error) => {
      if (isBenignError(err)) return;
      console.error("[proxy:ws]", err.message);
    });
  },
});

// ---------------------------------------------------------------------------
// Vite config
// ---------------------------------------------------------------------------

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
  ) as { version?: string };

  const apiTarget  = resolveHttpTarget(env.VITE_DEV_API_PROXY_TARGET,  "http://localhost:3001");
  const authTarget = resolveHttpTarget(env.VITE_DEV_AUTH_PROXY_TARGET, "http://localhost:3101");
  const wsTarget   = resolveWsTarget(env.VITE_DEV_WS_PROXY_TARGET,    "http://localhost:8001");

  const shouldAnalyzeBundle = mode === "analyze";

  return {
    base: normalizeBasePath(env.VITE_APP_BASE_PATH),

    define: {
      __CHAT_WEB_APP_VERSION__: JSON.stringify(env.VITE_APP_VERSION || packageJson.version || "0.0.0"),
      __CHAT_WEB_BUILD_SHA__:   JSON.stringify(env.VITE_APP_BUILD_SHA || env.GIT_SHA || env.COMMIT_SHA || "unknown"),
      __CHAT_WEB_BUILD_TIME__:  JSON.stringify(env.VITE_APP_BUILD_TIME || new Date().toISOString()),
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
        // Surface CIRCULAR_CHUNK warnings. We previously suppressed them on
        // the assumption that cross-chunk imports are only used inside
        // function bodies; that was incorrect. React 19's `Activity`
        // namespace augmentation runs at module init, so any cycle between
        // react-core and a vendor chunk that imports React APIs (e.g.
        // @tiptap/react) crashes production with:
        //   "Cannot set properties of undefined (setting 'Activity')".
        // If a circular warning fires, fix the chunking — do not silence it.
        onwarn(warning, defaultHandler) {
          defaultHandler(warning);
        },
        output: {
          manualChunks(id) {
            const nid = id.replace(/\\/g, "/");
            if (!nid.includes("node_modules")) return undefined;

            // React core — match ONLY the exact top-level packages.
            // IMPORTANT: nid.includes("/react/") would also match scoped
            // packages like "@tiptap/react", so we use anchored regex that
            // requires "node_modules/" to immediately precede the package name.
            //
            // We ALSO bundle @tiptap/react into react-core. The Tiptap React
            // adapter touches React internals at module top level (it depends
            // on React 19's `Activity`/scheduler namespace). When it lives in
            // a separate chunk, Rollup's chunk graph forms a hidden cycle
            // with react-core and `Activity` is set on `undefined` at init,
            // producing: "Cannot set properties of undefined (setting
            // 'Activity')". Co-locating eliminates the cross-chunk init race.
            if (
              /\/node_modules\/react\//.test(nid) ||
              /\/node_modules\/react-dom\//.test(nid) ||
              /\/node_modules\/scheduler\//.test(nid) ||
              /\/node_modules\/@tiptap\/react\//.test(nid)
            ) {
              return "react-core";
            }

            // Client-side routing (~87 kB, no React-context dependencies)
            if (
              nid.includes("/react-router/") ||
              nid.includes("/react-router-dom/")
            ) {
              return "router-vendor";
            }

            // Rich text editor — TipTap (~355 kB)
            // @tiptap/react path contains "/react/" so it must NOT be matched
            // by the react-core check above. The anchored regex above ensures
            // only node_modules/react/ matches, not node_modules/@tiptap/react/.
            if (nid.includes("/@tiptap/")) {
              return "editor-vendor";
            }

            // Animation (~126 kB)
            if (nid.includes("/framer-motion/")) {
              return "animation-vendor";
            }

            // i18n — i18next + react-i18next + plugins (~56 kB)
            if (
              nid.includes("/i18next/") ||
              nid.includes("/react-i18next/") ||
              nid.includes("/i18next-resources-to-backend/") ||
              nid.includes("/i18next-browser-languagedetector/")
            ) {
              return "i18n-vendor";
            }

            // Redux + RTK + react-redux + immer + reselect (~61 kB)
            if (
              nid.includes("/redux/") ||
              nid.includes("/@reduxjs/") ||
              nid.includes("/react-redux/") ||
              nid.includes("/immer/") ||
              nid.includes("/reselect/")
            ) {
              return "redux-vendor";
            }

            // Zustand
            if (nid.includes("/zustand/")) {
              return "state-vendor";
            }

            // TanStack (query + virtual)
            if (nid.includes("/@tanstack/")) {
              return "tanstack-vendor";
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
      exclude: ["e2e/**", "**/e2e/**", "dist/**", "node_modules/**", "playwright.config.*"],
    },

    customLogger: devLogger,

    server: {
      host: "0.0.0.0",
      port: 5100,
      strictPort: true,
      proxy: {
        // Auth must be listed before the generic /api/v1 rule
        "/api/v1/auth": httpProxy(authTarget),
        "/api/v1":      httpProxy(apiTarget),
        "/ws":          wsProxy(wsTarget),
      },
    },
  };
});
