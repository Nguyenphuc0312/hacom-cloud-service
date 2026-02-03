/**
 * @fileoverview Theme Toggle Component
 * Toggle giữa Light/Dark mode
 */

import React from "react";
import clsx from "clsx";
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";
import { useUIStore } from "../../stores";
import type { Theme } from "../../stores/uiStore";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

const themes: { id: Theme; label: string; icon: React.ReactNode }[] = [
  { id: "light", label: "Sáng", icon: <SunIcon className="w-5 h-5" /> },
  { id: "dark", label: "Tối", icon: <MoonIcon className="w-5 h-5" /> },
  {
    id: "system",
    label: "Hệ thống",
    icon: <ComputerDesktopIcon className="w-5 h-5" />,
  },
];

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className,
  showLabel = true,
}) => {
  const { theme, setTheme } = useUIStore();

  return (
    <div className={clsx("flex items-center gap-1", className)}>
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          className={clsx(
            "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
            theme === t.id
              ? "bg-telegram-primary text-white"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
          )}
          title={t.label}
        >
          {t.icon}
          {showLabel && <span className="text-sm font-medium">{t.label}</span>}
        </button>
      ))}
    </div>
  );
};

// Simple toggle button (only Light/Dark)
export const ThemeToggleButton: React.FC<{ className?: string }> = ({
  className,
}) => {
  const { theme, setTheme } = useUIStore();
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
        "p-2 rounded-full transition-colors",
        "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
        className,
      )}
      title={isDark ? "Chế độ sáng" : "Chế độ tối"}
    >
      {isDark ? (
        <SunIcon className="w-5 h-5" />
      ) : (
        <MoonIcon className="w-5 h-5" />
      )}
    </button>
  );
};

export default ThemeToggle;
