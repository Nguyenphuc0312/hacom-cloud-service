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
// ECONNABORTED: browser aborts the HTTP→WS upgrade mid-flight (page refresh,
// React StrictMode double-mount cleanup, tab close during connection attempt).
// This is normal client-initiated teardown — not a backend or config error.
const BENIGN_WS_PATTERNS = [/EPIPE/, /ECONNRESET/, /ERR_STREAM_DESTROYED/, /ECONNABORTED/];
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

/**
 * EPIPE / ECONNRESET / ERR_STREAM_DESTROYED / ECONNABORTED:
 * all fired when the browser closes (or aborts) a connection — benign.
 */
const isBenignError = (err: Error): boolean => {
  const code = (err as NodeJS.ErrnoException).code;
  return (
    code === "EPIPE" ||
    code === "ECONNRESET" ||
    code === "ERR_STREAM_DESTROYED" ||
    code === "ECONNABORTED"
  );
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
      // Gorilla WS validates Origin as an HTTP(S) origin. Sending a ws(s):// scheme
      // gets a 403. target is already http(s):// (resolveWsTarget normalized it).
      proxyReq.setHeader("Origin", target);
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
  const hrTarget   = resolveHttpTarget(env.VITE_DEV_HR_PROXY_TARGET,   "http://localhost:3000");

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
        // pdfmake's `build/vfs_fonts.js` registers its embedded fonts via a
        // top-level `this.pdfMake.vfs = {…}` assignment. Rollup defaults a
        // module's top-level `this` to `undefined` (ESM strict semantics), so
        // in a production build that assignment throws a TypeError and the
        // dynamic import rejects — which is why PDF export works in `vite dev`
        // (esbuild pre-bundles it as CommonJS, `this` === exports) but silently
        // fails once deployed to web/desktop. Pin this one module's `this` to
        // globalThis so the fonts land on `globalThis.pdfMake.vfs` instead of
        // crashing; tableExport.ts reads them back from there.
        moduleContext: (id: string) =>
          id.replace(/\\/g, "/").includes("/pdfmake/build/vfs_fonts")
            ? "globalThis"
            : undefined,

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
            // We ALSO bundle React adapter packages into react-core. Any
            // library that calls React APIs (createContext, Activity, hooks
            // module init, etc.) at MODULE TOP LEVEL must share a chunk with
            // React itself, otherwise Rollup's chunk graph forms a hidden
            // cycle with react-core and React is `undefined` when the
            // adapter evaluates — producing crashes such as:
            //   "Cannot set properties of undefined (setting 'Activity')"
            //   "Cannot read properties of undefined (reading 'createContext')"
            // Co-locating eliminates the cross-chunk init race. The cost is
            // a slightly larger react-core chunk; the size impact per
            // adapter is small (each is ~10–50 kB).
            if (
              /\/node_modules\/react\//.test(nid) ||
              /\/node_modules\/react-dom\//.test(nid) ||
              /\/node_modules\/scheduler\//.test(nid) ||
              /\/node_modules\/@tiptap\/react\//.test(nid) ||
              /\/node_modules\/react-i18next\//.test(nid) ||
              /\/node_modules\/react-redux\//.test(nid) ||
              /\/node_modules\/react-router\//.test(nid) ||
              /\/node_modules\/react-router-dom\//.test(nid)
            ) {
              return "react-core";
            }

            // NOTE: react-router / react-router-dom / react-redux /
            // react-i18next have moved into react-core (see comment above)
            // because they touch React APIs at module init. They are
            // intentionally NOT routed here.

            // Rich text editor — TipTap (~355 kB).
            // The anchored react-core regex above only matches
            // node_modules/react/ — not node_modules/@tiptap/react/. And
            // @tiptap/react itself is captured by react-core, so this rule
            // only sees the framework-agnostic Tiptap packages.
            if (nid.includes("/@tiptap/")) {
              return "editor-vendor";
            }

            // Animation (~126 kB)
            if (nid.includes("/framer-motion/")) {
              return "animation-vendor";
            }

            // i18n core — framework-agnostic packages only. react-i18next is
            // in react-core because it calls React.createContext at module
            // init.
            if (
              nid.includes("/i18next/") ||
              nid.includes("/i18next-resources-to-backend/") ||
              nid.includes("/i18next-browser-languagedetector/")
            ) {
              return "i18n-vendor";
            }

            // Redux + RTK + immer + reselect — framework-agnostic only.
            // react-redux is in react-core (createContext at module init).
            if (
              nid.includes("/redux/") ||
              nid.includes("/@reduxjs/") ||
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

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
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
        // Quarantined post-cleanup (2026-05). See timeline-v2/__deprecated__/README.md.
        "**/__deprecated__/**",
      ],
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
        // HR API proxy — rewrites /hr-api/* → /api/* on the HR service host
        "/hr-api": {
          ...httpProxy(hrTarget),
          rewrite: (path: string) => path.replace(/^\/hr-api/, "/api"),
        },
      },
    },
  };
});
