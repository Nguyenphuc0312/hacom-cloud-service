import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TipTapEditor, type TipTapEditorHandle } from "./TipTapEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TipTapEditor", () => {
  it("does not register duplicate link extensions across remounts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = render(<TipTapEditor placeholder="First conversation" />);
    first.unmount();

    render(<TipTapEditor placeholder="Second conversation" />);

    await vi.waitFor(() => {
      expect(
        warnSpy.mock.calls.some(([message]) =>
          String(message).includes("Duplicate extension names found"),
        ),
      ).toBe(false);
    });
  });

  it("reports the caret on plain typing, so the mention panel can open", async () => {
    const onSelectionChange = vi.fn();
    const ref = React.createRef<TipTapEditorHandle>();

    render(<TipTapEditor ref={ref} onSelectionChange={onSelectionChange} />);
    await vi.waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());

    onSelectionChange.mockClear();
    ref.current!.insertAtCursor("liên hệ trực tiếp bạn @");

    await vi.waitFor(() => expect(onSelectionChange).toHaveBeenCalled());
    const [text, caret] = onSelectionChange.mock.calls.at(-1)!;
    expect(text).toBe("liên hệ trực tiếp bạn @");
    expect(caret).toBe(text.length);
  });

  it("keeps the caret aligned with getText() when a chip carries an alias", async () => {
    const onSelectionChange = vi.fn();
    const ref = React.createRef<TipTapEditorHandle>();

    render(<TipTapEditor ref={ref} onSelectionChange={onSelectionChange} />);
    await vi.waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());

    // label (shown) and sendLabel (sent) differ in length — the caret must follow
    // sendLabel, because that is what getText() serialises.
    ref.current!.insertMentionChip(
      { from: 0, to: 0 },
      { id: "u1", label: "Cu", sendLabel: "Nguyễn Minh Quốc" },
    );
    onSelectionChange.mockClear();
    ref.current!.insertAtCursor("@");

    await vi.waitFor(() => expect(onSelectionChange).toHaveBeenCalled());
    const [text, caret] = onSelectionChange.mock.calls.at(-1)!;
    expect(text.endsWith("@")).toBe(true);
    expect(caret).toBe(text.length);
  });
});
