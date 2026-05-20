import React from "react";
import clsx from "clsx";
import {
  FileTextIcon,
  CalendarDaysIcon,
  Users2Icon,
  SearchIcon,
  LightbulbIcon,
  HeartHandshakeIcon
} from "lucide-react";
import { motion } from "framer-motion";
import { useChatUiStore } from "../../chat/state/chatUiStore";

export interface AiSuggestion {
  id: string;
  label: string;
  sublabel: string;
  icon: any;
  prompt: string;
  mode: "company" | "personal" | "any";
}

const SUGGESTIONS: AiSuggestion[] = [
  {
    id: "nhan-su-v2",
    label: "Quy trình nghỉ phép",
    sublabel: "Tìm hiểu chế độ và thủ tục xin nghỉ",
    icon: CalendarDaysIcon,
    prompt: "Quy trình xin nghỉ phép của công ty như thế nào?",
    mode: "company"
  },
  {
    id: "van-thu-v2",
    label: "Công tác văn thư",
    sublabel: "Quy định về văn bản và lưu trữ",
    icon: FileTextIcon,
    prompt: "Tóm tắt các quy định quan trọng về công tác văn thư lưu trữ",
    mode: "company"
  },
  {
    id: "nhan-su-v3",
    label: "Chính sách nhân sự",
    sublabel: "Chế độ phúc lợi và lương thưởng",
    icon: HeartHandshakeIcon,
    prompt: "Hacom có những chính sách phúc lợi đặc biệt nào cho nhân viên?",
    mode: "company"
  },
  {
    id: "find-docs-v2",
    label: "Tìm tài liệu nội bộ",
    sublabel: "Truy lục chính sách số hóa",
    icon: SearchIcon,
    prompt: "Tìm giúp tôi bộ quy trình làm việc của phòng CNTT",
    mode: "company"
  },
  {
    id: "soan-thao",
    label: "Hỗ trợ soạn thảo",
    sublabel: "Viết email, thông báo chuyên nghiệp",
    icon: LightbulbIcon,
    prompt: "Viết giúp tôi một mẫu email thông báo mời họp nội bộ chuyên nghiệp",
    mode: "personal"
  },
  {
    id: "nhan-su-list",
    label: "Sơ đồ tổ chức",
    sublabel: "Tìm kiếm thông tin đồng nghiệp",
    icon: Users2Icon,
    prompt: "Ai là người chịu trách nhiệm về mảng tuyển dụng tại Hacom?",
    mode: "personal"
  }
];

interface AiSuggestionChipsProps {
  onSelect: (prompt: string) => void;
}

export const AiSuggestionChips: React.FC<AiSuggestionChipsProps> = ({
  onSelect,
}) => {
  const { selectedEndpoint } = useChatUiStore();

  const filteredSuggestions = SUGGESTIONS.filter(s => s.mode === "any" || s.mode === selectedEndpoint);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-3xl mx-auto">
      {filteredSuggestions.map((suggestion, index) => {
        const Icon = suggestion.icon;
        return (
          <motion.button
            key={suggestion.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            type="button"
            onClick={() => onSelect(suggestion.prompt)}
            className={clsx(
              "flex items-center gap-4 p-4 rounded-2xl border border-border bg-white text-left transition-all group",
              "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:bg-primary/5",
              "active:scale-[0.98]"
            )}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-active group-hover:bg-white text-text-muted group-hover:text-primary transition-all shadow-sm">
              <Icon size={22} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col min-w-0">
               <span className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors truncate">
                  {suggestion.label}
               </span>
               <span className="text-[11px] font-medium text-text-muted truncate leading-relaxed">
                  {suggestion.sublabel}
               </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};
