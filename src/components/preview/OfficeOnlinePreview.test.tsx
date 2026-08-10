/**
 * Bug đã gặp thật (08-08-26): tài liệu đang hiện ĐÚNG bằng Office Online thì sau
 * ~20 giây tự nhảy sang bản tự render — "đang đúng tự dưng load về cái cũ".
 *
 * Nguyên nhân: effect đặt hạn chờ chỉ phụ thuộc [url], không đọc trạng thái đã
 * load, nên hạn chờ vẫn nổ kể cả khi iframe `load` xong từ lâu.
 *
 * Test này khoá đúng hành vi đó lại.
 */

import React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfficeOnlinePreview } from "./OfficeOnlinePreview";

const PUBLIC_URL = "https://files.example.com/doc.docx?sig=abc";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Đẩy thời gian ảo đi, bọc trong act để React xử lý hết cập nhật. */
const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("OfficeOnlinePreview", () => {
  it("KHÔNG báo hỏng sau khi iframe đã load xong", () => {
    const onUnavailable = vi.fn();
    render(
      <OfficeOnlinePreview
        url={PUBLIC_URL}
        fileName="bao-cao.docx"
        onUnavailable={onUnavailable}
      />,
    );

    // Viewer load xong ở giây thứ 2.
    advance(2_000);
    act(() => {
      screen.getByTitle("bao-cao.docx").dispatchEvent(new Event("load"));
    });

    // Bỏ qua rất lâu sau hạn chờ: tài liệu phải được yên, không bị thay thế.
    advance(120_000);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("báo hỏng khi quá hạn chờ mà iframe chưa load", () => {
    const onUnavailable = vi.fn();
    render(
      <OfficeOnlinePreview
        url={PUBLIC_URL}
        fileName="ke-hoach.xlsx"
        onUnavailable={onUnavailable}
      />,
    );

    advance(19_000);
    expect(onUnavailable).not.toHaveBeenCalled();

    advance(2_000); // vượt mốc 20 giây
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("ẩn lớp 'đang tải' sau khi load xong", () => {
    render(
      <OfficeOnlinePreview
        url={PUBLIC_URL}
        fileName="a.docx"
        onUnavailable={vi.fn()}
      />,
    );

    expect(screen.getByText("Đang mở tài liệu…")).toBeTruthy();

    act(() => {
      screen.getByTitle("a.docx").dispatchEvent(new Event("load"));
    });

    expect(screen.queryByText("Đang mở tài liệu…")).toBeNull();
  });

  it("đổi sang file khác thì tính lại hạn chờ từ đầu", () => {
    const onUnavailable = vi.fn();
    const { rerender } = render(
      <OfficeOnlinePreview
        url={PUBLIC_URL}
        fileName="a.docx"
        onUnavailable={onUnavailable}
      />,
    );

    act(() => {
      screen.getByTitle("a.docx").dispatchEvent(new Event("load"));
    });
    advance(60_000);
    expect(onUnavailable).not.toHaveBeenCalled();

    // Sang file thứ hai: trạng thái "đã load" của file trước không được tính.
    rerender(
      <OfficeOnlinePreview
        url="https://files.example.com/khac.xlsx"
        fileName="khac.xlsx"
        onUnavailable={onUnavailable}
      />,
    );

    advance(21_000);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });
});
