/**
 * @fileoverview Server sync service for settings
 *
 * GET  /users/settings  → fetch preferences from backend
 * PATCH /users/settings → push local preferences to backend
 *
 * The backend may not have these endpoints yet. The service is resilient:
 * if the request 404s we silently ignore so offline-first still works.
 */

import apiClient from "../lib/axios";
import type { ApiResponse } from "@hacom/chat-shared-types";
import type { SettingsSchema, ServerSettingsDto } from "./types";
import { SETTINGS_VERSION } from "./defaults";
import { getAccessToken } from "../services/tokenService";

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
        await apiClient.get<ApiResponse<ServerSettingsDto>>("/users/settings");

      if (!res.data.success || !res.data.data) return null;

      const dto = res.data.data;
      return {
        ...dto.settings,
        version: SETTINGS_VERSION,
        updatedAt: dto.updatedAt,
      } as SettingsSchema;
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
 * Push local settings to backend.
 * Fire-and-forget by default (caller doesn't await in hot path).
 */
export const syncSettingsToServer = async (
  settings: SettingsSchema,
): Promise<void> => {
  const token = getAccessToken();
  if (!token) return; // not logged in

  try {
    const { version: _, ...rest } = settings;
    await apiClient.patch("/users/settings", {
      settings: rest,
      updatedAt: settings.updatedAt,
    } satisfies Omit<ServerSettingsDto, "settings"> & {
      settings: Omit<SettingsSchema, "version">;
    });
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response
      ?.status;
    // 404 = endpoint not available yet — swallow silently
    if (status === 404) return;
    throw err;
  }
};
