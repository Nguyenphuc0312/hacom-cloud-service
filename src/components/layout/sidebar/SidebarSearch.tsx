import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { ChatLayoutState } from "../../../utils/densityPolicy";

interface SidebarSearchProps {
  layoutState: ChatLayoutState;
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({
  layoutState,
  value,
  onChange,
  inputRef,
}) => {
  const { t } = useTranslation();
  const isDense = layoutState !== "normal";

  return (
    <div className={clsx(isDense ? "px-3 pb-2 pt-2" : "px-3.5 pb-2.5 pt-2.5")}>
      <label className="relative block">
        <MagnifyingGlassIcon
          className={clsx(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-muted",
            isDense ? "left-3 h-4 w-4" : "left-3.5 h-[18px] w-[18px]",
          )}
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
            "w-full border border-border/55 bg-surface text-text-primary placeholder:text-text-muted",
            isDense
              ? "h-9 rounded-[0.95rem] pl-9 pr-8 text-[13px]"
              : "h-9.5 rounded-[0.95rem] pl-10 pr-9 text-[13px]",
            "transition-micro focus:border-border-focus focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus/16",
          )}
          aria-label={t("sidebar:search.aria")}
        />

        {value.trim().length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            className={clsx(
              "absolute top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-micro hover:bg-surface-hover hover:text-text-primary",
              isDense ? "right-2 h-6 w-6" : "right-2.5 h-6 w-6",
            )}
            aria-label={t("sidebar:search.clearAria")}
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
    </div>
  );
};

export default SidebarSearch;
