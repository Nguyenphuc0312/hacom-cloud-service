/**
 * @fileoverview Toast utility functions
 */

import toastLib from "react-hot-toast";

const TOAST_DEDUPE_WINDOW_MS = 1800;
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

export const toast = {
  success: (message: string) => {
    const id = buildToastId("success", message);
    if (shouldSuppressToast(id)) {
      return;
    }

    toastLib.success(message, {
      id,
      duration: 3000,
      className: "toast-base toast-success",
      iconTheme: {
        primary: "hsl(var(--color-text-inverse))",
        secondary: "hsl(var(--color-success))",
      },
    });
  },

  error: (message: string) => {
    const id = buildToastId("error", message);
    if (shouldSuppressToast(id)) {
      return;
    }

    toastLib.error(message, {
      id,
      duration: 4000,
      className: "toast-base toast-danger",
      iconTheme: {
        primary: "hsl(var(--color-text-inverse))",
        secondary: "hsl(var(--color-danger))",
      },
    });
  },

  info: (message: string) => {
    const id = buildToastId("info", message);
    if (shouldSuppressToast(id)) {
      return;
    }

    toastLib(message, {
      id,
      duration: 3000,
      className: "toast-base toast-info",
      icon: "i",
    });
  },

  warning: (message: string) => {
    const id = buildToastId("warning", message);
    if (shouldSuppressToast(id)) {
      return;
    }

    toastLib(message, {
      id,
      duration: 3000,
      className: "toast-base toast-warning",
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
      className: "toast-base toast-neutral",
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
    return toastLib.promise(
      promise,
      {
        loading: msgs.loading,
        success: msgs.success,
        error: msgs.error,
      },
      {
        className: "toast-base",
      },
    );
  },
};

export default toast;
