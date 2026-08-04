import React from "react";
import {
  FileTextIcon,
  CalendarDaysIcon,
  Users2Icon,
  SearchIcon,
  LightbulbIcon,
  HeartHandshakeIcon,
} from "lucide-react";
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
    sublabel: "Tìm hiểu thủ tục xin nghỉ",
    icon: CalendarDaysIcon,
    prompt: "Quy trình xin nghỉ phép của công ty như thế nào?",
    mode: "company",
  },
  {
    id: "van-thu-v2",
    label: "Công tác văn thư",
    sublabel: "Quy định văn bản & lưu trữ",
    icon: FileTextIcon,
    prompt: "Tóm tắt các quy định quan trọng về công tác văn thư lưu trữ",
    mode: "company",
  },
  {
    id: "nhan-su-v3",
    label: "Chính sách nhân sự",
    sublabel: "Phúc lợi & lương thưởng",
    icon: HeartHandshakeIcon,
    prompt: "Hacom có những chính sách phúc lợi đặc biệt nào cho nhân viên?",
    mode: "company",
  },
  {
    id: "find-docs-v2",
    label: "Tìm tài liệu nội bộ",
    sublabel: "Tra cứu chính sách",
    icon: SearchIcon,
    prompt: "Tìm giúp tôi bộ quy trình làm việc của phòng CNTT",
    mode: "company",
  },
  {
    id: "soan-thao",
    label: "Hỗ trợ soạn thảo",
    sublabel: "Viết email & thông báo",
    icon: LightbulbIcon,
    prompt:
      "Viết giúp tôi một mẫu email thông báo mời họp nội bộ chuyên nghiệp",
    mode: "personal",
  },
  {
    id: "nhan-su-list",
    label: "Sơ đồ tổ chức",
    sublabel: "Tìm kiếm đồng nghiệp",
    icon: Users2Icon,
    prompt: "Ai là người chịu trách nhiệm về mảng tuyển dụng tại Hacom?",
    mode: "personal",
  },
];

interface AiSuggestionChipsProps {
  onSelect: (prompt: string) => void;
}

/**
 * Gợi ý câu hỏi kiểu ChatGPT – card border nhẹ, 2 cột,
 * hover hiệu ứng nhẹ nhàng.
 */
export const AiSuggestionChips: React.FC<AiSuggestionChipsProps> = ({
  onSelect,
}) => {
  const { selectedEndpoint } = useChatUiStore();

  const filteredSuggestions = SUGGESTIONS.filter(
    (s) => s.mode === "any" || s.mode === selectedEndpoint,
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
      {filteredSuggestions.map((suggestion) => {
        const Icon = suggestion.icon;
        return (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onSelect(suggestion.prompt)}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-surface text-left transition-all hover:bg-surface-hover hover:border-border-strong active:scale-[0.99] group"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-active text-text-muted group-hover:bg-surface-hover transition-colors">
              <Icon size={18} strokeWidth={2} />
            </div>
            <div className="flex flex-col min-w-0 gap-0.5">
              <span className="text-sm font-medium text-text-primary truncate">
                {suggestion.label}
              </span>
              <span className="text-xs text-text-secondary truncate">
                {suggestion.sublabel}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
