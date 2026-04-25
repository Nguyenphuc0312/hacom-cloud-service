import { beforeEach, describe, expect, it, vi } from "vitest";

const { patchMock, getAccessTokenMock, triggerSettingsConflictSyncMock } =
  vi.hoisted(() => ({
    patchMock: vi.fn(),
    getAccessTokenMock: vi.fn(),
    triggerSettingsConflictSyncMock: vi.fn(),
  }));

vi.mock("../lib/axios", () => ({
  default: {
    patch: patchMock,
    get: vi.fn(),
  },
}));

vi.mock("../services/tokenService", () => ({
  getAccessToken: getAccessTokenMock,
}));

vi.mock("./settingsSyncBridge", () => ({
  triggerSettingsConflictSync: triggerSettingsConflictSyncMock,
}));

import { defaultSettings } from "./defaults";
import { syncSettingsToServer } from "./sync";

describe("settings sync payloads", () => {
  beforeEach(() => {
    patchMock.mockReset();
    getAccessTokenMock.mockReset();
    triggerSettingsConflictSyncMock.mockReset();
    getAccessTokenMock.mockReturnValue("access-token");
  });

  it("omits deprecated allowStrangersMessage from outbound patches", async () => {
    patchMock.mockResolvedValue(undefined);

    await syncSettingsToServer({
      ...defaultSettings,
      privacy: {
        ...defaultSettings.privacy,
        showOnlineStatus: false,
        readReceipts: false,
        allowStrangersMessage: true,
      },
    });

    expect(patchMock).toHaveBeenCalledWith(
      "/me/settings",
      expect.objectContaining({
        privacy: {
          showOnlineStatus: false,
          readReceipts: false,
        },
      }),
    );
    expect(patchMock.mock.calls[0]?.[1]?.privacy).not.toHaveProperty(
      "allowStrangersMessage",
    );
  });
});
