import React, { useEffect } from "react";
import { useUIStore } from "../stores";
import { applyThemeAttributes, systemDarkQuery } from "./themeUtils";

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

    const mediaQuery = window.matchMedia(systemDarkQuery);
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
