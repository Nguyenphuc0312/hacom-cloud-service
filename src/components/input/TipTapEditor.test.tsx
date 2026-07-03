import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TipTapEditor } from "./TipTapEditor";

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
});
