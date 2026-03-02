/**
 * @fileoverview Settings data model (schema, types, versioning)
 *
 * Mỗi section (appearance, notifications, privacy, chat) là một object con
 * để dễ mở rộng và patch riêng từng phần mà không re-render toàn bộ.
 */

// ============================================
// ENUMS / UNION TYPES
// ============================================

/** Theme preference stored by user */
export type ThemeMode = "light" | "dark" | "system";

/** Accent / brand colour */
export type AccentColor =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "pink"
  | "teal";

/** Message font-size preset */
export type FontSize = "small" | "medium" | "large";

/** Chat density: compact has tighter padding */
export type DisplayDensity = "compact" | "comfortable";

/** Enter key behaviour */
export type EnterKeyAction = "send" | "newline";

/** Language preference */
export type LanguageCode = "vi" | "en" | "system";

// ============================================
// SECTION SCHEMAS
// ============================================

export interface AppearanceSettings {
  theme: ThemeMode;
  accentColor: AccentColor;
  fontSize: FontSize;
  displayDensity: DisplayDensity;
}

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  messagePreview: boolean;
}

export interface PrivacySettings {
  showOnlineStatus: boolean;
  readReceipts: boolean;
  allowStrangersMessage: boolean;
}

export interface ChatSettings {
  autoScrollOnNewMessage: boolean;
  enterKeyAction: EnterKeyAction;
  saveSearchHistory: boolean;
}

// ============================================
// ROOT SETTINGS SCHEMA
// ============================================

export interface SettingsSchema {
  /** Schema version – bump when migrating */
  version: number;
  /** UI language preference */
  language: LanguageCode;
  appearance: AppearanceSettings;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  chat: ChatSettings;
  /** ISO-8601 timestamp of the last local mutation */
  updatedAt: string;
}

// ============================================
// PATCH HELPERS
// ============================================

/** Deep-partial variant so consumers can patch a single field */
export type SettingsPatch = {
  [K in keyof Omit<
    SettingsSchema,
    "version" | "updatedAt" | "language"
  >]?: Partial<SettingsSchema[K]>;
} & {
  /** Language can be patched directly as a scalar */
  language?: LanguageCode;
};

/** Section keys (for selective subscriptions) */
export type SettingsSection = keyof Omit<
  SettingsSchema,
  "version" | "updatedAt" | "language"
>;

// ============================================
// SERVER DTO
// ============================================

/** Shape returned / accepted by backend */
export interface ServerSettingsDto {
  settings: Omit<SettingsSchema, "version">;
  updatedAt: string;
}
