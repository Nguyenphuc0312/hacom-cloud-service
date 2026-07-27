import { beforeEach, describe, expect, it } from "vitest";

import { clearDeclineReason, getDeclineReason, saveDeclineReason } from "./declineReasonStore";

describe("declineReasonStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when no reason was ever saved", () => {
    expect(getDeclineReason("event-1", "user-1")).toBeNull();
  });

  it("round-trips a saved reason for the exact event+user pair", () => {
    saveDeclineReason("event-1", "user-1", "Trùng lịch review sprint");
    expect(getDeclineReason("event-1", "user-1")).toBe("Trùng lịch review sprint");
  });

  it("keeps reasons for different events/users isolated", () => {
    saveDeclineReason("event-1", "user-1", "Lý do A");
    saveDeclineReason("event-2", "user-1", "Lý do B");
    saveDeclineReason("event-1", "user-2", "Lý do C");

    expect(getDeclineReason("event-1", "user-1")).toBe("Lý do A");
    expect(getDeclineReason("event-2", "user-1")).toBe("Lý do B");
    expect(getDeclineReason("event-1", "user-2")).toBe("Lý do C");
  });

  it("clears only the targeted event+user pair", () => {
    saveDeclineReason("event-1", "user-1", "Lý do A");
    saveDeclineReason("event-2", "user-1", "Lý do B");

    clearDeclineReason("event-1", "user-1");

    expect(getDeclineReason("event-1", "user-1")).toBeNull();
    expect(getDeclineReason("event-2", "user-1")).toBe("Lý do B");
  });
});
