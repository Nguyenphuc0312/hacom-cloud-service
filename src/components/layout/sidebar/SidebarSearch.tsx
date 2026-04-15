import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { emitCommandPaletteOpen } from "../../../lib/commandPalette";

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
  const openShortcut =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? "Cmd K"
      : "Ctrl K";

  if (collapsed) {
    return (
      <div>
        <button
          type="button"
          onClick={emitCommandPaletteOpen}
          className="inline-flex h-10 w-full items-center justify-center rounded-[1.1rem] border border-border/60 bg-surface text-text-muted transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
          aria-label={t("common:actions.search", {
            defaultValue: "Open command palette",
          })}
        >
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
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
            "h-10 w-full rounded-[1.1rem] border border-border/60 bg-surface pl-11 text-body-sm",
            value.trim().length > 0 ? "pr-10" : "pr-[88px]",
            "text-text-primary placeholder:text-text-muted",
            "transition-micro focus:border-border-focus focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus/20",
          )}
          aria-label={t("sidebar:search.aria")}
        />

        {value.trim().length > 0 ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-micro hover:bg-surface-hover hover:text-text-primary"
            aria-label={t("sidebar:search.clearAria")}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={emitCommandPaletteOpen}
            className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-border/60 bg-surface-overlay px-2 py-0.5 text-caption text-text-muted transition-micro hover:bg-surface-hover hover:text-text-secondary"
            aria-label={t("common:actions.search", {
              defaultValue: "Open command palette",
            })}
          >
            <span className="font-medium">{openShortcut}</span>
          </button>
        )}
      </label>

      {onSearchUsers && value.trim().length >= 2 && (
        <button
          type="button"
          onClick={() => onSearchUsers(value.trim())}
          className="mt-2 w-full rounded-[1rem] border border-border/60 bg-surface px-3 py-2 text-left text-caption font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary"
        >
            {t("friends:tabs.search", { defaultValue: "Search users" })}:{" "}
            <span className="font-semibold">{value.trim()}</span>
        </button>
      )}
    </div>
  );
};

export default SidebarSearch;
