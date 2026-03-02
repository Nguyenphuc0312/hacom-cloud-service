/**
 * @fileoverview Default settings values + schema version
 *
 * Bump SETTINGS_VERSION whenever the shape changes.
 * The persistence layer uses this to trigger migrations.
 */

import type { SettingsSchema } from "./types";

/** Current schema version – increment on breaking changes */
export const SETTINGS_VERSION = 2;

/** localStorage key (includes version for safe migrations) */
export const SETTINGS_STORAGE_KEY = "chat-settings-v1";

export const defaultSettings: SettingsSchema = {
  version: SETTINGS_VERSION,

  language: "system",

  appearance: {
    theme: "system",
    accentColor: "blue",
    fontSize: "medium",
    displayDensity: "comfortable",
  },

  notifications: {
    enabled: true,
    sound: true,
    messagePreview: true,
  },

  privacy: {
    showOnlineStatus: true,
    readReceipts: true,
    allowStrangersMessage: true,
  },

  chat: {
    autoScrollOnNewMessage: true,
    enterKeyAction: "send",
    saveSearchHistory: true,
  },

  updatedAt: new Date().toISOString(),
};
