/**
 * Trạng thái "file đã tải" — thứ quyết định nhãn trên thẻ file, nên sai là user
 * thấy sai ngay. Test bám đúng các đường dễ vỡ: dữ liệu hỏng, quota đầy, trần
 * bản ghi, và pub/sub giữa nhiều thẻ cùng một file.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDownloadedFiles,
  isFileDownloaded,
  markFileDownloaded,
  subscribeDownloadedFiles,
} from "./downloadedFiles";

const STORAGE_KEY = "chat.downloadedFiles";

beforeEach(() => {
  localStorage.clear();
  clearDownloadedFiles();
  vi.restoreAllMocks();
});

describe("downloadedFiles", () => {
  it("nhớ file đã tải và quên file chưa tải", () => {
    expect(isFileDownloaded("att-1")).toBe(false);
    markFileDownloaded("att-1");
    expect(isFileDownloaded("att-1")).toBe(true);
    expect(isFileDownloaded("att-2")).toBe(false);
  });

  it("bỏ qua id rỗng/undefined thay vì tạo bản ghi rác", () => {
    markFileDownloaded(undefined);
    markFileDownloaded("");
    expect(isFileDownloaded(undefined)).toBe(false);
    expect(isFileDownloaded("")).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("{}");
  });

  it("localStorage hỏng thì coi như chưa có gì, không ném lỗi", () => {
    // Dữ liệu bị sửa tay / phiên bản cũ để lại kiểu khác.
    localStorage.setItem(STORAGE_KEY, "[not json at all");
    clearDownloadedFiles();
    localStorage.setItem(STORAGE_KEY, "[1,2,3]");
    expect(() => isFileDownloaded("att-1")).not.toThrow();
    expect(isFileDownloaded("att-1")).toBe(false);
  });

  it("quota đầy vẫn giữ đúng trạng thái trong phiên hiện tại", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => markFileDownloaded("att-1")).not.toThrow();
    // Ghi đĩa hỏng nhưng cache RAM vẫn đúng → UI không nhảy loạn.
    expect(isFileDownloaded("att-1")).toBe(true);
  });

  it("cắt bớt khi vượt trần, giữ lại bản ghi mới nhất", () => {
    // Thời gian giả: các bản ghi cùng một mili-giây thì không sắp xếp được theo
    // độ mới, mà việc cắt bớt lại dựa đúng vào thứ tự đó.
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 10));

    for (let i = 0; i < 520; i++) markFileDownloaded(`att-${i}`);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(Object.keys(stored).length).toBe(500);
    // Mới nhất còn, cũ nhất bị loại.
    expect(isFileDownloaded("att-519")).toBe(true);
    expect(isFileDownloaded("att-0")).toBe(false);
  });

  it("báo cho người đăng ký khi trạng thái đổi", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDownloadedFiles(listener);

    markFileDownloaded("att-1");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    markFileDownloaded("att-2");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
