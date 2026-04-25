/**
 * @fileoverview Server sync service for settings
 *
 * GET  /me/settings  → fetch preferences from backend
 * PATCH /me/settings → push local preferences to backend (with optimistic locking)
 *
 * The backend may not have these endpoints yet. The service is resilient:
 * if the request 404s we silently ignore so offline-first still works.
 *
 * Optimistic locking: PATCH sends the current `version` number.
 * If another device updated in the meantime, the server returns 409.
 * On 409 we refetch and let the store merge via version comparison.
 */

import apiClient from "../lib/axios";
import type { ApiResponse } from "@hacom/chat-shared-types/core";
import type {
  SettingsPatchDto,
  SettingsResponseDto,
} from "@hacom/chat-shared-types/chat";
import type { SettingsSchema } from "./types";
import { getAccessToken } from "../services/tokenService";
import { triggerSettingsConflictSync } from "./settingsSyncBridge";
import { logger } from "../utils/logger";

// ============================================
// FETCH FROM SERVER
// ============================================

/**
 * Fetch settings from the backend.
 * Returns null when the endpoint is unavailable (404) or user is unauthenticated.
 */
export const fetchSettingsFromServer =
  async (): Promise<SettingsSchema | null> => {
    const token = getAccessToken();
    if (!token) return null; // not logged in

    try {
      const res =
        await apiClient.get<ApiResponse<SettingsResponseDto>>("/me/settings");

      if (!res.data.success || !res.data.data) return null;

      // SettingsResponseDto wraps a full SettingsSchema
      return res.data.data.settings;
    } catch (err: unknown) {
      // 404 = endpoint not deployed yet → silently return null
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) return null;

      throw err;
    }
  };

// ============================================
// PUSH TO SERVER
// ============================================

/**
 * Push local settings to backend using SettingsPatchDto format.
 * Deprecated compatibility-only privacy fields are stripped here so the
 * frontend does not recreate local-truth semantics for auth-owned policy.
 * Includes current `version` for optimistic locking.
 *
 * On 409 Conflict → refetch and let the store re-merge.
 */
export const syncSettingsToServer = async (
  settings: SettingsSchema,
): Promise<void> => {
  const token = getAccessToken();
  if (!token) return; // not logged in

  try {
    const privacyPatch = {
      ...(settings.privacy.showOnlineStatus !== undefined
        ? { showOnlineStatus: settings.privacy.showOnlineStatus }
        : {}),
      ...(settings.privacy.readReceipts !== undefined
        ? { readReceipts: settings.privacy.readReceipts }
        : {}),
    };

    const patchBody: SettingsPatchDto = {
      version: settings.version,
      language: settings.language,
      appearance: settings.appearance,
      notifications: settings.notifications,
      ...(Object.keys(privacyPatch).length > 0 ? { privacy: privacyPatch } : {}),
      chat: settings.chat,
    };

    await apiClient.patch("/me/settings", patchBody);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response
      ?.status;

    // 404 = endpoint not available yet — swallow silently
    if (status === 404) return;

    // 409 = version conflict → refetch server state, store will re-merge
    if (status === 409) {
      logger.warn("settings", "version_conflict_refetching", { status });
      void triggerSettingsConflictSync();
      return;
    }

    throw err;
  }
};
