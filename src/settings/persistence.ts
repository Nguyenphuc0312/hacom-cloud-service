/**
 * @fileoverview Local persistence layer for settings
 *
 * - Stores settings JSON in localStorage with a versioned key.
 * - Provides migration utility when SETTINGS_VERSION is bumped.
 * - Read/write are synchronous (localStorage is sync).
 */

import type { SettingsSchema } from "./types";
import {
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  defaultSettings,
} from "./defaults";

// ============================================
// READ
// ============================================

/** Read settings from localStorage, falling back to defaults */
export const loadSettings = (): SettingsSchema => {
  if (typeof window === "undefined") return { ...defaultSettings };

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaultSettings };

    const parsed = JSON.parse(raw) as SettingsSchema;

    // Schema version mismatch → migrate structure
    if (!parsed.schemaVersion || parsed.schemaVersion !== SETTINGS_VERSION) {
      return migrate(parsed);
    }

    return parsed;
  } catch {
    return { ...defaultSettings };
  }
};

// ============================================
// WRITE
// ============================================

/** Persist the full settings object */
export const saveSettings = (settings: SettingsSchema): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[settings/persistence] Unable to save settings", e);
  }
};

/** Remove settings from storage (e.g. on logout) */
export const clearSettings = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
};

// ============================================
// MIGRATION
// ============================================

/**
 * Migrate from an older version to the current one.
 *
 * Strategy: deep-merge persisted values on top of current defaults so that
 * new fields get their defaults automatically.
 */
const migrate = (old: Partial<SettingsSchema>): SettingsSchema => {
  const migrated: SettingsSchema = {
    ...defaultSettings,
    language: old.language ?? defaultSettings.language,
    appearance: { ...defaultSettings.appearance, ...(old.appearance ?? {}) },
    notifications: {
      ...defaultSettings.notifications,
      ...(old.notifications ?? {}),
    },
    privacy: { ...defaultSettings.privacy, ...(old.privacy ?? {}) },
    chat: { ...defaultSettings.chat, ...(old.chat ?? {}) },
    version: old.version ?? defaultSettings.version,
    schemaVersion: SETTINGS_VERSION,
    updatedAt: new Date().toISOString(),
  };

  // Persist migrated settings immediately
  saveSettings(migrated);
  return migrated;
};
