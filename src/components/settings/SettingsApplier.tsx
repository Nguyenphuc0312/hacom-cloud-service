/**
 * @fileoverview SettingsApplier
 *
 * Invisible component mounted at the app root that:
 * 1. Syncs appearance.theme / appearance.accentColor → uiStore (theme, brand)
 *    so existing ThemeProvider + dark mode classes keep working.
 * 2. Applies CSS variables for fontSize and displayDensity.
 * 3. Applies accent-color CSS variables for colours beyond blue/green/purple.
 *
 * This is the single integration point — no scattered logic elsewhere.
 */

import React, { useEffect } from "react";
import { useSettingsStore } from "../../settings/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import type { ThemeBrand } from "../../stores/uiStore";
import type {
  FontSize,
  DisplayDensity,
  AccentColor,
  LanguageCode,
} from "../../settings/types";
import i18n from "../../i18n";

// ============================================
// CSS VARIABLE MAPS
// ============================================

/**
 * Font-size tokens applied to :root so Tailwind picks them up via
 * var(--font-size-*) already defined in tailwind.config.js
 */
const FONT_SIZE_TOKENS: Record<FontSize, Record<string, string>> = {
  small: {
    "--font-size-xs": "0.6875rem",
    "--font-size-sm": "0.75rem",
    "--font-size-base": "0.875rem",
    "--font-size-md": "0.875rem",
    "--font-size-lg": "1rem",
  },
  medium: {
    "--font-size-xs": "0.75rem",
    "--font-size-sm": "0.875rem",
    "--font-size-base": "1rem",
    "--font-size-md": "1rem",
    "--font-size-lg": "1.125rem",
  },
  large: {
    "--font-size-xs": "0.875rem",
    "--font-size-sm": "1rem",
    "--font-size-base": "1.125rem",
    "--font-size-md": "1.125rem",
    "--font-size-lg": "1.25rem",
  },
};

/** Display density → CSS variable for chat bubble padding */
const DENSITY_TOKENS: Record<DisplayDensity, Record<string, string>> = {
  compact: {
    "--chat-bubble-px": "0.625rem",
    "--chat-bubble-py": "0.375rem",
  },
  comfortable: {
    "--chat-bubble-px": "0.875rem",
    "--chat-bubble-py": "0.625rem",
  },
};

/**
 * Extended accent colours — the existing CSS already handles blue/green/purple
 * via data-brand. For additional colours we override CSS variables directly.
 */
const EXTRA_ACCENT_TOKENS: Record<string, Record<string, string>> = {
  orange: {
    "--core-brand-400": "30 90% 62%",
    "--core-brand-500": "24 100% 50%",
    "--core-brand-600": "20 100% 42%",
  },
  pink: {
    "--core-brand-400": "340 75% 65%",
    "--core-brand-500": "340 82% 52%",
    "--core-brand-600": "340 80% 44%",
  },
  teal: {
    "--core-brand-400": "178 55% 50%",
    "--core-brand-500": "180 70% 35%",
    "--core-brand-600": "180 68% 28%",
  },
};

// Colours supported natively via data-brand attribute
const NATIVE_BRANDS = new Set<string>(["blue", "green", "purple"]);

// ============================================
// LANGUAGE RESOLUTION
// ============================================

/**
 * Resolve the effective language from the user's preference.
 * "system" → detect from navigator.language (fallback "vi").
 */
const resolveLanguage = (pref: LanguageCode): string => {
  if (pref !== "system") return pref;
  const browserLang = navigator.language?.split("-")[0] ?? "vi";
  return ["vi", "en"].includes(browserLang) ? browserLang : "vi";
};

/**
 * Apply language to i18next and persist to localStorage
 * (the LanguageDetector reads from "chat.language").
 */
const applyLanguage = (pref: LanguageCode) => {
  const resolved = resolveLanguage(pref);
  if (i18n.language !== resolved) {
    void i18n.changeLanguage(resolved);
  }
};

// ============================================
// APPLIER LOGIC
// ============================================

const applyTokens = (tokens: Record<string, string>) => {
  const style = document.documentElement.style;
  for (const [key, value] of Object.entries(tokens)) {
    style.setProperty(key, value);
  }
};

const clearExtraAccentTokens = () => {
  const style = document.documentElement.style;
  style.removeProperty("--core-brand-400");
  style.removeProperty("--core-brand-500");
  style.removeProperty("--core-brand-600");
};

/**
 * Apply appearance settings to the DOM.
 * Called both on mount and on every settings change.
 */
const applyAppearance = (
  theme: string,
  accentColor: AccentColor,
  fontSize: FontSize,
  density: DisplayDensity,
) => {
  // 1. Sync theme + brand to uiStore (drives ThemeProvider / dark class)
  const uiState = useUIStore.getState();
  const mappedTheme = theme as "light" | "dark" | "system";
  const mappedBrand: ThemeBrand = NATIVE_BRANDS.has(accentColor)
    ? (accentColor as ThemeBrand)
    : "blue"; // fallback for extended colours

  if (uiState.theme !== mappedTheme) uiState.setTheme(mappedTheme);
  if (uiState.brand !== mappedBrand) uiState.setBrand(mappedBrand);

  // 2. Handle extended accent colours via CSS variables
  if (NATIVE_BRANDS.has(accentColor)) {
    clearExtraAccentTokens();
  } else if (EXTRA_ACCENT_TOKENS[accentColor]) {
    applyTokens(EXTRA_ACCENT_TOKENS[accentColor]);
  }

  // 3. Font size tokens
  applyTokens(FONT_SIZE_TOKENS[fontSize]);

  // 4. Density tokens
  applyTokens(DENSITY_TOKENS[density]);

  // 5. Data attributes for potential CSS selectors
  document.documentElement.dataset.fontSize = fontSize;
  document.documentElement.dataset.density = density;
};

// ============================================
// REACT COMPONENT
// ============================================

export const SettingsApplier: React.FC = () => {
  useEffect(() => {
    // Apply on mount
    const { appearance, language } = useSettingsStore.getState();
    applyAppearance(
      appearance.theme,
      appearance.accentColor,
      appearance.fontSize,
      appearance.displayDensity,
    );
    applyLanguage(language);

    // Subscribe to appearance changes
    const unsubAppearance = useSettingsStore.subscribe(
      (state) => state.appearance,
      (appearance) => {
        applyAppearance(
          appearance.theme,
          appearance.accentColor,
          appearance.fontSize,
          appearance.displayDensity,
        );
      },
    );

    // Subscribe to language changes
    const unsubLanguage = useSettingsStore.subscribe(
      (state) => state.language,
      (language) => {
        applyLanguage(language);
      },
    );

    return () => {
      unsubAppearance();
      unsubLanguage();
    };
  }, []);

  return null; // Renders nothing
};

export default SettingsApplier;
