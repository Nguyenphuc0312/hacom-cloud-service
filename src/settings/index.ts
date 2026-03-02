/**
 * @fileoverview Settings module barrel export
 */

// Types
export type {
  ThemeMode,
  AccentColor,
  FontSize,
  DisplayDensity,
  EnterKeyAction,
  LanguageCode,
  AppearanceSettings,
  NotificationSettings,
  PrivacySettings,
  ChatSettings,
  SettingsSchema,
  SettingsPatch,
  SettingsSection,
  ServerSettingsDto,
} from "./types";

// Defaults & constants
export {
  defaultSettings,
  SETTINGS_VERSION,
  SETTINGS_STORAGE_KEY,
} from "./defaults";

// Store
export {
  useSettingsStore,
  useSettingsSection,
  useUpdateSettings,
} from "./settingsStore";

// Hook
export { useSettings } from "./useSettings";

// Persistence
export { loadSettings, saveSettings, clearSettings } from "./persistence";

// Sync
export { fetchSettingsFromServer, syncSettingsToServer } from "./sync";
