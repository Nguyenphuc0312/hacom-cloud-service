/**
 * @fileoverview Toast utility functions
 */

import toastLib from "react-hot-toast";

export const toast = {
  success: (message: string) => {
    toastLib.success(message, {
      duration: 3000,
      position: "top-center",
      className: "toast-base toast-success",
      iconTheme: {
        primary: "hsl(var(--color-text-inverse))",
        secondary: "hsl(var(--color-success))",
      },
    });
  },

  error: (message: string) => {
    toastLib.error(message, {
      duration: 4000,
      position: "top-center",
      className: "toast-base toast-danger",
      iconTheme: {
        primary: "hsl(var(--color-text-inverse))",
        secondary: "hsl(var(--color-danger))",
      },
    });
  },

  info: (message: string) => {
    toastLib(message, {
      duration: 3000,
      position: "top-center",
      className: "toast-base toast-info",
      icon: "i",
    });
  },

  warning: (message: string) => {
    toastLib(message, {
      duration: 3000,
      position: "top-center",
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
      position: "top-center",
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
        position: "top-center",
        className: "toast-base",
      },
    );
  },
};

export default toast;
