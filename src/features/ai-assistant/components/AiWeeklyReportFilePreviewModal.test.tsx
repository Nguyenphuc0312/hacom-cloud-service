import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AiWeeklyReportFilePreviewModal } from "./AiWeeklyReportFilePreviewModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Modal render qua portal vào document.body → không tự dọn giữa các case,
// DOM cộng dồn làm getByText thấy nhiều phần tử. Dọn tay sau mỗi test.
afterEach(cleanup);

const renderPreview = (mimeType: string, filename: string) =>
  render(
    <AiWeeklyReportFilePreviewModal
      preview={{ blobUrl: "blob:fake-url", filename, mimeType }}
      onClose={() => {}}
    />,
  );

describe("AiWeeklyReportFilePreviewModal — chặn HTML chạy trong origin app", () => {
  // mimeType đến từ Content-Type của AI service; blob: kế thừa origin của app.
  // Nhúng text/html vào iframe KHÔNG sandbox = XSS đọc được token.
  it.each([
    ["text/html", "bao-cao.html"],
    ["text/html; charset=utf-8", "bao-cao.html"],
    ["application/xhtml+xml", "bao-cao.xhtml"],
  ])("KHÔNG xem inline loại nguy hiểm: %s", (mimeType, filename) => {
    renderPreview(mimeType, filename);
    expect(document.body.querySelector("iframe")).toBeNull();
    expect(screen.getByText("weeklyReport.previewUnsupported")).toBeTruthy();
  });

  it.each([
    ["application/pdf", "bao-cao.pdf"],
    ["text/plain", "ghi-chu.txt"],
    ["text/plain; charset=utf-8", "ghi-chu.txt"],
    ["text/csv", "so-lieu.csv"],
  ])("vẫn xem inline được loại an toàn: %s", (mimeType, filename) => {
    renderPreview(mimeType, filename);
    expect(document.body.querySelector("iframe")).not.toBeNull();
  });

  it("mọi iframe đều có sandbox rỗng (không allow-same-origin)", () => {
    renderPreview("application/pdf", "a.pdf");
    const iframe = document.body.querySelector("iframe");
    expect(iframe?.getAttribute("sandbox")).toBe("");
  });

  // SVG có thể chứa <script>, nhưng trình duyệt KHÔNG chạy script của SVG khi nó
  // được nạp qua <img> (chỉ chạy khi nhúng inline hoặc qua iframe/object).
  // Chốt lại đường render này để sau không ai đổi SVG sang iframe.
  it("SVG render qua <img> (không chạy script), không bao giờ qua iframe", () => {
    renderPreview("image/svg+xml", "bao-cao.svg");
    expect(document.body.querySelector("iframe")).toBeNull();
    expect(document.body.querySelector("img")).not.toBeNull();
  });

  it("ảnh render bằng <img>, không phải iframe", () => {
    renderPreview("image/png", "anh.png");
    expect(document.body.querySelector("iframe")).toBeNull();
    expect(document.body.querySelector("img")).not.toBeNull();
  });
});
