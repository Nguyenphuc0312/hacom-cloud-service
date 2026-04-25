/**
 * @fileoverview Zustand store for settings
 *
 * Key design decisions:
 * - Separate store from uiStore to keep concerns isolated.
 * - Patch-based updates: `updateSettings({ appearance: { fontSize: 'large' } })`
 *   only touches appearance slice → minimal re-renders via zustand selectors.
 * - Optimistic local update → debounced server sync.
 * - On login: fetch server prefs → merge → save.
 * - WS event handler: `applyRemoteUpdate()` for multi-device sync.
 * - Version-aware: server version used for optimistic locking.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { SettingsSchema, SettingsPatch, SettingsSection } from "./types";
import type { UserSettingsUpdatedPayload } from "@hacom/chat-shared-types/chat";
import { defaultSettings } from "./defaults";
import { loadSettings, saveSettings } from "./persistence";
import { syncSettingsToServer, fetchSettingsFromServer } from "./sync";
import { registerSettingsConflictHandler } from "./settingsSyncBridge";
import { logger } from "../utils/logger";

// ============================================
// STORE INTERFACE
// ============================================

interface SettingsState extends SettingsSchema {
  /** Indicates if server sync is in flight */
  isSyncing: boolean;

  /** Latest sync error message for UI feedback */
  syncError: string | null;

  /** Last timestamp a server sync completed successfully */
  lastSyncedAt: string | null;

  /** Apply a partial patch (deep-merged per section) */
  updateSettings: (patch: SettingsPatch) => void;

  /** Reset all settings to defaults */
  resetSettings: () => void;

  /**
   * Pull settings from server, merge with local, then apply.
   * Called once on login / app init when authenticated.
   */
  syncFromServer: () => Promise<void>;

  /**
   * Apply a remote settings update from WS event.
   * Called when USER_SETTINGS_UPDATED event is received.
   * Uses version to ensure idempotency (ignores stale events).
   */
  applyRemoteUpdate: (payload: UserSettingsUpdatedPayload) => void;
}

// ============================================
// DEBOUNCED SERVER SYNC
// ============================================

let syncTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 1500;

const resolveSyncErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unable to sync settings right now. Please retry.";
};

const debouncedServerSync = (
  settings: SettingsSchema,
  handlers?: {
    onSuccess?: () => void;
    onError?: (message: string) => void;
  },
) => {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncSettingsToServer(settings)
      .then(() => {
        handlers?.onSuccess?.();
      })
      .catch((err) => {
        logger.warn("settings", "server_sync_failed", err);
        handlers?.onError?.(resolveSyncErrorMessage(err));
      });
  }, SYNC_DEBOUNCE_MS);
};

/** Cancel any pending debounced sync (e.g. when receiving remote update) */
const cancelPendingSync = () => {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
};

const normalizePrivacyPatch = (patch?: SettingsPatch["privacy"]) => {
  if (!patch) return undefined;

  return {
    ...(patch.showOnlineStatus !== undefined
      ? { showOnlineStatus: patch.showOnlineStatus }
      : {}),
    ...(patch.readReceipts !== undefined
      ? { readReceipts: patch.readReceipts }
      : {}),
  };
};

