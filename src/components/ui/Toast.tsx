/**
 * @fileoverview Toast container component
 * Hiển thị toast notifications sử dụng react-hot-toast
 */

import React from "react";
import { Toaster } from "react-hot-toast";

/**
 * Toast Provider - Thêm vào root của app
 */
export const ToastProvider: React.FC = () => {
  return (
    <Toaster
      position="top-right"
      gutter={12}
      containerClassName="toast-container"
      toastOptions={{
        duration: 5500,
        className: "toast-library",
      }}
    />
  );
};

export default ToastProvider;
