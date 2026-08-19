/**
 * @fileoverview Toast utility functions.
 *
 * Standardized toast API on top of react-hot-toast. All four severity levels
 * share a consistent look: a colored leading icon on the neutral `.toast-library`
 * surface. Display duration scales with severity (success is quick, error lingers).
 */

import toastLib from "react-hot-toast";
import type { ToastOptions } from "react-hot-toast";
import {
  InformationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";

const TOAST_DEDUPE_WINDOW_MS = 1800;

// Duration scales with severity: the more the user needs to act on it, the longer it stays.
const SUCCESS_TOAST_DURATION_MS = 4000;
const INFO_TOAST_DURATION_MS = 4500;
const WARNING_TOAST_DURATION_MS = 5000;
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
      duration: SUCCESS_TOAST_DURATION_MS,
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
      duration: INFO_TOAST_DURATION_MS,
      icon: <InformationCircleIcon className="h-5 w-5 text-[#1565C0]" />,
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
      duration: WARNING_TOAST_DURATION_MS,
      icon: <ExclamationTriangleIcon className="h-5 w-5 text-warning" />,
    });
  },

  dismiss: (toastId?: string) => {
    if (toastId) {
      toastLib.dismiss(toastId);
    } else {
      toastLib.dismiss();
    }
  },

  /** Success toast with a single action button (e.g. Undo). The button
   *  dismisses the toast and runs `onAction`. Lives longer than a plain success
   *  so the user has time to react. */
  action: (
    message: string,
    actionLabel: string,
    onAction: () => void,
    duration = SUCCESS_TOAST_DURATION_MS,
  ) => {
    const id = toastLib.custom(
      (tst) => (
        <div className="toast-library flex items-center gap-3">
          <span className="text-sm">{message}</span>
          <button
            type="button"
            onClick={() => {
              toastLib.dismiss(tst.id);
              onAction();
            }}
            className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-[#1565C0] transition-colors hover:bg-[#1565C0]/10"
          >
            {actionLabel}
          </button>
        </div>
      ),
      { duration },
    );
    return id;
  },

  loading: (message: string) => {
    return toastLib.loading(message, {
      ...baseOptions,
    });
  },

  promise: <T,>(
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
