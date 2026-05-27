import React from "react";
import { useTranslation } from "react-i18next";
import { SparklesIcon, Building2Icon } from "lucide-react";
import { useChatUiStore } from "../../chat/state/chatUiStore";

interface AiAssistantHeroProps {
  displayName?: string;
}

/**
 * Hero đơn giản kiểu ChatGPT – hiện khi chưa có tin nhắn nào.
 * Chỉ hiển thị logo + lời chào ngắn gọn.
 */
export const AiAssistantHero: React.FC<AiAssistantHeroProps> = ({
  displayName,
}) => {
  const { t } = useTranslation("aiAssistant");
  const { selectedEndpoint } = useChatUiStore();

  const greeting = displayName
    ? t("page.greetingWithName", { name: displayName })
    : t("page.greeting");

  const isCompany = selectedEndpoint === "company";

  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-lg mx-auto">
      {/* Icon */}
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full ${
          isCompany
            ? "text-white"
            : "bg-emerald-600 text-white"
        }`}
        style={isCompany ? {
          background: "linear-gradient(135deg, #C41E3A 0%, #D32F2F 50%, #FFC857 100%)",
          boxShadow: "0 4px 16px rgba(196,30,58,0.3)",
        } : undefined}
      >
        {isCompany ? (
          <Building2Icon size={28} strokeWidth={2} />
        ) : (
          <SparklesIcon size={28} strokeWidth={2} />
        )}
      </div>

      {/* Greeting */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
          {greeting}
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
          {isCompany
            ? "Hỏi bất cứ điều gì về quy trình, chính sách và tài liệu nội bộ của công ty."
            : "Tôi là trợ lý AI cá nhân – sẵn sàng hỗ trợ soạn thảo, tóm tắt và giải đáp mọi câu hỏi."}
        </p>
      </div>
    </div>
  );
};
