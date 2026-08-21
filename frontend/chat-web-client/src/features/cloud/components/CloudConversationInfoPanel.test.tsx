import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudItem, CloudQuota } from "../types";
import { CloudConversationInfoPanel } from "./CloudConversationInfoPanel";
import { CloudResourcesPreview } from "./CloudResourcesPreview";

const item: CloudItem = {
  id: "item-1",
  type: "file",
  status: "ready",
  title: "report.pdf",
  sizeBytes: 2_000_000,
  createdAt: "2026-08-05T00:00:00Z",
  updatedAt: "2026-08-05T00:00:00Z",
};

const trashItem: CloudItem = {
  ...item,
  id: "trash-1",
  status: "trashed",
  title: "old-report.pdf",
  purgeAfter: "2099-08-05T00:00:00Z",
};

const textItem: CloudItem = {
  ...item,
  id: "text-1",
  type: "text",
  title: undefined,
  content: "Ghi chú riêng",
  sizeBytes: 14,
};

const linkItem: CloudItem = {
  ...item,
  id: "link-1",
  type: "link",
  title: "Hacom",
  url: "https://hacom.vn",
  sizeBytes: 16,
};

const imageItem: CloudItem = {
  ...item,
  id: "image-1",
  type: "image",
  title: "photo.png",
  accessUrl: "http://localhost:5100/cloud-object/photo.png?signed=1",
  contentType: "image/png",
};

const audioItem: CloudItem = {
  ...item,
  id: "audio-1",
  type: "audio",
  title: "voice-recording.webm",
  accessUrl: "http://localhost:5100/cloud-object/voice.webm?signed=1",
  contentType: "audio/webm",
};

const quota: CloudQuota = {
  limitBytes: 5_000_000_000,
  usedBytes: 2_000_000,
  activeBytes: 2_000_000,
  trashBytes: 0,
  reservedBytes: 0,
  availableBytes: 4_998_000_000,
  updatedAt: "2026-08-05T00:00:00Z",
};

describe("CloudConversationInfoPanel", () => {
  it("uses the Hacom Cloud sidebar layout and keeps Trash actions available", () => {
    const onClose = vi.fn();
    const onRestoreTrashItem = vi.fn(async () => undefined);
    const onDeleteTrashItem = vi.fn();

    const { container } = render(
      <CloudConversationInfoPanel
        items={[item, textItem, linkItem, imageItem, audioItem]}
        trashItems={[trashItem]}
        quota={quota}
        quotaRequest={null}
        showQuotaRequest={false}
        onRequestQuota={vi.fn()}
        onRestoreTrashItem={onRestoreTrashItem}
        onDeleteTrashItem={onDeleteTrashItem}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("My Documents")).not.toBeNull();
    expect(screen.getByText("Ảnh/Video", { exact: true })).not.toBeNull();
    expect(screen.queryByText(/^Trống$|^Free$/)).toBeNull();
    expect(screen.queryByText(/Request more storage|Yêu cầu tăng dung lượng/)).toBeNull();

    expect(screen.getByRole("button", { name: "Ảnh/Video" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "File" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Link" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "photo.png" })).not.toBeNull();
    expect(screen.getByText("report.pdf")).not.toBeNull();
    expect(screen.queryByText("voice-recording.webm")).toBeNull();

    expect(screen.getByText("Hacom")).not.toBeNull();
    expect(screen.queryByText("Ghi chú riêng")).toBeNull();
    expect(screen.queryByRole("button", { name: "Chọn" })).toBeNull();
    expect(container.querySelectorAll("details")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Khôi phục old-report.pdf/i }));
    expect(onRestoreTrashItem).toHaveBeenCalledWith("trash-1");
    fireEvent.click(screen.getByRole("button", { name: /Xóa vĩnh viễn old-report.pdf/i }));
    expect(onDeleteTrashItem).toHaveBeenCalledWith(trashItem);

    fireEvent.click(screen.getByRole("button", { name: /close|đóng/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the quota request action only when Cloud marks the quota as near limit", () => {
    const onRequestQuota = vi.fn();

    render(
      <CloudConversationInfoPanel
        items={[]}
        trashItems={[]}
        quota={quota}
        quotaRequest={null}
        showQuotaRequest
        onRequestQuota={onRequestQuota}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Request more storage|Yêu cầu tăng dung lượng/i,
      }),
    );
    expect(onRequestQuota).toHaveBeenCalledTimes(1);
  });

  it("opens resource selection from the gallery Chọn action", () => {
    cleanup();
    const { getAllByRole, getByRole, getByText } = render(<CloudResourcesPreview items={[imageItem]} />);

    fireEvent.click(getByRole("button", { name: "Xem tất cả" }));
    fireEvent.click(getByRole("button", { name: "Chọn" }));

    expect(getAllByRole("button", { name: "Hủy" })).toHaveLength(2);
    expect(getByText("0 đã chọn")).not.toBeNull();

    const photoButtons = getAllByRole("button", { name: "photo.png" });
    fireEvent.click(photoButtons[photoButtons.length - 1]);
    expect(getByText("1 đã chọn")).not.toBeNull();
  });

  it("does not expose selection in the Trash gallery", () => {
    cleanup();
    const trashItems = [
      trashItem,
      { ...trashItem, id: "trash-2", title: "old-report-2.pdf" },
      { ...trashItem, id: "trash-3", title: "old-report-3.pdf" },
      { ...trashItem, id: "trash-4", title: "old-report-4.pdf" },
    ];

    const { getByRole, queryByRole } = render(
      <CloudResourcesPreview items={[]} trashItems={trashItems} />,
    );

    fireEvent.click(getByRole("button", { name: "Xem tất cả" }));
    expect(queryByRole("button", { name: "Chọn" })).toBeNull();
  });
});
