import { describe, it, expect } from "vitest";
import { shouldScopeSelectAll } from "./SimpleVirtualizedChatTimeline";

/** Minimal stand-in for a keydown; `target` defaults to a plain (non-editable) node. */
const key = (
  overrides: Partial<Parameters<typeof shouldScopeSelectAll>[0]> = {},
) => ({
  key: "a",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  target: null,
  ...overrides,
});

const element = (html: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
};

describe("shouldScopeSelectAll (Ctrl+A selects messages, not the page)", () => {
  it("scopes Ctrl+A and Cmd+A over the timeline", () => {
    expect(shouldScopeSelectAll(key())).toBe(true);
    expect(shouldScopeSelectAll(key({ ctrlKey: false, metaKey: true }))).toBe(true);
  });

  it("still scopes when Shift/Caps Lock uppercases the key", () => {
    expect(shouldScopeSelectAll(key({ key: "A" }))).toBe(true);
  });

  it("ignores plain 'a' and other modifier combos", () => {
    expect(shouldScopeSelectAll(key({ ctrlKey: false }))).toBe(false);
    expect(shouldScopeSelectAll(key({ key: "c" }))).toBe(false);
    // Ctrl+Alt+A is a distinct shortcut — leave it to the browser/OS.
    expect(shouldScopeSelectAll(key({ altKey: true }))).toBe(false);
  });

  it("leaves Ctrl+A alone while typing, so it selects the field", () => {
    expect(shouldScopeSelectAll(key({ target: element("<input />") }))).toBe(false);
    expect(shouldScopeSelectAll(key({ target: element("<textarea></textarea>") }))).toBe(
      false,
    );

    const editor = element('<div contenteditable="true"><span>hi</span></div>');
    // Tiptap fires with the inner node as target, not the editable root.
    expect(shouldScopeSelectAll(key({ target: editor.firstElementChild }))).toBe(false);
  });
});
