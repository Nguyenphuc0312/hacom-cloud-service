/**
 * Hàm này quyết định có giao file cho Microsoft Office Online render hay không.
 * Nhận nhầm URL nội bộ là "công khai" → user nhìn trang trắng 20 giây rồi mới
 * rơi về bản dự phòng, nên các dải nội bộ phải chặn đúng.
 */

import { describe, expect, it } from "vitest";
import { isPubliclyFetchableUrl } from "./publicUrl";

describe("isPubliclyFetchableUrl", () => {
  it("chấp nhận URL https công khai", () => {
    expect(
      isPubliclyFetchableUrl("https://chat.hacomholdings.com.vn/files/a.docx"),
    ).toBe(true);
  });

  it("chấp nhận URL ký có query dài", () => {
    expect(
      isPubliclyFetchableUrl(
        "https://storage.example.com/o/abc.xlsx?X-Amz-Signature=deadbeef&X-Amz-Expires=3600",
      ),
    ).toBe(true);
  });

  it("từ chối localhost và loopback", () => {
    for (const url of [
      "http://localhost:5100/f.docx",
      "http://127.0.0.1:5100/f.docx",
      "http://0.0.0.0:8080/f.docx",
      "http://app.localhost/f.docx",
      "http://myserver.local/f.docx",
    ]) {
      expect(isPubliclyFetchableUrl(url), url).toBe(false);
    }
  });

  it("từ chối dải IP nội bộ RFC1918", () => {
    for (const url of [
      "http://10.0.0.5/f.docx",
      "http://192.168.1.10/f.docx",
      "http://172.16.0.1/f.docx",
      "http://172.31.255.254/f.docx",
    ]) {
      expect(isPubliclyFetchableUrl(url), url).toBe(false);
    }
  });

  it("KHÔNG nhầm 172.x ngoài dải riêng thành nội bộ", () => {
    // 172.15 và 172.32 nằm ngoài 172.16–172.31 → vẫn là địa chỉ công khai.
    expect(isPubliclyFetchableUrl("http://172.15.0.1/f.docx")).toBe(true);
    expect(isPubliclyFetchableUrl("http://172.32.0.1/f.docx")).toBe(true);
  });

  it("từ chối giao thức không phải http(s) và chuỗi rác", () => {
    for (const url of [
      "blob:https://example.com/abc",
      "data:text/plain;base64,AAAA",
      "file:///C:/tmp/a.docx",
      "/files/a.docx",
      "",
      "khong-phai-url",
    ]) {
      expect(isPubliclyFetchableUrl(url), url).toBe(false);
    }
  });
});
