import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface SidebarSearchProps {
  value: string;
  collapsed: boolean;
  onChange: (value: string) => void;
  onSearchUsers?: (query: string) => void;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({
  value,
  collapsed,
  onChange,
  onSearchUsers,
}) => {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onSearchUsers?.(value.trim())}
        className={clsx(
          "inline-flex h-10 w-full items-center justify-center rounded-[1.05rem]",
          "border border-border/60 bg-surface text-text-muted transition-micro",
          "hover:bg-surface-hover hover:text-text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        )}
        aria-label={t("sidebar:search.aria")}
      >
        <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div>
      <label className="relative block">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />

        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const query = value.trim();
            if (!query || !onSearchUsers) return;
            onSearchUsers(query);
          }}
          placeholder={t("sidebar:search.placeholder")}
          className={clsx(
            "h-10 w-full rounded-[1.05rem] border border-border/60 bg-surface pl-11 text-body-sm pr-10",
            "text-text-primary placeholder:text-text-muted",
            "transition-micro focus:border-border-focus focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus/20",
          )}
          aria-label={t("sidebar:search.aria")}
        />

        {value.trim().length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-micro hover:bg-surface-hover hover:text-text-primary"
            aria-label={t("sidebar:search.clearAria")}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </label>

      {onSearchUsers && value.trim().length >= 2 && (
        <button
          type="button"
          onClick={() => onSearchUsers(value.trim())}
          className="mt-2 w-full rounded-[0.95rem] bg-transparent px-1 py-1.5 text-left text-caption font-medium text-text-muted transition-micro hover:text-text-primary"
        >
          {t("friends:tabs.search", { defaultValue: "Search users" })}:{" "}
          <span className="font-semibold text-text-secondary">
            {value.trim()}
          </span>
        </button>
      )}
    </div>
  );
};

export default SidebarSearch;
