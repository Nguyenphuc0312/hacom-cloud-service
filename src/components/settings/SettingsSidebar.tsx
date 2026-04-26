import React from "react";
import clsx from "clsx";
import {
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

export interface SettingsSidebarItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
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
  const isRail = mode === "rail";
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const sourceGroups =
    groups && groups.length > 0
      ? groups
      : [{ id: "all", label: "", items }];
  const visibleGroups = sourceGroups
    .map((group) => ({
      ...group,
      items: normalizedQuery
        ? group.items.filter((item) => {
            const haystack = `${item.label} ${item.description ?? ""}`.toLowerCase();
            return haystack.includes(normalizedQuery);
          })
        : group.items,
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className={clsx("h-full min-h-0 min-w-0", className)}
      data-settings-pane={isRail ? "nav" : undefined}
    >
      <div
        className={clsx(
          "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgb(15_23_42_/_0.06)]",
          !isRail && "bg-surface",
        )}
      >
        {heading || meta ? (
          <div className="border-b border-border px-4 py-4">
            {heading ? (
              <p className="text-lg font-semibold text-text-primary">
                {heading}
              </p>
            ) : null}
            {meta ? <div className="mt-1 text-sm text-text-secondary">{meta}</div> : null}
          </div>
        ) : null}

        <div className="border-b border-border px-3 py-3">
          <label className="relative block">
            <span className="sr-only">Tìm kiếm cài đặt</span>
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm kiếm cài đặt..."
              className="h-10 w-full rounded-xl border border-border bg-surface-overlay pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>

        <nav
          aria-label={ariaLabel}
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto p-2",
            !isRail && "p-3",
          )}
        >
          {visibleGroups.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-text-secondary">
              Không tìm thấy cài đặt phù hợp.
            </div>
          ) : (
            <div className={clsx("space-y-4", !isRail && "space-y-3")}>
              {visibleGroups.map((group) => (
                <div key={group.id}>
                  {group.label ? (
                    <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                      {group.label}
                    </p>
                  ) : null}
                  <div className={clsx("space-y-1", !isRail && "space-y-2")}>
                    {group.items.map((item) => {
                      const isActive = activeItemId === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => onSelect(item.id)}
                          className={clsx(
                            "group flex w-full items-start gap-3 rounded-xl text-left transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                            isRail ? "px-3 py-3" : "px-4 py-4",
                            isActive
                              ? "bg-primary/10 text-text-primary shadow-[inset_3px_0_0_var(--hc-primary-700)]"
                              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                          )}
                        >
                          {item.icon ? (
                            <span
                              className={clsx(
                                "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                                isActive
                                  ? "border-primary/25 bg-surface text-primary"
                                  : "border-border bg-surface-overlay text-text-secondary",
                              )}
                            >
                              {item.icon}
                            </span>
                          ) : null}

                          <span className="min-w-0 flex-1">
                            <span
                              className={clsx(
                                "block whitespace-normal text-sm font-medium leading-5",
                                isActive ? "text-text-primary" : "text-inherit",
                              )}
                            >
                              {item.label}
                            </span>
                            {item.description ? (
                              <span className="mt-1 block text-xs leading-5 text-text-secondary">
                                {item.description}
                              </span>
                            ) : null}
                          </span>

                          {item.badge}

                          {!isRail ? (
                            <ChevronRightIcon
                              className={clsx(
                                "mt-0.5 h-4 w-4 shrink-0",
                                isActive ? "text-primary" : "text-text-secondary",
                              )}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </nav>
      </div>
    </aside>
  );
};

export default SettingsSidebar;
