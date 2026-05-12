/**
 * @fileoverview Default settings values + schema version
 *
 * Bump SETTINGS_VERSION whenever the shape changes.
 * The persistence layer uses this to trigger migrations.
 */

import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
} from "@hacom/chat-shared-types/runtime";
import type { LanguageCode, SettingsSchema } from "./types";

/** Current schema version – increment on breaking changes */
export const SETTINGS_VERSION = SETTINGS_SCHEMA_VERSION;

/** localStorage key (includes version for safe migrations) */
export const SETTINGS_STORAGE_KEY = "chat-settings-v1";

/**
 * Default language for new users who have no saved settings.
 * Overrides the shared-types default of "system" so the UI starts in
 * Vietnamese rather than following the browser locale.
 */
export const DEFAULT_LANGUAGE: LanguageCode = "vi";

export const defaultSettings: SettingsSchema = {
  ...DEFAULT_SETTINGS,
<<<<<<< HEAD
  language: DEFAULT_LANGUAGE,
=======
  language: "vi",
>>>>>>> 011e84246f4a9e7396d9bcd894e1c43502e9ceed
  updatedAt: new Date().toISOString(),
};
