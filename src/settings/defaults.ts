/**
 * @fileoverview Default settings values + schema version
 *
 * Bump SETTINGS_VERSION whenever the shape changes.
 * The persistence layer uses this to trigger migrations.
 */

import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
} from "@hacom/chat-shared-types";
import type { SettingsSchema } from "./types";

/** Current schema version – increment on breaking changes */
export const SETTINGS_VERSION = SETTINGS_SCHEMA_VERSION;

/** localStorage key (includes version for safe migrations) */
export const SETTINGS_STORAGE_KEY = "chat-settings-v1";

export const defaultSettings: SettingsSchema = {
  ...DEFAULT_SETTINGS,
  updatedAt: new Date().toISOString(),
};
