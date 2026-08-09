import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudAsset, CloudQuota } from "../api/cloudApi";
import { CloudManageView } from "./CloudManagePage";

vi.mock("../../../hooks/useBatchThumbnailUrl", () => ({
  useBatchThumbnailUrl: (_conversationId: string | undefined, fileIds: string[]) => ({
    urls: Object.fromEntries(fileIds.map((fileId) => [fileId, {
      fileId,
      url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      status: "ready",
    }])),
    isLoading: false,
    error: null,
    refresh: async () => {},
  }),
}));

afterEach(cleanup);

const quota: CloudQuota = {
  limitBytes: "10737418240",
  usedBytes: "240947",
  reservedBytes: "0",
  availableBytes: "10737177293",
  usedByType: {
    image: "0",
    video: "0",
    file: "38195",
    other: "202752",
  },
};

const pdfAsset: CloudAsset = {
  id: "asset-pdf",
  originalFilename: "Bao_cao_thang_08_ban_chinh_thuc_voi_ten_rat_dai.pdf",
  mimeType: "application/pdf",
  mediaType: "file",
  sizeBytes: "38195",
  status: "available",
  createdAt: "2026-08-09T01:05:00.000Z",
  deletedAt: null,
  purgeAfter: null,
  attachmentId: "attachment-pdf",
  messageId: "message-pdf",
  availability: "available",
  consistencyErrorCode: null,
};

const renderView = () => render(
  <MemoryRouter>
    <CloudManageView quota={quota} assets={[pdfAsset]} onChanged={vi.fn()} />
  </MemoryRouter>,
);

describe("CloudManageView", () => {
  it("keeps a PDF row compact and constrains the file visual", () => {
    const { container } = renderView();
    const row = screen.getByRole("row", { name: /Bao_cao_thang_08/ });
    const thumbnail = row.querySelector("span[aria-hidden='true']");
    const pdfIcon = row.querySelector("svg[aria-label='PDF']");

    expect(row.classList.contains("h-[68px]")).toBe(true);
    expect(thumbnail?.classList.contains("h-11")).toBe(true);
    expect(thumbnail?.classList.contains("w-11")).toBe(true);
    expect(pdfIcon?.classList.contains("h-7")).toBe(true);
    expect(pdfIcon?.classList.contains("h-full")).toBe(false);
    expect(container.querySelector("table")?.classList.contains("table-fixed")).toBe(true);
    expect(screen.getByTitle(pdfAsset.originalFilename).classList.contains("truncate")).toBe(true);
  });

  it("exposes compact selection and segmented view controls", () => {
    const { container } = renderView();
    const listButton = screen.getByRole("button", { name: "Chuyển sang dạng danh sách" });
    const gridButton = screen.getByRole("button", { name: "Chuyển sang dạng lưới" });

    expect(listButton.getAttribute("aria-pressed")).toBe("true");
    expect(gridButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn" }));
    expect(screen.getByText(/Đã chọn 1 mục/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: `Chọn ${pdfAsset.originalFilename}` })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    const restoredGridButton = screen.getByRole("button", { name: "Chuyển sang dạng lưới" });
    fireEvent.click(restoredGridButton);
    expect(restoredGridButton.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("button input")).toBeNull();
  });

  it("keeps the page shell visible while loading and on error", () => {
    const { rerender } = render(
      <MemoryRouter>
        <CloudManageView quota={null} assets={[]} onChanged={vi.fn()} loading />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Hacom Cloud" })).toBeTruthy();
    expect(screen.getByLabelText("Đang tải danh sách tệp")).toBeTruthy();

    rerender(
      <MemoryRouter>
        <CloudManageView quota={null} assets={[]} onChanged={vi.fn()} error="failed" onRetry={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Không thể tải danh sách tệp")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Thử lại" })).toHaveLength(2);
  });

  it("renders bounded image/video thumbnails and a 120-file list without changing row density", () => {
    const imageAsset: CloudAsset = {
      ...pdfAsset,
      id: "asset-image",
      originalFilename: "portrait.png",
      mimeType: "image/png",
      mediaType: "image",
      attachmentId: "attachment-image",
    };
    const videoAsset: CloudAsset = {
      ...pdfAsset,
      id: "asset-video",
      originalFilename: "landscape.mp4",
      mimeType: "video/mp4",
      mediaType: "video",
      attachmentId: "attachment-video",
    };
    const { container, rerender } = render(
      <MemoryRouter>
        <CloudManageView quota={quota} assets={[imageAsset, videoAsset]} onChanged={vi.fn()} />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll("tbody img")).toHaveLength(2);
    expect(container.querySelector("tbody img")?.classList.contains("h-full")).toBe(true);
    expect(container.querySelector("tbody .lucide-play")).toBeTruthy();

    const bulkAssets = Array.from({ length: 120 }, (_, index): CloudAsset => ({
      ...pdfAsset,
      id: `asset-${index}`,
      originalFilename: `Bao_cao_${String(index).padStart(3, "0")}.pdf`,
      attachmentId: `attachment-${index}`,
      messageId: `message-${index}`,
    }));
    rerender(
      <MemoryRouter>
        <CloudManageView quota={quota} assets={bulkAssets} onChanged={vi.fn()} />
      </MemoryRouter>,
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(120);
    expect(Array.from(rows).every((row) => row.classList.contains("h-[68px]"))).toBe(true);
  });
});
