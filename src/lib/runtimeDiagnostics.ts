import { PUBLIC_CHAT_CONTRACT_VERSION } from "@hacom/chat-shared-types/runtime";

export interface ChatWebRuntimeDiagnostics {
  appVersion: string;
  buildSha: string;
  buildTime: string;
  publicChatContractVersion: string;
  mode: string;
}

export const chatWebRuntimeDiagnostics: ChatWebRuntimeDiagnostics = Object.freeze({
  appVersion: __CHAT_WEB_APP_VERSION__,
  buildSha: __CHAT_WEB_BUILD_SHA__,
  buildTime: __CHAT_WEB_BUILD_TIME__,
  publicChatContractVersion: PUBLIC_CHAT_CONTRACT_VERSION,
  mode: import.meta.env.MODE,
});

export const installChatWebDiagnostics = (): ChatWebRuntimeDiagnostics => {
  if (typeof window !== "undefined") {
    window.__CHAT_WEB_DIAGNOSTICS__ = chatWebRuntimeDiagnostics;
  }

  return chatWebRuntimeDiagnostics;
};
