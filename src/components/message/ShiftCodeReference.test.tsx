import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hrApi } from "../../features/api/hrApi";

import {
  linkifyShiftCodesInHtml,
  tokenizeShiftCodes,
} from "./ShiftCodeReference";
import { MessageContentRenderer } from "./MessageContentRenderer";
import { TextMessage } from "./TextMessage";

describe("shift-code message rendering", () => {
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
});
