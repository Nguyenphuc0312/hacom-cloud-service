/**
 * @fileoverview Reminder API guard tests.
 *
 * Proves QA case 5: a "default"/empty session_id NEVER hits the network and
 * never produces an error that could be misread as a session failure. The
 * reminder feature is optional and must not pressure the auth lifecycle.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchWithAuthMock = vi.fn();
const getAccessTokenMock = vi.fn();

vi.mock("../../../services/ai-chat/fetchWithAuth", () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));
vi.mock("../../../services/tokenService", () => ({
  getAccessToken: () => getAccessTokenMock(),
}));

import {
  isCallableReminderSession,
  checkPersonalReminder,
  activatePersonalReminder,
} from "./reminderApi";

describe("isCallableReminderSession", () => {
  it("rejects placeholder and empty sessions", () => {
    expect(isCallableReminderSession("default")).toBe(false);
    expect(isCallableReminderSession("DEFAULT")).toBe(false);
    expect(isCallableReminderSession(" default ")).toBe(false);
    expect(isCallableReminderSession("")).toBe(false);
    expect(isCallableReminderSession("   ")).toBe(false);
    expect(isCallableReminderSession(null)).toBe(false);
    expect(isCallableReminderSession(undefined)).toBe(false);
  });

  it("accepts a real session id", () => {
    expect(isCallableReminderSession("conv-123")).toBe(true);
  });
});

describe("reminder API never calls the backend with an invalid session", () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    getAccessTokenMock.mockReset();
    getAccessTokenMock.mockReturnValue("valid-token");
  });

  it("checkPersonalReminder('default') returns inert and does NOT fetch", async () => {
    const result = await checkPersonalReminder("default", "EMP001");
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
    expect(result).toEqual({ pending: false, unread_count: 0, items: [] });
  });

  it("activatePersonalReminder('') returns inert and does NOT fetch", async () => {
    const result = await activatePersonalReminder("", "EMP001");
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, created: false });
  });

  it("checkPersonalReminder with a real session DOES fetch", async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      json: async () => ({ pending: true, unread_count: 2, items: [] }),
    });
    const result = await checkPersonalReminder("conv-123", "EMP001");
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    expect(result.pending).toBe(true);
  });
});
