import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hrApi, type WorkShiftCatalogItem } from "../../features/api/hrApi";
import {
  createWorkShiftCodeMatcher,
  refreshWorkShiftCatalog,
  resetWorkShiftCatalogCache,
} from "../../hooks/useWorkShiftCatalog";

import {
  linkifyShiftCodesInHtml,
  tokenizeShiftCodes,
} from "./shiftCodeReferenceUtils";
import { MessageContentRenderer } from "./MessageContentRenderer";
import { TextMessage } from "./TextMessage";

const shift = (code: string, name = `Ca ${code}`): WorkShiftCatalogItem => ({
  code,
  name,
  groupName: "Hành chính",
  startTime: "08:00",
  endTime: "17:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  standardMinutes: 480,
  dayValue: 1,
});

describe("shift-code message rendering", () => {
  beforeEach(() => {
    resetWorkShiftCatalogCache();
    vi.spyOn(hrApi, "getWorkShiftCatalog").mockResolvedValue([shift("HC2")]);
  });

  afterEach(() => {
    resetWorkShiftCatalogCache();
    vi.restoreAllMocks();
  });

  it("recognizes the canonical shift catalogue without matching similar business codes", () => {
    expect(
      tokenizeShiftCodes(
        "Ca HC, HC-T7, HC2, vh1, S6; bỏ qua OFF, API2, HC20 và mã nhân viên HC000914.",
      )
        .filter((segment) => segment.code)
        .map((segment) => segment.code),
    ).toEqual(["HC", "HC-T7", "HC2", "VH1", "S6"]);
  });

  it("does not inject nested controls into links or code blocks", () => {
    const html = linkifyShiftCodesInHtml(
      '<p>HC2 <a href="#">VH1</a> <code>S1</code> BV6</p>',
      false,
    );

    expect(html).toContain('data-shift-code="HC2"');
    expect(html).toContain('data-shift-code="BV6"');
    expect(html).toContain('<a href="#">VH1</a>');
    expect(html).toContain("<code>S1</code>");
    expect(html).not.toContain('data-shift-code="VH1"');
    expect(html).not.toContain('data-shift-code="S1"');
  });

  it("escapes dynamic shift codes inserted into rich-text controls", () => {
    const matcher = createWorkShiftCodeMatcher(['QA"X']);
    const html = linkifyShiftCodesInHtml('<p>QA"X</p>', false, matcher);

    expect(html).toContain('data-shift-code="QA&quot;X"');
    expect(html).not.toContain('data-shift-code="QA"X"');
  });

  it("linkifies shift codes in ordinary messages without mention metadata", () => {
    render(<TextMessage content="Lịch hôm nay: HC2" isOwn={false} />);

    expect(screen.getByText("HC2").closest("button")).not.toBeNull();
  });

  it("opens the read-only catalogue when a shift code is clicked", async () => {
    vi.spyOn(hrApi, "getWorkShiftCatalog").mockResolvedValueOnce([
      {
        code: "HC2",
        name: "Ca HC 8h",
        groupName: "Hành chính",
        startTime: "08:00",
        endTime: "17:00",
        breakStart: "12:00",
        breakEnd: "13:00",
        standardMinutes: 480,
        dayValue: 1,
      },
    ]);

    render(
      <MessageContentRenderer
        content="Hôm nay tôi làm ca HC2."
        contentFormat="plain_text"
        isOwn={false}
      />,
    );

    const trigger = screen.getByText("HC2").closest("button");
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger!);

    expect(screen.getByRole("dialog")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText("Ca HC 8h").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /đóng|close/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("updates clickable codes when HRM changes the active shift catalogue", async () => {
    vi.mocked(hrApi.getWorkShiftCatalog)
      .mockResolvedValueOnce([shift("NEW-X")])
      .mockResolvedValueOnce([shift("LATE-X")]);

    await refreshWorkShiftCatalog(true);
    render(<TextMessage content="NEW-X LATE-X" isOwn={false} />);

    expect(screen.getByRole("button", { name: /NEW-X/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /LATE-X/i })).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /LATE-X/i })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /NEW-X/i })).toBeNull();
    });
  });
});
