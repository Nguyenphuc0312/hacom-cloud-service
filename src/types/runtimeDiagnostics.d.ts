import type { ChatWebRuntimeDiagnostics } from "../lib/runtimeDiagnostics";

declare global {
  const __CHAT_WEB_APP_VERSION__: string;
  const __CHAT_WEB_BUILD_SHA__: string;
  const __CHAT_WEB_BUILD_TIME__: string;

  interface Window {
    __CHAT_WEB_DIAGNOSTICS__?: ChatWebRuntimeDiagnostics;
  }
}

export {};
