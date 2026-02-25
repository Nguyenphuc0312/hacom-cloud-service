/**
 * @fileoverview Theme Toggle Component
 * Toggle between light, dark and system themes.
 */

import React from "react";
import clsx from "clsx";
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";
import { useUIStore } from "../../stores";
import type { Theme, ThemeBrand } from "../../stores/uiStore";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  showBrand?: boolean;
}

const themes: { id: Theme; label: string; icon: React.ReactNode }[] = [
  { id: "light", label: "Light", icon: <SunIcon className="h-5 w-5" /> },
  { id: "dark", label: "Dark", icon: <MoonIcon className="h-5 w-5" /> },
  {
    id: "system",
    label: "System",
    icon: <ComputerDesktopIcon className="h-5 w-5" />,
  },
];

const brands: { id: ThemeBrand; label: string }[] = [
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "purple", label: "Purple" },
];

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className,
  showLabel = true,
  showBrand = false,
}) => {
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
            title={item.label}
          >
            {item.icon}
            {showLabel && <span>{item.label}</span>}
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
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                brand === item.id
                  ? "bg-surface text-text-primary shadow-xs"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary",
              )}
            >
              {item.label}
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
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      onClick={toggleTheme}
      className={clsx(
        "rounded-full p-2 text-text-secondary transition-colors",
        "hover:bg-surface-overlay hover:text-text-primary",
        className,
      )}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
};

export default ThemeToggle;
