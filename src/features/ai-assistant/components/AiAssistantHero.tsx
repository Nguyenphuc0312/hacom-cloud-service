import React from "react";
import { useTranslation } from "react-i18next";
import { SparklesIcon, Building2Icon, ShieldCheckIcon } from "lucide-react";
import { useChatUiStore } from "../../chat/state/chatUiStore";
import { motion } from "framer-motion";
import clsx from "clsx";

interface AiAssistantHeroProps {
  displayName?: string;
}

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
    <div className="flex flex-col items-center gap-8 text-center relative max-w-2xl mx-auto">
      {/* Background Glow */}
      <div className={clsx(
        "absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 blur-[120px] opacity-20 pointer-events-none",
        isCompany ? "bg-primary" : "bg-success"
      )} />

      {/* AI Icon with Premium Frame */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative"
      >
        <div className={clsx(
          "flex h-20 w-20 items-center justify-center rounded-[28px] shadow-2xl relative z-10",
          isCompany 
            ? "bg-gradient-to-br from-primary to-primary-hover text-white shadow-primary/20" 
            : "bg-gradient-to-br from-success to-success-hover text-white shadow-success/20"
        )}>
          {isCompany ? <Building2Icon size={36} strokeWidth={2.5} /> : <SparklesIcon size={36} strokeWidth={2.5} />}
        </div>
        
        {/* Sub-icon status */}
        <div className="absolute -bottom-1 -right-1 z-20 h-7 w-7 rounded-full bg-white p-1 shadow-md flex items-center justify-center">
           <ShieldCheckIcon size={16} className={isCompany ? "text-primary" : "text-success"} strokeWidth={3} />
        </div>

        {/* Orbit animation effect */}
        <div className="absolute -inset-4 border border-dashed border-border/40 rounded-full animate-spin-slow pointer-events-none" />
      </motion.div>

      {/* Greeting & Badge */}
      <div className="flex flex-col gap-4 relative z-10">
        <div className="flex justify-center">
          <span className={clsx(
            "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-sm",
            isCompany 
              ? "bg-primary/5 text-primary ring-1 ring-primary/20" 
              : "bg-success/5 text-success ring-1 ring-success/20"
          )}>
            {isCompany ? "Hệ thống tri thức nội bộ HACOM" : "Trợ lý cá nhân hóa AI"}
          </span>
        </div>

        <h1 className="text-4xl font-black tracking-tighter text-text-primary leading-tight">
          {greeting}
        </h1>
        
        <p className="text-base font-medium text-text-muted leading-relaxed max-w-lg mx-auto">
          {isCompany 
            ? "Tôi đã sẵn sàng truy xuất mọi quy trình, chính sách và tài liệu nội bộ HACOM để hỗ trợ bạn ngay lập tức." 
            : "Tôi là trợ lý riêng của bạn, sẵn sàng hỗ trợ soạn thảo, tóm tắt và giải đáp mọi vấn đề công việc hàng ngày."}
        </p>
      </div>
    </div>
  );
};
