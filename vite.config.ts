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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: normalizeBasePath(env.VITE_APP_BASE_PATH),
    plugins: [react()],
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: true,
    },
    server: {
      host: "0.0.0.0",
      port: 5100,
      strictPort: true,
    },
  };
});
