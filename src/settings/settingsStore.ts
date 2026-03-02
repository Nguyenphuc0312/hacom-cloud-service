/**
 * @fileoverview Zustand store for settings
 *
 * Key design decisions:
 * - Separate store from uiStore to keep concerns isolated.
 * - Patch-based updates: `updateSettings({ appearance: { fontSize: 'large' } })`
 *   only touches appearance slice → minimal re-renders via zustand selectors.
 * - Optimistic local update → debounced server sync.
 * - On login: fetch server prefs → merge → save.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { SettingsSchema, SettingsPatch, SettingsSection } from "./types";
import { defaultSettings } from "./defaults";
import { loadSettings, saveSettings } from "./persistence";
import { syncSettingsToServer, fetchSettingsFromServer } from "./sync";

// ============================================
// STORE INTERFACE
// ============================================

interface SettingsState extends SettingsSchema {
  /** Indicates if server sync is in flight */
  isSyncing: boolean;

  /** Apply a partial patch (deep-merged per section) */
  updateSettings: (patch: SettingsPatch) => void;

  /** Reset all settings to defaults */
  resetSettings: () => void;

  /**
   * Pull settings from server, merge with local, then apply.
   * Called once on login / app init when authenticated.
   */
  syncFromServer: () => Promise<void>;
}

// ============================================
// DEBOUNCED SERVER SYNC
// ============================================

let syncTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 1500;

const debouncedServerSync = (settings: SettingsSchema) => {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncSettingsToServer(settings).catch((err) =>
      console.warn("[settingsStore] server sync failed", err),
    );
  }, SYNC_DEBOUNCE_MS);
};

// ============================================
// STORE
// ============================================

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    // Hydrate from localStorage on creation
    ...loadSettings(),
    isSyncing: false,

    updateSettings: (patch) => {
      const current = get();
      const now = new Date().toISOString();

      const next: SettingsSchema = {
        ...current,
        language: patch.language ?? current.language,
        appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
        notifications: {
          ...current.notifications,
          ...(patch.notifications ?? {}),
        },
        privacy: { ...current.privacy, ...(patch.privacy ?? {}) },
        chat: { ...current.chat, ...(patch.chat ?? {}) },
        updatedAt: now,
      };

      // Optimistic local persistence
      saveSettings(next);
      set(next);

      // Debounced background sync
      debouncedServerSync(next);
    },

    resetSettings: () => {
      const reset = { ...defaultSettings, updatedAt: new Date().toISOString() };
      saveSettings(reset);
      set(reset);
      debouncedServerSync(reset);
    },

    syncFromServer: async () => {
      set({ isSyncing: true });
      try {
        const remote = await fetchSettingsFromServer();
        if (!remote) {
          // No server settings → push local to server
          debouncedServerSync(get());
          return;
        }

        const local = get();
        // Conflict resolution: server wins if newer
        const merged = mergeSettings(local, remote);
        saveSettings(merged);
        set({ ...merged, isSyncing: false });
      } catch (err) {
        console.warn("[settingsStore] syncFromServer failed", err);
      } finally {
        set({ isSyncing: false });
      }
    },
  })),
);

// ============================================
// MERGE STRATEGY
// ============================================

/**
 * Merge local and remote settings.
 * Strategy: last-write-wins per-section based on updatedAt.
 * If timestamps equal or remote newer → remote wins.
 */
const mergeSettings = (
  local: SettingsSchema,
  remote: SettingsSchema,
): SettingsSchema => {
  const localTs = new Date(local.updatedAt).getTime();
  const remoteTs = new Date(remote.updatedAt).getTime();

  if (remoteTs >= localTs) {
    // Remote is newer — take remote but preserve version
    return { ...remote, version: local.version };
  }

  // Local is newer — keep local
  return local;
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
