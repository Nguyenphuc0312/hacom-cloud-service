import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudItem, CloudQuota } from "../types";
import { CloudConversationInfoPanel } from "./CloudConversationInfoPanel";

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
  it("separates links from messages and keeps Trash as a top-level view", () => {
    const onClose = vi.fn();
    const onViewModeChange = vi.fn();

    const { container } = render(
      <CloudConversationInfoPanel
        items={[item, textItem, linkItem, imageItem, audioItem]}
        trashItems={[trashItem]}
        quota={quota}
        viewMode="active"
        onViewModeChange={onViewModeChange}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("My Documents")).not.toBeNull();
    expect(screen.getByText("Ảnh", { exact: true })).not.toBeNull();
    expect(screen.getByText("Video", { exact: true })).not.toBeNull();
    expect(screen.queryByText(/^Trống$|^Free$/)).toBeNull();
    expect(screen.queryByText(/Request more storage|Yêu cầu tăng dung lượng/)).toBeNull();

    expect(screen.getByText("Kho lưu trữ")).not.toBeNull();
    expect(screen.getByRole("img", { name: "photo.png" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /file/i }));
    expect(screen.getByText("report.pdf")).not.toBeNull();
    expect(screen.queryByText("voice-recording.webm")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /link/i }));
    expect(screen.getByText("Hacom")).not.toBeNull();
    expect(screen.queryByText("Ghi chú riêng")).toBeNull();
    expect(container.querySelectorAll("details")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /trash|thùng rác/i }));
    expect(onViewModeChange).toHaveBeenCalledWith("trash");

    fireEvent.click(screen.getByRole("button", { name: /close|đóng/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
