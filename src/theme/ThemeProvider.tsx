import React, { useEffect } from "react";
import { useUIStore } from "../stores";
import type { Theme, ThemeBrand } from "../stores/uiStore";

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

const resolveTheme = (theme: Theme): "light" | "dark" => {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
};

const applyThemeAttributes = (theme: Theme, brand: ThemeBrand) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const resolvedTheme = resolveTheme(theme);

  root.dataset.themePreference = theme;
  root.dataset.theme = resolvedTheme;
  root.dataset.brand = brand;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.classList.add("theme-ready");
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const applyFromStore = () => {
      const { theme, brand } = useUIStore.getState();
      applyThemeAttributes(theme, brand);
    };

    applyFromStore();

    const unsubscribeStore = useUIStore.subscribe((state, prevState) => {
      if (state.theme === prevState.theme && state.brand === prevState.brand) {
        return;
      }
      applyThemeAttributes(state.theme, state.brand);
    });

    const mediaQuery = window.matchMedia(SYSTEM_DARK_QUERY);
    const onSystemThemeChange = () => {
      if (useUIStore.getState().theme === "system") {
        applyFromStore();
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", onSystemThemeChange);
    } else {
      mediaQuery.addListener(onSystemThemeChange);
    }

    return () => {
      unsubscribeStore();
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", onSystemThemeChange);
      } else {
        mediaQuery.removeListener(onSystemThemeChange);
      }
    };
  }, []);

  return <>{children}</>;
};

export default ThemeProvider;
