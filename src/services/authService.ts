import axios from "axios";
import {
  PUBLIC_CHAT_CONTRACT_HEADER,
  PUBLIC_CHAT_CONTRACT_VERSION,
} from "@hacom/chat-shared-types/runtime";
import { buildAuthEndpoint } from "../lib/authPath";
import { AUTH_ENDPOINTS } from "../lib/authEndpoints";
import { ROUTE_PATHS } from "../router/paths";
import { disconnectSocket } from "../lib/socket";
import { cancelPendingRequests } from "../lib/axios";
import { softNavigate } from "../lib/softNavigator";
import {
  clearCurrentTabTokens,
  clearTokens,
  getAccessToken,
  getCsrfToken,
  getRefreshToken,
  isRefreshTokenCookieMode,
} from "./tokenService";
import { clearPersistedUploadDrafts } from "./uploadDraftStorage";
import { usePresenceStore } from "../stores/presenceStore";

type LogoutEventPayload = {
  reason: string;
  sourceTabId: string;
  timestamp: number;
};

const AUTH_BROADCAST_CHANNEL = "auth-events";
const AUTH_STORAGE_EVENT_KEY = "auth:logout:event";
const TAB_ID = Math.random().toString(36).slice(2);

let logoutListenerAttached = false;
let broadcastListenerChannel: BroadcastChannel | null = null;

const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

const broadcastLogoutEvent = (reason: string): void => {
  if (!isBrowser()) return;

  const payload: LogoutEventPayload = {
    reason,
    sourceTabId: TAB_ID,
    timestamp: Date.now(),
  };

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  }

  localStorage.setItem(AUTH_STORAGE_EVENT_KEY, JSON.stringify(payload));
};

export const requestServerLogout = async (): Promise<void> => {
  const refreshToken = getRefreshToken();
  const accessToken = getAccessToken();
  const csrfToken = getCsrfToken();
  const payload =
    !isRefreshTokenCookieMode() && refreshToken ? { refreshToken } : undefined;

  await axios.post(buildAuthEndpoint(AUTH_ENDPOINTS.logout), payload, {
    timeout: 10000,
    // Stage 1 body-mode: withCredentials=false (no cookies).
    withCredentials: isRefreshTokenCookieMode(),
    headers: {
      "Content-Type": "application/json",
      [PUBLIC_CHAT_CONTRACT_HEADER]: PUBLIC_CHAT_CONTRACT_VERSION,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
  });
};

export const runClientLogoutCleanup = (reason: string): void => {
  cancelPendingRequests(`logout:${reason}`);
  disconnectSocket();
  clearTokens();
  clearPersistedUploadDrafts();
  usePresenceStore.getState().clearAll();
};

export const runCurrentTabIdentityMismatchCleanup = (reason: string): void => {
  cancelPendingRequests(`logout:${reason}`);
  disconnectSocket();
  clearCurrentTabTokens();
  clearPersistedUploadDrafts();
  usePresenceStore.getState().clearAll();
};

export const redirectToLogin = (): void => {
  if (!isBrowser()) return;
  if (window.location.pathname === ROUTE_PATHS.LOGIN) return;
  softNavigate(ROUTE_PATHS.LOGIN, { replace: true });
};

export const notifyLogoutAcrossTabs = (reason: string): void => {
  broadcastLogoutEvent(reason);
};

export const initializeAuthSync = (
  onRemoteLogout: (reason: string) => void,
): void => {
  if (!isBrowser() || logoutListenerAttached) return;

  logoutListenerAttached = true;

  if (typeof BroadcastChannel !== "undefined") {
    broadcastListenerChannel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    broadcastListenerChannel.onmessage = (
      event: MessageEvent<LogoutEventPayload>,
    ) => {
      const payload = event.data;
      if (!payload || payload.sourceTabId === TAB_ID) return;
      onRemoteLogout(payload.reason);
    };
  }

  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key !== AUTH_STORAGE_EVENT_KEY || !event.newValue) {
      return;
    }

    try {
      const payload = JSON.parse(event.newValue) as LogoutEventPayload;
      if (!payload || payload.sourceTabId === TAB_ID) return;
      onRemoteLogout(payload.reason);
    } catch {
      // Ignore malformed cross-tab event payload.
    }
  });
};
