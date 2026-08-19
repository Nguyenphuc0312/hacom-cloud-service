/**
 * Phân loại lý do gửi tin thất bại, và đọc trạng thái kết nối hiện tại.
 *
 * Tách khỏi `chatStore.ts`: logic thuần (chỉ đọc `navigator` / socket, không
 * đụng store). Kết quả quyết định thông báo người dùng nhìn thấy và tin có được
 * xếp hàng gửi lại hay không — phân loại sai thì hoặc báo nhầm nguyên nhân,
 * hoặc chôn một tin không bao giờ retry.
 */
import axios from "axios";

import type { extractApiError } from "../lib/apiContract";
import { getSocket } from "../lib/socket";
import i18n from "../i18n";
import type { Message } from "../types";

/** `null` khi môi trường không cho biết (SSR / trình duyệt cũ). */
export const getBrowserOnlineState = (): boolean | null => {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.onLine !== "boolean"
  ) {
    return null;
  }

  return navigator.onLine;
};

export const resolveConnectionSendMode = ():
  | "online"
  | "reconnecting"
  | "offline" => {
  const connectionState = getSocket()?.getConnectionState() ?? "disconnected";
  if (connectionState === "connected") {
    return "online";
  }
  if (
    connectionState === "connecting" ||
    connectionState === "authenticating" ||
    connectionState === "reconnecting"
  ) {
    return "reconnecting";
  }
  return "offline";
};

/** Axios báo timeout qua nhiều đường khác nhau tuỳ tầng gây lỗi. */
export const isAxiosTimeoutError = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  return (
    error.code === "ECONNABORTED" ||
    /timeout/i.test(error.message || "") ||
    /timeout/i.test(String(error.cause || ""))
  );
};

/**
 * Trình duyệt báo offline thì tin ngay, không cần xét lỗi. Ngoài ra, axios
 * không có `response` nghĩa là request chưa từng tới được server.
 */
export const isNetworkError = (error: unknown): boolean => {
  if (getBrowserOnlineState() === false) {
    return true;
  }
  return axios.isAxiosError(error) && !error.response;
};

export interface SendFailureDescriptor {
  failureReason: NonNullable<Message["failureReason"]>;
  errorCode: string;
  errorMessage: string;
}

/**
 * Thứ tự xét có chủ ý: timeout → mất mạng → 5xx → 4xx → không rõ.
 * Lỗi hạ tầng phải được nhận diện trước lỗi từ server, vì khi mất mạng thì mã
 * trạng thái kèm theo (nếu có) không đáng tin.
 */
export const resolveSendFailureDescriptor = (
  error: unknown,
  apiError: ReturnType<typeof extractApiError>,
): SendFailureDescriptor => {
  if (isAxiosTimeoutError(error)) {
    return {
      failureReason: "timeout",
      errorCode: "REQUEST_TIMEOUT",
      errorMessage: i18n.t("chat:message.status.timeoutError", {
        defaultValue: "Message timed out. Please retry.",
      }),
    };
  }

  if (isNetworkError(error)) {
    return {
      failureReason: "network",
      errorCode: "NETWORK_OFFLINE",
      errorMessage: i18n.t("chat:message.status.networkError", {
        defaultValue: "No network connection. Please retry.",
      }),
    };
  }

  if (apiError.statusCode >= 500) {
    return {
      failureReason: "backend_5xx",
      errorCode: "BACKEND_5XX",
      errorMessage: i18n.t("chat:message.status.backend5xxError", {
        defaultValue: "Server is busy. Please try again.",
      }),
    };
  }

  if (apiError.statusCode >= 400) {
    return {
      failureReason: "backend_4xx",
      errorCode: "BACKEND_4XX",
      errorMessage: i18n.t("chat:message.status.backend4xxError", {
        defaultValue: "Message was rejected. Please retry.",
      }),
    };
  }

  return {
    failureReason: "unknown",
    errorCode: "UNKNOWN_ERROR",
    errorMessage: i18n.t("chat:message.status.unknownError", {
      defaultValue: "Could not send message.",
    }),
  };
};
