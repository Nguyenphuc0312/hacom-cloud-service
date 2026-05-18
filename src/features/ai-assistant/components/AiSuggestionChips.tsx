import React from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ClipboardDocumentListIcon,
  ClockIcon,
  DocumentMagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

export interface AiSuggestion {
  id: string;
  labelKey: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  prompt: string;
}

const SUGGESTIONS: AiSuggestion[] = [
  {
    id: "summarize-work",
    labelKey: "suggestions.summarizeWork",
    icon: ClipboardDocumentListIcon,
    prompt: "Tóm tắt công việc hôm nay",
  },
  {
    id: "check-attendance",
    labelKey: "suggestions.checkAttendance",
    icon: ClockIcon,
    prompt: "Kiểm tra thông tin chấm công",
  },
  {
    id: "find-documents",
    labelKey: "suggestions.findDocuments",
    icon: DocumentMagnifyingGlassIcon,
    prompt: "Tìm tài liệu số hóa",
  },
  {
    id: "ask-process",
    labelKey: "suggestions.askProcess",
    icon: QuestionMarkCircleIcon,
    prompt: "Hỏi về quy trình nội bộ",
  },
  {
    id: "create-report",
    labelKey: "suggestions.createReport",
    icon: ChartBarIcon,
    prompt: "Tạo báo cáo nhanh",
  },
];

interface AiSuggestionChipsProps {
  onSelect: (prompt: string) => void;
}

export const AiSuggestionChips: React.FC<AiSuggestionChipsProps> = ({
  onSelect,
}) => {
  const { t } = useTranslation("aiAssistant");

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((suggestion) => {
        const Icon = suggestion.icon;
        return (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onSelect(suggestion.prompt)}
            className={clsx(
              "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2",
              "text-body-sm text-text-secondary transition-all",
              "hover:border-primary/50 hover:bg-primary/10 hover:text-text-primary",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
            <span className="whitespace-nowrap">{t(suggestion.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
};
