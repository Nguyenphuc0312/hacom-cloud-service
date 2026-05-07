/**
 * @fileoverview Toast utility functions.
 */

import toastLib from "react-hot-toast";
import type { ToastOptions } from "react-hot-toast";

const TOAST_DEDUPE_WINDOW_MS = 1800;
const DEFAULT_TOAST_DURATION_MS = 5500;
const ERROR_TOAST_DURATION_MS = 6000;
const toastDedupedAt = new Map<string, number>();

const shouldSuppressToast = (key: string): boolean => {
  const now = Date.now();
  const lastShownAt = toastDedupedAt.get(key) ?? 0;
  if (now - lastShownAt < TOAST_DEDUPE_WINDOW_MS) {
    return true;
  }
  toastDedupedAt.set(key, now);
  return false;
};

const buildToastId = (level: string, message: string): string =>
  `toast:${level}:${message.trim().toLowerCase()}`;

const baseOptions: ToastOptions = {
  className: "toast-library",
};

export const toast = {
  success: (message: string) => {
    const id = buildToastId("success", message);
    if (shouldSuppressToast(id)) {
      return;
    }

    toastLib.success(message, {
      ...baseOptions,
      id,
      duration: DEFAULT_TOAST_DURATION_MS,
      iconTheme: {
        primary: "#16a34a",
        secondary: "#ffffff",
      },
    });
  },

  error: (message: string) => {
    const id = buildToastId("error", message);
    if (shouldSuppressToast(id)) {
      return;
    }

    toastLib.error(message, {
      ...baseOptions,
      id,
      duration: ERROR_TOAST_DURATION_MS,
      iconTheme: {
        primary: "#dc2626",
        secondary: "#ffffff",
      },
    });
  },

  info: (message: string) => {
    const id = buildToastId("info", message);
    if (shouldSuppressToast(id)) {
      return;
    }

    toastLib(message, {
      ...baseOptions,
      id,
      duration: DEFAULT_TOAST_DURATION_MS,
      icon: "ℹ",
    });
  },

  warning: (message: string) => {
    const id = buildToastId("warning", message);
    if (shouldSuppressToast(id)) {
      return;
    }

    toastLib(message, {
      ...baseOptions,
      id,
      duration: DEFAULT_TOAST_DURATION_MS,
      icon: "!",
    });
  },

  dismiss: (toastId?: string) => {
    if (toastId) {
      toastLib.dismiss(toastId);
    } else {
      toastLib.dismiss();
    }
  },

  loading: (message: string) => {
    return toastLib.loading(message, {
      ...baseOptions,
    });
  },

  promise: <T>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string;
      error: string;
    },
  ) => {
    return toastLib.promise(promise, msgs, {
      ...baseOptions,
    });
  },
};

export default toast;
