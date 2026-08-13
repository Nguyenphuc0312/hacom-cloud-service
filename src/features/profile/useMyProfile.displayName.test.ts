/**
 * Nails down which source wins for the *own* profile name, using the real
 * account shape from the bug report (HR name "Đậu Cao Minh Nhật", username
 * "HC888891") after the user saves a new displayName.
 */
import { describe, expect, it } from "vitest";
import { resolveUserDisplayName } from "../chat/identity/resolveUserDisplayName";

describe("own display name resolution", () => {
  const hrName = "Đậu Cao Minh Nhật";

  it("prefers a freshly saved displayName over the HR legal name", () => {
    expect(
      resolveUserDisplayName(
        { displayName: "Tên Mới", username: "HC888891", fullNameFromHr: hrName },
        { allowLegacyFallback: true },
      ),
    ).toBe("Tên Mới");
  });

  // Regression: a self-chosen name with a digit and no space (e.g. "Nhat123")
  // used to trip the system-identifier heuristic and be replaced by the HR legal
  // name, so renaming yourself looked like a no-op despite the success toast.
  it("keeps a self-authored name that happens to contain a digit", () => {
    expect(
      resolveUserDisplayName(
        { displayName: "Nhat123", username: "HC888891", fullNameFromHr: hrName },
        { allowLegacyFallback: true, trustDisplayName: true },
      ),
    ).toBe("Nhat123");
  });

  // For *other* users the heuristic must stay: a projected employee code must
  // never be shown as somebody's name.
  it("still discards an identifier-looking name for other users", () => {
    expect(
      resolveUserDisplayName(
        { displayName: "HC888892", username: "HC888892", fullNameFromHr: hrName },
        { allowLegacyFallback: true },
      ),
    ).toBe(hrName);
  });

  it("never shows a raw employee code even when trusting displayName", () => {
    // trustDisplayName only bypasses the identifier heuristic; an empty
    // displayName still falls through to the HR name.
    expect(
      resolveUserDisplayName(
        { displayName: "", username: "HC888891", fullNameFromHr: hrName },
        { allowLegacyFallback: true, trustDisplayName: true },
      ),
    ).toBe(hrName);
  });

  it("keeps a plain single-word name", () => {
    expect(
      resolveUserDisplayName(
        { displayName: "Nhat", username: "HC888891", fullNameFromHr: hrName },
        { allowLegacyFallback: true },
      ),
    ).toBe("Nhat");
  });

  it("falls back to the HR name when displayName is cleared", () => {
    expect(
      resolveUserDisplayName(
        { displayName: "", username: "HC888891", fullNameFromHr: hrName },
        { allowLegacyFallback: true },
      ),
    ).toBe(hrName);
  });
});
