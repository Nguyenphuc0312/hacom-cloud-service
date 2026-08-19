import { useEffect, useMemo, useState } from "react";
import { useUIStore } from "../stores";
import type { Theme } from "../stores/uiStore";
import { resolveTheme, systemDarkQuery } from "./themeUtils";

const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(systemDarkQuery).matches ? "dark" : "light";
};

export const useTheme = () => {
  const theme = useUIStore((state) => state.theme);
  const brand = useUIStore((state) => state.brand);
  const setTheme = useUIStore((state) => state.setTheme);
  const setBrand = useUIStore((state) => state.setBrand);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia(systemDarkQuery);

    const onSystemThemeChange = () => {
      setSystemTheme(getSystemTheme());
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", onSystemThemeChange);
    } else {
      mediaQuery.addListener(onSystemThemeChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", onSystemThemeChange);
      } else {
        mediaQuery.removeListener(onSystemThemeChange);
      }
    };
  }, []);

  const resolvedTheme = useMemo(() => {
    if (theme === "system") return systemTheme;
    return resolveTheme(theme);
  }, [theme, systemTheme]);

  const toggleTheme = () => {
    const nextTheme: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  return {
    theme,
    resolvedTheme,
    brand,
    setTheme,
    setBrand,
    toggleTheme,
  };
};

export default useTheme;
