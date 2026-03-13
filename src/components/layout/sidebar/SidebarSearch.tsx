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
      <div className="px-3 py-2">
        <div className="flex h-11 items-center justify-center rounded-full bg-white/6 text-text-muted">
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
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
            "h-12 w-full rounded-full border border-transparent bg-white/6 pl-11 pr-10 text-sm",
            "text-text-primary placeholder:text-text-muted",
            "transition-colors focus:border-white/12 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-white/10",
          )}
          aria-label={t("sidebar:search.aria")}
        />

        {value.trim().length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/8 hover:text-text-primary"
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
          className="mt-2 w-full rounded-2xl border border-white/8 bg-white/3 px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-white/6 hover:text-text-primary"
        >
          {t("friends:tabs.search", { defaultValue: "Search users" })}:{" "}
          <span className="font-semibold">{value.trim()}</span>
        </button>
      )}
    </div>
  );
};

export default SidebarSearch;
