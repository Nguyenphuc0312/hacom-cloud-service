/**
 * @fileoverview Settings data model (schema, types, versioning)
 *
 * Re-exports canonical types from @hacom/chat-shared-types for type-safety,
 * and adds frontend-specific helpers (SettingsPatch, SettingsSection).
 *
 * Mỗi section (appearance, notifications, privacy, chat) là một object con
 * để dễ mở rộng và patch riêng từng phần mà không re-render toàn bộ.
 */

// ============================================
// RE-EXPORT FROM SHARED TYPES (canonical)
// ============================================

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
  ChatBehaviorSettings as ChatSettings,
  SettingsSchema,
  SettingsPatchDto,
  SettingsResponseDto,
  SettingsUpdateResponseDto,
  UserSettingsUpdatedPayload,
} from "@hacom/chat-shared-types";

// ============================================
// FRONTEND-SPECIFIC HELPERS
// ============================================

import type { SettingsSchema, LanguageCode } from "@hacom/chat-shared-types";

/** Deep-partial variant so consumers can patch a single field */
export type SettingsPatch = {
  [K in keyof Omit<
    SettingsSchema,
    "version" | "schemaVersion" | "updatedAt" | "language"
  >]?: Partial<SettingsSchema[K]>;
} & {
  /** Language can be patched directly as a scalar */
  language?: LanguageCode;
};

/** Section keys (for selective subscriptions) */
export type SettingsSection = keyof Omit<
  SettingsSchema,
  "version" | "schemaVersion" | "updatedAt" | "language"
>;

// ============================================
// SERVER DTO (backward compat alias)
// ============================================

/** Shape returned / accepted by backend */
export interface ServerSettingsDto {
  settings: SettingsSchema;
  changedFields?: string[];
}
