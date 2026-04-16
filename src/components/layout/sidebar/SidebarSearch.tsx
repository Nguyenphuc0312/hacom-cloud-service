import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface SidebarSearchProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({
  value,
  onChange,
  inputRef,
}) => {
  const { t } = useTranslation();

  return (
    <div className="px-4 pb-3 pt-3">
      <label className="relative block">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("sidebar:search.placeholder", {
            defaultValue: "Search conversations",
          })}
          className={clsx(
            "h-11 w-full rounded-[1.1rem] border border-border/60 bg-surface pl-11 pr-10 text-body-sm",
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
    </div>
  );
};

export default SidebarSearch;
