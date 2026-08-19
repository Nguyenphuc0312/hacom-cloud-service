import { describe, expect, it, vi } from "vitest";
import { translateWithFallback } from "./messageActionLabels";

describe("message action labels", () => {
  it("falls back when i18n returns an empty string", () => {
    const t = vi.fn(() => "");

    expect(translateWithFallback(t, "chat:message.actions.copy", "Sao chép")).toBe(
      "Sao chép",
    );
  });

  it("falls back when i18n returns the untranslated key", () => {
    const t = vi.fn((key: string) => key);

    expect(
      translateWithFallback(t, "chat:message.actions.deleteForMe", "Xóa chỉ ở phía tôi"),
    ).toBe("Xóa chỉ ở phía tôi");
  });
});
