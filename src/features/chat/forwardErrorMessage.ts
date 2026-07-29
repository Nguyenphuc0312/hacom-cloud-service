/**
 * Thông điệp lỗi cho luồng chuyển tiếp tin nhắn (modal Chia sẻ + quick-forward
 * kéo-thả). Cả hai đều nuốt lỗi thành một câu chung chung, nên người dùng thấy
 * "Không thể chuyển tiếp tin nhắn" mà không biết vì sao — trong khi BE đã trả
 * lý do cụ thể (vd DM đã huỷ kết bạn → DIRECT_CHAT_FRIENDSHIP_REQUIRED, 403).
 */

import i18n from "../../i18n";

export const resolveForwardErrorMessage = (error: unknown): string => {
  const { code, message } = (error ?? {}) as {
    code?: string;
    message?: string;
  };

  if (code === "DIRECT_CHAT_FRIENDSHIP_REQUIRED") {
    return i18n.t("chat:composer.unfriendedRestriction");
  }

  return message || i18n.t("chat:message.forward.error");
};
