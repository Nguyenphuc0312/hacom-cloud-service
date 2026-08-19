import type { Theme, ThemeBrand } from "../stores/uiStore";

const STORAGE_KEY = "ui-storage";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark" || value === "system";

const isBrand = (value: unknown): value is ThemeBrand =>
  value === "blue" || value === "green" || value === "purple";

const getStoredThemeState = (): Partial<{ theme: Theme; brand: ThemeBrand }> => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      state?: { theme?: unknown; brand?: unknown };
    };

    return {
      theme: isTheme(parsed?.state?.theme) ? parsed.state.theme : undefined,
      brand: isBrand(parsed?.state?.brand) ? parsed.state.brand : undefined,
    };
  } catch {
    return {};
  }
};

export const resolveTheme = (theme: Theme): "light" | "dark" => {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
};

export const applyThemeAttributes = (
  theme: Theme,
  brand: ThemeBrand,
  options?: { markReady?: boolean },
) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const resolvedTheme = resolveTheme(theme);
  const markReady = options?.markReady ?? true;

  root.dataset.themePreference = theme;
  root.dataset.theme = resolvedTheme;
  root.dataset.brand = brand;
  root.classList.toggle("dark", resolvedTheme === "dark");
  if (markReady) {
    root.classList.add("theme-ready");
  }
};

export const bootstrapThemeAttributes = () => {
  const persisted = getStoredThemeState();
  applyThemeAttributes(persisted.theme ?? "system", persisted.brand ?? "blue", {
    markReady: false,
  });
};

export const systemDarkQuery = SYSTEM_DARK_QUERY;
