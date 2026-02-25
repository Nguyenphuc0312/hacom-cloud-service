import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface SidebarSearchProps {
  value: string;
  collapsed: boolean;
  onChange: (value: string) => void;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({
  value,
  collapsed,
  onChange,
}) => {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <div className="border-b border-border px-3 py-2">
        <div className="flex h-9 items-center justify-center rounded-lg bg-surface-overlay text-text-muted">
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border px-3 py-2">
      <label className="relative block">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />

        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("sidebar:search.placeholder")}
          className={clsx(
            "h-10 w-full rounded-lg border border-transparent bg-surface-overlay pl-10 pr-9 text-sm",
            "text-text-primary placeholder:text-text-muted",
            "transition-colors focus:border-primary focus:bg-surface focus:outline-none",
          )}
          aria-label={t("sidebar:search.aria")}
        />

        {value.trim().length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
            aria-label={t("sidebar:search.clearAria")}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </label>
    </div>
  );
};

export default SidebarSearch;
