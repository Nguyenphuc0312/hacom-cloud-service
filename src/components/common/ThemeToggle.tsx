/**
 * @fileoverview Theme Toggle Component
 * Toggle between light, dark and system themes.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";
import { useUIStore } from "../../stores";
import type { Theme, ThemeBrand } from "../../stores/uiStore";
import { useTheme } from "../../theme";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  showBrand?: boolean;
}

const themes: { id: Theme; labelKey: string; icon: React.ReactNode }[] = [
  { id: "light", labelKey: "theme:toggle.light", icon: <SunIcon className="h-5 w-5" /> },
  { id: "dark", labelKey: "theme:toggle.dark", icon: <MoonIcon className="h-5 w-5" /> },
  {
    id: "system",
    labelKey: "theme:toggle.system",
    icon: <ComputerDesktopIcon className="h-5 w-5" />,
  },
];

const brands: { id: ThemeBrand; labelKey: string }[] = [
  { id: "blue", labelKey: "theme:brand.blue" },
  { id: "green", labelKey: "theme:brand.green" },
  { id: "purple", labelKey: "theme:brand.purple" },
];

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className,
  showLabel = true,
  showBrand = false,
}) => {
  const { t } = useTranslation();
  const theme = useUIStore((state) => state.theme);
  const brand = useUIStore((state) => state.brand);
  const setTheme = useUIStore((state) => state.setTheme);
  const setBrand = useUIStore((state) => state.setBrand);

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1 rounded-lg bg-surface-overlay p-1">
        {themes.map((item) => (
          <button
            key={item.id}
            onClick={() => setTheme(item.id)}
            className={clsx(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              theme === item.id
                ? "bg-primary text-text-inverse shadow-xs"
                : "text-text-secondary hover:bg-surface hover:text-text-primary",
            )}
              title={t(item.labelKey)}
            >
              {item.icon}
              {showLabel && <span>{t(item.labelKey)}</span>}
            </button>
        ))}
      </div>

      {showBrand && (
        <div className="flex items-center gap-1 rounded-lg bg-surface-overlay p-1">
          {brands.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setBrand(item.id)}
              className={clsx(
                "rounded-md px-3 py-2 text-xs font-medium transition-colors",
                brand === item.id
                  ? "bg-surface text-text-primary shadow-xs"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary",
              )}
              >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const ThemeToggleButton: React.FC<{ className?: string }> = ({
  className,
}) => {
  const { t } = useTranslation();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className={clsx(
        "rounded-full p-2 text-text-secondary transition-colors",
        "hover:bg-surface-overlay hover:text-text-primary",
        className,
      )}
      title={
        isDark
          ? t("theme:toggle.switchToLight")
          : t("theme:toggle.switchToDark")
      }
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
};

export default ThemeToggle;

