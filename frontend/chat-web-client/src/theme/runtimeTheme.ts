export type RuntimeThemeTokens = Record<string, string>;

export const applyRuntimeThemeTokens = (tokens: RuntimeThemeTokens) => {
  if (typeof document === "undefined") return;

  const rootStyle = document.documentElement.style;
  Object.entries(tokens).forEach(([key, value]) => {
    if (!key.startsWith("--")) return;
    if (typeof value !== "string" || value.trim().length === 0) return;
    rootStyle.setProperty(key, value);
  });
};
