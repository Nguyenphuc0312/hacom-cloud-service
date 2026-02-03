/**
 * @fileoverview Toast utility functions
 * Helper functions để show toast notifications
 */

import toastLib from "react-hot-toast";

/**
 * Toast utility object
 */
export const toast = {
  success: (message: string) => {
    toastLib.success(message, {
      duration: 3000,
      position: "top-center",
      style: {
        background: "#10B981",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: "12px",
        fontWeight: 500,
      },
      iconTheme: {
        primary: "#fff",
        secondary: "#10B981",
      },
    });
  },

  error: (message: string) => {
    toastLib.error(message, {
      duration: 4000,
      position: "top-center",
      style: {
        background: "#EF4444",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: "12px",
        fontWeight: 500,
      },
      iconTheme: {
        primary: "#fff",
        secondary: "#EF4444",
      },
    });
  },

  info: (message: string) => {
    toastLib(message, {
      duration: 3000,
      position: "top-center",
      style: {
        background: "#3B82F6",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: "12px",
        fontWeight: 500,
      },
      icon: "ℹ️",
    });
  },

  warning: (message: string) => {
    toastLib(message, {
      duration: 3000,
      position: "top-center",
      style: {
        background: "#F59E0B",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: "12px",
        fontWeight: 500,
      },
      icon: "⚠️",
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
      position: "top-center",
      style: {
        background: "#6B7280",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: "12px",
        fontWeight: 500,
      },
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
        position: "top-center",
        style: {
          padding: "12px 24px",
          borderRadius: "12px",
          fontWeight: 500,
        },
      },
    );
  },
};

export default toast;
