import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

export interface SettingsSidebarItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
}

export interface SettingsSidebarGroup {
  id: string;
  label: string;
  items: SettingsSidebarItem[];
}

interface SettingsSidebarProps {
  items: SettingsSidebarItem[];
  groups?: SettingsSidebarGroup[];
  activeItemId: string | null;
  onSelect: (id: string) => void;
  heading?: string;
  meta?: React.ReactNode;
  ariaLabel?: string;
  mode?: "rail" | "list";
  className?: string;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  items,
  groups,
  activeItemId,
  onSelect,
  heading,
  meta,
  ariaLabel,
  mode = "rail",
  className,
}) => {
  const { t } = useTranslation("settings");
  const isListMode = mode === "list";
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const flatItems = groups?.flatMap((group) => group.items) ?? items;
  const visibleItems = normalizedQuery
    ? flatItems.filter((item) =>
        `${item.label} ${item.description ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : flatItems;

  return (
    <aside
      className={clsx("h-full min-h-0 min-w-0", className)}
      data-settings-pane={!isListMode ? "nav" : undefined}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
        {heading || meta ? (
          <div className="border-b border-border px-4 py-4">
            {heading ? (
              <p className="text-xl font-semibold text-text-primary">
                {heading}
              </p>
            ) : null}
            {meta ? <div className="mt-1 text-sm text-text-secondary">{meta}</div> : null}
          </div>
        ) : null}

        <div className="border-b border-border px-3 py-3">
          <label className="relative block">
            <span className="sr-only">
              {t("searchPlaceholder", { defaultValue: "Tìm cài đặt" })}
            </span>
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder", {
                defaultValue: "Tìm cài đặt",
              })}
              className="h-10 w-full rounded-lg border border-border bg-surface-overlay pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-[#FFC857]/60 focus:outline-none focus:ring-2 focus:ring-[#FFC857]/15"
            />
          </label>
        </div>

        <nav
          aria-label={ariaLabel}
          className={clsx("min-h-0 flex-1 overflow-y-auto p-2", isListMode && "p-3")}
        >
          {visibleItems.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-text-secondary">
              {t("emptySearch", {
                defaultValue: "Không tìm thấy cài đặt phù hợp.",
              })}
            </div>
          ) : (
            <div className={clsx("space-y-1", isListMode && "space-y-2")}>
              {visibleItems.map((item) => {
                const isActive = activeItemId === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelect(item.id)}
                    className={clsx(
                      "group flex w-full items-center gap-3 rounded-lg text-left transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC857]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                      isListMode ? "px-3 py-3" : "px-3 py-2.5",
                      isActive
                        ? "bg-[#FFC857]/10 text-text-primary"
                        : item.tone === "danger"
                          ? "text-danger hover:bg-danger/10"
                          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                    )}
                  >
                    {item.icon ? (
                      <span
                        className={clsx(
                          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          isActive
                            ? "text-[#C41E3A]"
                            : item.tone === "danger"
                              ? "text-danger"
                              : "text-text-secondary",
                        )}
                      >
                        {item.icon}
                      </span>
                    ) : null}

                    <span className="min-w-0 flex-1 whitespace-normal text-sm font-medium leading-5">
                      {item.label}
                    </span>

                    {isListMode ? (
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </div>
    </aside>
  );
};

export default SettingsSidebar;
