/**
 * @fileoverview Contextual notification routing helpers
 */

import { toast } from "./toast";
import { ROUTE_PATHS } from "../router/paths";

export const isMessageModule = (pathname: string): boolean =>
  pathname === ROUTE_PATHS.CHAT ||
  pathname.startsWith(`${ROUTE_PATHS.CHAT}/`);

type ToastLevel = "success" | "error" | "info" | "warning";

interface ToastOptions {
  level: ToastLevel;
  message: string;
  dedupeKey?: string;
  cooldownMs?: number;
}

const toastCooldownMap = new Map<string, number>();
const DEFAULT_TOAST_COOLDOWN_MS = 12_000;

const emitWindowEvent = (
  eventName: string,
  detail?: Record<string, unknown>,
): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
};

const canEmitToast = (dedupeKey: string, cooldownMs: number): boolean => {
  const now = Date.now();
  const lastAt = toastCooldownMap.get(dedupeKey) ?? 0;
  if (now - lastAt < cooldownMs) {
    return false;
  }
  toastCooldownMap.set(dedupeKey, now);
  return true;
};

export const notifyRoomInline = (
  eventName: string,
  detail?: Record<string, unknown>,
): void => {
  emitWindowEvent(eventName, detail);
};

export const notifySidebarState = (
  eventName: string,
  detail?: Record<string, unknown>,
): void => {
  emitWindowEvent(eventName, detail);
};

export const notifyGlobalToast = ({
  level,
  message,
  dedupeKey,
  cooldownMs = DEFAULT_TOAST_COOLDOWN_MS,
}: ToastOptions): void => {
  if (dedupeKey && !canEmitToast(dedupeKey, cooldownMs)) {
    return;
  }

  toast[level](message);
};

export const clearNotificationCooldowns = (): void => {
  toastCooldownMap.clear();
};
