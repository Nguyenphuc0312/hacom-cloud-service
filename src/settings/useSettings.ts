/**
 * @fileoverview useSettings hook
 *
 * Thin convenience layer over the Zustand store.
 * Components should prefer this hook for readability.
 */

import { useShallow } from "zustand/react/shallow";
import {
  useSettingsStore,
  useSettingsSection,
  useUpdateSettings,
} from "./settingsStore";
import type { SettingsPatch, SettingsSection } from "./types";

export const useSettings = () => {
  const settings = useSettingsStore(
    useShallow((s) => ({
      language: s.language,
      appearance: s.appearance,
      notifications: s.notifications,
      privacy: s.privacy,
      chat: s.chat,
      updatedAt: s.updatedAt,
    })),
  );

  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const syncFromServer = useSettingsStore((s) => s.syncFromServer);
  const isSyncing = useSettingsStore((s) => s.isSyncing);
  const syncError = useSettingsStore((s) => s.syncError);
  const lastSyncedAt = useSettingsStore((s) => s.lastSyncedAt);

  return {
    ...settings,
    updateSettings,
    resetSettings,
    syncFromServer,
    isSyncing,
    syncError,
    lastSyncedAt,
  };
};

/** Re-export section hook for granular subscriptions */
export { useSettingsSection, useUpdateSettings };
export type { SettingsPatch, SettingsSection };
