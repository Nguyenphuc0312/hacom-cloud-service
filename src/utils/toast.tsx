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

// Duration scales with severity: the more the user needs to act on it, the longer it stays.
const SUCCESS_TOAST_DURATION_MS = 4000;
const INFO_TOAST_DURATION_MS = 4500;
const WARNING_TOAST_DURATION_MS = 5000;
const ERROR_TOAST_DURATION_MS = 6000;

/**
 * Chống lặp phải phủ TRỌN thời gian toast còn trên màn hình.
 *
 * Lỗi thật: cửa sổ chống lặp cũ là 1800ms trong khi toast lỗi sống 6000ms. Mỗi
 * toast dùng `id` cố định suy từ nội dung, mà `react-hot-toast` coi việc bắn
 * lại cùng `id` là CẬP NHẬT toast đang có — kèm theo đó là hẹn giờ đóng được
 * đặt lại từ đầu. Nên một lỗi lặp mỗi ~2s (401 rồi refresh token rồi lại 401)
 * lọt qua chống lặp và liên tục gia hạn chính nó ⇒ **toast đứng mãi không tắt**,
 * đúng hiện tượng "Phiên đăng nhập đã hết hạn" nằm lì trên màn hình.
 *
 * Lấy đúng thời lượng của từng mức để cửa sổ chống lặp luôn ≥ tuổi thọ toast:
 * trong lúc toast còn hiện, mọi lần bắn lại đều bị chặn, hẹn giờ không bị đặt
 * lại, toast tự tắt đúng hạn.
 */
const toastDedupedAt = new Map<string, number>();

/** Dọn khoá cũ để Map không phình theo mỗi nội dung lỗi khác nhau. */
const pruneDedupeKeys = (now: number) => {
  if (toastDedupedAt.size < 50) return;
  for (const [key, shownAt] of toastDedupedAt) {
    if (now - shownAt > ERROR_TOAST_DURATION_MS) toastDedupedAt.delete(key);
  }
};

const shouldSuppressToast = (key: string, windowMs: number): boolean => {
  const now = Date.now();
  const lastShownAt = toastDedupedAt.get(key) ?? 0;
  if (now - lastShownAt < windowMs) {
    return true;
  }
  pruneDedupeKeys(now);
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
    if (shouldSuppressToast(id, SUCCESS_TOAST_DURATION_MS)) {
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
    if (shouldSuppressToast(id, ERROR_TOAST_DURATION_MS)) {
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
    if (shouldSuppressToast(id, INFO_TOAST_DURATION_MS)) {
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
    if (shouldSuppressToast(id, WARNING_TOAST_DURATION_MS)) {
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
