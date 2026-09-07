import { describe, expect, it } from "vitest";
import {
  resolveMessageIdAtY,
  shouldShowCloudSelectionToolbar,
} from "./cloudSelection";

describe("cloud selection helpers", () => {
  it("resolves a message by vertical position outside the bubble", () => {
    expect(
      resolveMessageIdAtY(
        [
          { id: "first", top: 100, bottom: 148 },
          { id: "second", top: 164, bottom: 212 },
        ],
        180,
      ),
    ).toBe("second");
  });

  it("returns no message between rows", () => {
    expect(
      resolveMessageIdAtY(
        [
          { id: "first", top: 100, bottom: 148 },
          { id: "second", top: 164, bottom: 212 },
        ],
        156,
      ),
    ).toBeUndefined();
  });

  it("keeps the toolbar for one or more selected messages", () => {
    expect(shouldShowCloudSelectionToolbar(true, 3)).toBe(true);
    expect(shouldShowCloudSelectionToolbar(true, 1)).toBe(true);
    expect(shouldShowCloudSelectionToolbar(false, 3)).toBe(false);
    expect(shouldShowCloudSelectionToolbar(true, 0)).toBe(false);
  });
});
