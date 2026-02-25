import axios from "axios";
import { API_BASE_URL } from "../config";
import { ROUTE_PATHS } from "../router/paths";
import { disconnectSocket } from "../lib/socket";
import { cancelPendingRequests } from "../lib/axios";
import {
  clearTokens,
  getRefreshToken,
  isRefreshTokenCookieMode,
} from "./tokenService";

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
  const payload =
    !isRefreshTokenCookieMode() && refreshToken ? { refreshToken } : undefined;

  await axios.post(`${API_BASE_URL}/auth/logout`, payload, {
    timeout: 10000,
    withCredentials: true,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Contract": "2",
    },
  });
};

export const runClientLogoutCleanup = (reason: string): void => {
  cancelPendingRequests(`logout:${reason}`);
  disconnectSocket();
  clearTokens();
};

export const redirectToLogin = (): void => {
  if (!isBrowser()) return;
  if (window.location.pathname === ROUTE_PATHS.LOGIN) return;
  window.location.replace(ROUTE_PATHS.LOGIN);
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
