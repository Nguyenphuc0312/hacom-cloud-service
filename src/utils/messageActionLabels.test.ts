import { describe, expect, it, vi } from "vitest";
import {
  translateMessageActionToast,
  translateWithFallback,
} from "./messageActionLabels";

describe("message action labels", () => {
  it("falls back when i18n returns an empty toast message", () => {
    const t = vi.fn(() => "");

    expect(translateMessageActionToast(t, "saveSuccess")).toBe("Đã lưu tin nhắn");
    expect(translateMessageActionToast(t, "unsaveSuccess")).toBe(
      "Đã bỏ lưu tin nhắn",
    );
  });

  it("falls back when i18n returns the untranslated key", () => {
    const t = vi.fn((key: string) => key);

    expect(translateWithFallback(t, "chat:message.saveSuccess", "Đã lưu")).toBe(
      "Đã lưu",
    );
  });
});
