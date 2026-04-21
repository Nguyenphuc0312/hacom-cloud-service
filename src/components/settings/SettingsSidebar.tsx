import React from "react";
import clsx from "clsx";
import { ChevronRightIcon } from "@heroicons/react/24/outline";

export interface SettingsSidebarItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface SettingsSidebarProps {
  items: SettingsSidebarItem[];
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
  activeItemId,
  onSelect,
  heading,
  meta,
  ariaLabel,
  mode = "rail",
  className,
}) => {
  const isRail = mode === "rail";

  return (
    <aside
      className={clsx("h-full min-h-0 min-w-0", className)}
      data-settings-pane={isRail ? "nav" : undefined}
    >
      <div
        className={clsx(
          "flex h-full min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/70 bg-[hsl(var(--color-surface))/0.72]",
          !isRail && "rounded-2xl bg-[hsl(var(--chat-panel-bg))/0.96]",
        )}
      >
        {heading || meta ? (
          <div className="border-b border-border/60 px-4 py-4">
            {heading ? (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                {heading}
              </p>
            ) : null}
            {meta ? <div className="mt-1 text-sm text-text-secondary">{meta}</div> : null}
          </div>
        ) : null}

        <nav
          aria-label={ariaLabel}
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto p-2",
            !isRail && "p-3",
          )}
        >
          <div className={clsx("space-y-1", !isRail && "space-y-2")}>
            {items.map((item) => {
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
                      ? "bg-primary/10 text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover/85 hover:text-text-primary",
                  )}
                >
                  {item.icon ? (
                    <span
                      className={clsx(
                        "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        isActive
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-border/70 bg-surface text-text-muted",
                      )}
                    >
                      {item.icon}
                    </span>
                  ) : null}

                  <span className="min-w-0 flex-1">
                    <span
                      className={clsx(
                        "block text-sm font-medium",
                        isActive ? "text-text-primary" : "text-inherit",
                      )}
                    >
                      {item.label}
                    </span>
                    {item.description ? (
                      <span className="mt-1 block text-xs leading-5 text-text-muted">
                        {item.description}
                      </span>
                    ) : null}
                  </span>

                  {!isRail ? (
                    <ChevronRightIcon
                      className={clsx(
                        "mt-0.5 h-4 w-4 shrink-0",
                        isActive ? "text-primary" : "text-text-muted",
                      )}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default SettingsSidebar;
