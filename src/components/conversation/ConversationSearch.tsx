import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface ConversationSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const ConversationSearch: React.FC<ConversationSearchProps> = ({
  value,
  onChange,
  placeholder,
  className,
}) => {
  const { t } = useTranslation();
  const resolvedPlaceholder =
    placeholder ?? t("chat:empty.searchDescriptionEmpty");

  return (
    <div className={clsx("relative", className)}>
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={resolvedPlaceholder}
        className={clsx(
          "w-full pl-10 pr-10 py-2 rounded-lg",
          "bg-surface-overlay border-none",
          "text-text-primary placeholder:text-text-muted",
          "focus:outline-none focus:ring-2 focus:ring-focus/30 focus:bg-surface",
          "transition-all duration-200",
        )}
        aria-label={t("sidebar:search.aria")}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          type="button"
          className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
          aria-label={t("sidebar:search.clearAria")}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default ConversationSearch;