// ============================================
// STORE
// ============================================

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    // Hydrate from localStorage on creation
    ...loadSettings(),
    isSyncing: false,
    syncError: null,
    lastSyncedAt: null,

    updateSettings: (patch) => {
      const current = get();
      const normalizedPrivacyPatch = normalizePrivacyPatch(patch.privacy);
      const hasEffectivePatch =
        patch.language !== undefined ||
        Object.keys(patch.appearance ?? {}).length > 0 ||
        Object.keys(patch.notifications ?? {}).length > 0 ||
        Object.keys(normalizedPrivacyPatch ?? {}).length > 0 ||
        Object.keys(patch.chat ?? {}).length > 0;

      if (!hasEffectivePatch) {
        return;
      }

      const now = new Date().toISOString();

      const next: SettingsSchema = {
        ...current,
        language: patch.language ?? current.language,
        appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
        notifications: {
          ...current.notifications,
          ...(patch.notifications ?? {}),
        },
        privacy: { ...current.privacy, ...(normalizedPrivacyPatch ?? {}) },
        chat: { ...current.chat, ...(patch.chat ?? {}) },
        updatedAt: now,
      };

      // Optimistic local persistence
      saveSettings(next);
      set({ ...next, syncError: null });

      // Debounced background sync
      debouncedServerSync(next, {
        onSuccess: () =>
          set({
            syncError: null,
            lastSyncedAt: new Date().toISOString(),
          }),
        onError: (message) => set({ syncError: message }),
      });
    },

    resetSettings: () => {
      const reset = { ...defaultSettings, updatedAt: new Date().toISOString() };
      saveSettings(reset);
      set({ ...reset, syncError: null });
      debouncedServerSync(reset, {
        onSuccess: () =>
          set({
            syncError: null,
            lastSyncedAt: new Date().toISOString(),
          }),
        onError: (message) => set({ syncError: message }),
      });
    },

    syncFromServer: async () => {
      set({ isSyncing: true, syncError: null });
      try {
        const remote = await fetchSettingsFromServer();
        if (!remote) {
          // No server settings → push local to server
          debouncedServerSync(get(), {
            onSuccess: () =>
              set({
                syncError: null,
                lastSyncedAt: new Date().toISOString(),
              }),
            onError: (message) => set({ syncError: message }),
          });
          set({
            isSyncing: false,
            syncError: null,
            lastSyncedAt: new Date().toISOString(),
          });
          return;
        }

        const local = get();
        // Conflict resolution: server wins if newer version
        const merged = mergeSettings(local, remote);
        saveSettings(merged);
        set({
          ...merged,
          isSyncing: false,
          syncError: null,
          lastSyncedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn("settings", "sync_from_server_failed", err);
        set({ syncError: resolveSyncErrorMessage(err) });
      } finally {
        set({ isSyncing: false });
      }
    },

    applyRemoteUpdate: (payload: UserSettingsUpdatedPayload) => {
      const current = get();

      // Idempotency: ignore events with version <= local version
      if (payload.version <= current.version) {
        logger.debug("settings", "stale_remote_event_ignored", {
          remoteVersion: payload.version,
          localVersion: current.version,
        });
        return;
      }

      // Cancel any pending debounced sync to avoid overwriting the remote update
      cancelPendingSync();

      // Apply full settings snapshot from the event
      const updated: SettingsSchema = {
        ...payload.settings,
      };

      saveSettings(updated);
      set({
        ...updated,
        syncError: null,
        lastSyncedAt: new Date().toISOString(),
      });

      logger.info("settings", "remote_update_applied", {
        version: payload.version,
        changedFields: payload.changedFields,
      });
    },
  })),
);

// ============================================
// MERGE STRATEGY
// ============================================

/**
 * Merge local and remote settings.
 * Strategy: higher version wins (server is source of truth for version).
 * If versions equal, use updatedAt timestamp as tiebreaker.
 */
const mergeSettings = (
  local: SettingsSchema,
  remote: SettingsSchema,
): SettingsSchema => {
  // Server version is always authoritative
  if (remote.version > local.version) {
    return remote;
  }

  if (remote.version === local.version) {
    // Same version → use timestamp as tiebreaker
    const localTs = new Date(local.updatedAt).getTime();
    const remoteTs = new Date(remote.updatedAt).getTime();
    if (remoteTs >= localTs) {
      return remote;
    }
  }

  // Local is newer — keep local but adopt server version for next PATCH
  return { ...local, version: Math.max(local.version, remote.version) };
};

// ============================================
// SELECTOR HOOKS (avoid unnecessary re-renders)
// ============================================

/** Subscribe to only a specific section */
export const useSettingsSection = <S extends SettingsSection>(
  section: S,
): SettingsSchema[S] => useSettingsStore((state) => state[section]);

/** Convenience: get the updater */
export const useUpdateSettings = () =>
  useSettingsStore((state) => state.updateSettings);

registerSettingsConflictHandler(() => useSettingsStore.getState().syncFromServer());
