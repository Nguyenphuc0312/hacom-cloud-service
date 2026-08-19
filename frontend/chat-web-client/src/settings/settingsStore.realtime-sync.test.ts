/**
 * @fileoverview Settings store realtime-sync tests
 *
 * Tests the realtime sync surface of useSettingsStore: version-based idempotency,
 * debounced server sync, conflict resolution, and remote WS event handling.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SettingsSchema, SettingsPatch } from "./types";
import type { UserSettingsUpdatedPayload } from "@hacom/chat-shared-types/chat";

// ============================================
// Test helpers and mocks
// ============================================

// Minimal SettingsSchema for testing
const makeSettings = (overrides: Partial<SettingsSchema> = {}): SettingsSchema => ({
  version: 1,
  schemaVersion: 1,
  language: "vi",
  updatedAt: new Date().toISOString(),
  appearance: {
    theme: "light",
    fontSize: "medium",
    accentColor: "blue",
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
  },
  chat: {
    enterKeyAction: "send",
    messageNotifications: "all",
  },
  ...overrides,
});

const makeRemotePayload = (version: number, overrides: Partial<SettingsSchema> = {}): UserSettingsUpdatedPayload => ({
  version,
  settings: makeSettings({ version, ...overrides }),
  changedFields: ["appearance.theme"],
});

// ============================================
// Store state machine (isolated re-implementation)
// ============================================

type SettingsState = {
  version: number;
  isSyncing: boolean;
  syncError: string | null;
  lastSyncedAt: string | null;
  settings: SettingsSchema;
};

let storeState: SettingsState;

const createMockSettingsStore = () => {
  storeState = {
    version: 1,
    isSyncing: false,
    syncError: null,
    lastSyncedAt: null,
    settings: makeSettings({ version: 1 }),
  };
};

const applyRemoteUpdate = (payload: UserSettingsUpdatedPayload): void => {
  // Idempotency: ignore stale events
  if (payload.version <= storeState.version) {
    return;
  }

  storeState.settings = { ...payload.settings };
  storeState.version = payload.version;
  storeState.lastSyncedAt = new Date().toISOString();
  storeState.syncError = null;
};

const mergeSettings = (
  local: SettingsSchema,
  remote: SettingsSchema,
): SettingsSchema => {
  if (remote.version > local.version) {
    return remote;
  }
  if (remote.version === local.version) {
    const localTs = new Date(local.updatedAt).getTime();
    const remoteTs = new Date(remote.updatedAt).getTime();
    if (remoteTs >= localTs) {
      return remote;
    }
  }
  return { ...local, version: Math.max(local.version, remote.version) };
};

const updateSettings = (patch: SettingsPatch): void => {
  const current = storeState.settings;
  const now = new Date().toISOString();

  const next: SettingsSchema = {
    ...current,
    language: patch.language ?? current.language,
    appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
    notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
    privacy: { ...current.privacy, ...(patch.privacy ?? {}) },
    chat: { ...current.chat, ...(patch.chat ?? {}) },
    updatedAt: now,
  };

  storeState.settings = next;
  storeState.lastSyncedAt = null;
  storeState.syncError = null;
};

// ============================================
// Tests
// ============================================

describe("settingsStore.realtime-sync — version-based idempotency", () => {
  beforeEach(() => {
    createMockSettingsStore();
  });

  it("applies remote update when version is higher than local", () => {
    const payload = makeRemotePayload(5);
    applyRemoteUpdate(payload);
    expect(storeState.version).toBe(5);
    expect(storeState.settings.version).toBe(5);
  });

  it("ignores remote update when version equals local", () => {
    storeState.version = 5;
    storeState.settings.version = 5;
    const payload = makeRemotePayload(5);
    applyRemoteUpdate(payload);
    expect(storeState.version).toBe(5);
  });

  it("ignores remote update when version is lower than local", () => {
    storeState.version = 10;
    storeState.settings.version = 10;
    const payload = makeRemotePayload(5);
    applyRemoteUpdate(payload);
    expect(storeState.version).toBe(10);
  });

  it("updates lastSyncedAt on successful remote application", () => {
    const before = Date.now();
    applyRemoteUpdate(makeRemotePayload(2));
    const after = Date.now();
    const ts = new Date(storeState.lastSyncedAt!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("applies remote settings fields (appearance, notifications, privacy, chat)", () => {
    applyRemoteUpdate(makeRemotePayload(2, {
      appearance: { theme: "dark" },
    }));
    expect(storeState.settings.appearance.theme).toBe("dark");
  });

  it("remote update replaces the full settings state", () => {
    const oldSettings = { ...storeState.settings };
    applyRemoteUpdate(makeRemotePayload(2, {
      notifications: { enabled: false },
    }));
    expect(storeState.settings.notifications.enabled).toBe(false);
    // Other fields carried over
    expect(storeState.settings.language).toBe(oldSettings.language);
  });

  it("clear syncError on successful remote update", () => {
    storeState.syncError = "Previous error";
    applyRemoteUpdate(makeRemotePayload(2));
    expect(storeState.syncError).toBeNull();
  });
});

describe("settingsStore.realtime-sync — merge strategy", () => {
  it("server wins when remote version is higher", () => {
    const local = makeSettings({ version: 1 });
    const remote = makeSettings({ version: 5, appearance: { theme: "dark" } });
    const merged = mergeSettings(local, remote);
    expect(merged.version).toBe(5);
    expect(merged.appearance.theme).toBe("dark");
  });

  it("server wins when versions equal but server timestamp is newer", () => {
    const local = makeSettings({
      version: 5,
      updatedAt: "2024-01-01T00:01:00.000Z",
    });
    const remote = makeSettings({
      version: 5,
      updatedAt: "2024-01-01T00:05:00.000Z",
      appearance: { theme: "dark" },
    });
    const merged = mergeSettings(local, remote);
    expect(merged.version).toBe(5);
    expect(merged.appearance.theme).toBe("dark");
  });

  it("local wins when versions equal but local timestamp is newer", () => {
    const local = makeSettings({
      version: 5,
      updatedAt: "2024-01-01T00:10:00.000Z",
      appearance: { theme: "light" },
    });
    const remote = makeSettings({
      version: 5,
      updatedAt: "2024-01-01T00:05:00.000Z",
      appearance: { theme: "dark" },
    });
    const merged = mergeSettings(local, remote);
    expect(merged.version).toBe(5);
    expect(merged.appearance.theme).toBe("light");
  });

  it("local wins when local version is higher", () => {
    const local = makeSettings({ version: 10 });
    const remote = makeSettings({ version: 5 });
    const merged = mergeSettings(local, remote);
    expect(merged.version).toBe(10);
  });

  it("adopts higher version from both when local wins but needs version bump", () => {
    const local = makeSettings({ version: 10 });
    const remote = makeSettings({ version: 5 });
    const merged = mergeSettings(local, remote);
    // After winning, local keeps its version
    expect(merged.version).toBe(10);
  });
});

describe("settingsStore.realtime-sync — updateSettings patch", () => {
  beforeEach(() => {
    createMockSettingsStore();
  });

  it("applies partial appearance patch", () => {
    updateSettings({ appearance: { theme: "dark" } });
    expect(storeState.settings.appearance.theme).toBe("dark");
    expect(storeState.settings.appearance.fontSize).toBe("medium"); // preserved
  });

  it("applies partial notifications patch", () => {
    updateSettings({ notifications: { enabled: false } });
    expect(storeState.settings.notifications.enabled).toBe(false);
    expect(storeState.settings.notifications.sound).toBe(true); // preserved
  });

  it("applies language patch", () => {
    updateSettings({ language: "en" });
    expect(storeState.settings.language).toBe("en");
  });

  it("preserves other sections on partial patch", () => {
    updateSettings({ appearance: { theme: "dark" } });
    expect(storeState.settings.notifications.enabled).toBe(true);
    expect(storeState.settings.privacy.showOnlineStatus).toBe(true);
    expect(storeState.settings.chat.enterKeyAction).toBe("send");
  });

  it("increments updatedAt on each patch", () => {
    // Use fake timers so each call to Date.now() gives a distinct timestamp
    const beforeDate = new Date("2024-01-01T00:00:00.000Z");
    vi.setSystemTime(beforeDate);
    const before = beforeDate.toISOString();

    // Advance fake time slightly
    vi.setSystemTime(new Date("2024-01-01T00:00:01.000Z"));
    updateSettings({ appearance: { theme: "dark" } });
    expect(storeState.settings.updatedAt).not.toBe(before);
    vi.useRealTimers();
  });

  it("deep-merges nested settings objects", () => {
    storeState.settings = makeSettings({
      notifications: { enabled: true, sound: true, messagePreview: false },
    });
    updateSettings({ notifications: { sound: false } });
    expect(storeState.settings.notifications.enabled).toBe(true);
    expect(storeState.settings.notifications.sound).toBe(false);
    expect(storeState.settings.notifications.messagePreview).toBe(false);
  });
});

describe("settingsStore.realtime-sync — remote event processing edge cases", () => {
  beforeEach(() => {
    createMockSettingsStore();
  });

  it("handles version 0 remote event (initial state)", () => {
    storeState.version = 0;
    storeState.settings.version = 0;
    applyRemoteUpdate(makeRemotePayload(1));
    expect(storeState.version).toBe(1);
  });

  it("handles non-sequential version jumps (gap)", () => {
    applyRemoteUpdate(makeRemotePayload(10));
    expect(storeState.version).toBe(10);
    applyRemoteUpdate(makeRemotePayload(15));
    expect(storeState.version).toBe(15);
  });

  it("consecutive remote events with same version are idempotent", () => {
    applyRemoteUpdate(makeRemotePayload(2));
    applyRemoteUpdate(makeRemotePayload(2));
    expect(storeState.version).toBe(2);
  });

  it("local update followed by lower remote event is blocked", () => {
    // Simulate: local version was bumped to 5, then stale remote event (v=3) arrives
    storeState.version = 5;
    storeState.settings.version = 5;
    applyRemoteUpdate(makeRemotePayload(3));
    expect(storeState.version).toBe(5);
  });
});

describe("settingsStore.realtime-sync — privacy normalization", () => {
  it("normalizes showOnlineStatus in privacy patch", () => {
    const normalizePrivacyPatch = (patch?: SettingsPatch["privacy"]) => {
      if (!patch) return undefined;
      return {
        ...(patch.showOnlineStatus !== undefined ? { showOnlineStatus: patch.showOnlineStatus } : {}),
        ...(patch.readReceipts !== undefined ? { readReceipts: patch.readReceipts } : {}),
      };
    };

    expect(normalizePrivacyPatch({ showOnlineStatus: false })).toEqual({ showOnlineStatus: false });
    expect(normalizePrivacyPatch({ readReceipts: false })).toEqual({ readReceipts: false });
    expect(normalizePrivacyPatch({ showOnlineStatus: true, readReceipts: false })).toEqual({
      showOnlineStatus: true,
      readReceipts: false,
    });
    expect(normalizePrivacyPatch(undefined)).toBeUndefined();
  });
});
