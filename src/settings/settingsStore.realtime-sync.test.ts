import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSettingsUpdatedPayload } from "@hacom/chat-shared-types";
import { defaultSettings } from "./defaults";
import type { SettingsSchema } from "./types";

const { syncSettingsToServerMock, fetchSettingsFromServerMock } = vi.hoisted(
  () => ({
    syncSettingsToServerMock: vi.fn(),
    fetchSettingsFromServerMock: vi.fn(),
  }),
);

vi.mock("./sync", () => ({
  syncSettingsToServer: syncSettingsToServerMock,
  fetchSettingsFromServer: fetchSettingsFromServerMock,
}));

import { useSettingsStore } from "./settingsStore";

const toSettingsSchema = (): SettingsSchema => {
  const state = useSettingsStore.getState();
  return {
    version: state.version,
    schemaVersion: state.schemaVersion,
    updatedAt: state.updatedAt,
    language: state.language,
    appearance: state.appearance,
    notifications: state.notifications,
    privacy: state.privacy,
    chat: state.chat,
  };
};

const resetSettingsStore = () => {
  useSettingsStore.setState({
    ...defaultSettings,
    isSyncing: false,
    syncError: null,
    lastSyncedAt: null,
  });
};

describe("settingsStore realtime convergence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    syncSettingsToServerMock.mockReset();
    fetchSettingsFromServerMock.mockReset();
    resetSettingsStore();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("ignores stale user:settings_updated events", () => {
    resetSettingsStore();
    useSettingsStore.setState({
      version: 10,
      privacy: {
        ...useSettingsStore.getState().privacy,
        showOnlineStatus: true,
      },
    });

    const stalePayload: UserSettingsUpdatedPayload = {
      userId: "user-1",
      changedFields: ["privacy.showOnlineStatus"],
      version: 9,
      settings: {
        ...toSettingsSchema(),
        privacy: {
          ...useSettingsStore.getState().privacy,
          showOnlineStatus: false,
        },
      },
    };

    useSettingsStore.getState().applyRemoteUpdate(stalePayload);

    const state = useSettingsStore.getState();
    expect(state.version).toBe(10);
    expect(state.privacy.showOnlineStatus).toBe(true);
  });

  it("applies newer snapshot and cancels pending local push", async () => {
    syncSettingsToServerMock.mockResolvedValue(undefined);
    resetSettingsStore();
    useSettingsStore.setState({
      version: 20,
    });

    useSettingsStore.getState().updateSettings({
      privacy: { showOnlineStatus: false },
    });

    const remotePayload: UserSettingsUpdatedPayload = {
      userId: "user-1",
      changedFields: ["privacy.showOnlineStatus"],
      version: 21,
      settings: {
        ...toSettingsSchema(),
        version: 21,
        privacy: {
          ...useSettingsStore.getState().privacy,
          showOnlineStatus: true,
        },
      },
    };

    useSettingsStore.getState().applyRemoteUpdate(remotePayload);

    vi.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(syncSettingsToServerMock).not.toHaveBeenCalled();

    const state = useSettingsStore.getState();
    expect(state.version).toBe(21);
    expect(state.privacy.showOnlineStatus).toBe(true);
  });

  it("ignores deprecated allowStrangersMessage local patches", () => {
    resetSettingsStore();
    useSettingsStore.setState({
      privacy: {
        ...useSettingsStore.getState().privacy,
        allowStrangersMessage: false,
      },
    });

    useSettingsStore.getState().updateSettings({
      privacy: { allowStrangersMessage: true },
    });

    vi.advanceTimersByTime(2000);

    const state = useSettingsStore.getState();
    expect(state.privacy.allowStrangersMessage).toBe(false);
    expect(syncSettingsToServerMock).not.toHaveBeenCalled();
  });
});
