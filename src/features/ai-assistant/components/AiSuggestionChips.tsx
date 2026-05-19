import React from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  DocumentMagnifyingGlassIcon,
  ClipboardDocumentCheckIcon,
  UsersIcon,
  QuestionMarkCircleIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/outline";

export interface AiSuggestion {
  id: string;
  labelKey: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  prompt: string;
}

const SUGGESTIONS: AiSuggestion[] = [
  {
    id: "latest-docs",
    labelKey: "suggestions.latestDocs",
    icon: ArchiveBoxIcon,
    prompt: "Tóm tắt tài liệu mới nhất",
  },
  {
    id: "van-thu",
    labelKey: "suggestions.vanThu",
    icon: ClipboardDocumentCheckIcon,
    prompt: "Quy định về công tác văn thư là gì?",
  },
  {
    id: "nhan-su",
    labelKey: "suggestions.nhanSu",
    icon: UsersIcon,
    prompt: "Tìm thông tin liên quan đến nhân sự",
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
