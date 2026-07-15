import React from "react";
import { SparklesIcon, AlertCircleIcon } from "lucide-react";
import { Avatar } from "../../../components/common/Avatar";
import { useAuthStore } from "../../../stores/authStore";

/**
 * Avatar cho một dòng tin nhắn AI — dùng chung cho AI Công ty (AiChatPreview) và
 * AI Cá nhân (PersonalMessageBubble). Ba trạng thái:
 *   • assistant thường → dấu nhận diện HACOM AI (sparkles + gradient xanh)
 *   • assistant lỗi    → biểu tượng cảnh báo
 *   • user             → ảnh hồ sơ thật (fallback initials/icon do <Avatar> lo)
 *
 * Tất cả cùng `h-8 w-8` + `ring-2 ring-surface` + `mt-0.5` để hai bên avatar
 * căn cùng một hàng với nhãn/nội dung (không lệch giữa assistant và user).
 */
interface AiMessageAvatarProps {
  role: "user" | "assistant";
  isError?: boolean;
}

export const AiMessageAvatar: React.FC<AiMessageAvatarProps> = ({ role, isError }) => {
  const currentUser = useAuthStore((s) => s.user);

  if (role === "user") {
    // Không margin-top: dòng user căn giữa (items-center) nên avatar tự canh
    // giữa bong bóng.
    return (
      <Avatar
        src={currentUser?.avatar}
        alt={currentUser?.displayName ?? currentUser?.username ?? "Bạn"}
        size="sm"
      />
    );
  }

  if (isError) {
    return (
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger ring-2 ring-surface">
        <AlertCircleIcon size={16} />
      </div>
    );
  }

  return (
    <div
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ring-2 ring-surface"
      style={{ background: "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)" }}
    >
      <SparklesIcon size={16} strokeWidth={2.5} />
    </div>
  );
};

/**
 * Padding của dòng tin nhắn AI (full-bleed, sát 2 mép với đệm responsive). Dùng
 * chung cho message row + loading ghost + input footer ở cả hai màn để mọi thứ
 * thẳng cột với nhau.
 */
export const AI_MESSAGE_ROW_PADDING = "px-4 py-5 sm:px-8 lg:px-12 xl:px-16";

/**
 * Giới hạn bề rộng KHỐI NỘI DUNG câu trả lời để dòng chữ không kéo dài cả màn
 * (khó đọc, xấu) dù dòng tin vẫn full-bleed. CHỈ áp cho AI Công ty (AiChatPreview)
 * — AI Cá nhân để tự do full-width theo yêu cầu. Bảng có overflow-x riêng nên vẫn
 * rộng được bên trong; chỉ prose bị giới hạn.
 */
export const AI_ANSWER_MAX_WIDTH = "max-w-[155ch]";
