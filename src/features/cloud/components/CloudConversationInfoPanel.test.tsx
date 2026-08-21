import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("separates resources into Hacom Chat conversation sections", () => {
    const onClose = vi.fn();
    const { container } = render(
      <CloudConversationInfoPanel
        items={[item, textItem, linkItem, imageItem, audioItem]}
        trashItems={[trashItem]}
        quota={quota}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("My Documents")).not.toBeNull();
    expect(screen.getByText("Ảnh", { exact: true })).not.toBeNull();
    expect(screen.getByText("Video", { exact: true })).not.toBeNull();
    expect(screen.queryByText(/^Trống$|^Free$/)).toBeNull();
    expect(screen.queryByText(/Request more storage|Yêu cầu tăng dung lượng/)).toBeNull();

    expect(screen.getByRole("img", { name: "photo.png" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /File/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Link/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Ảnh/Video" })).not.toBeNull();
    expect(screen.queryByText(textItem.content!)).toBeNull();
    expect(screen.getByRole("button", { name: /Thùng rác/ })).not.toBeNull();
    expect(screen.queryByText("voice-recording.webm")).toBeNull();

    expect(screen.getByText("report.pdf")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    expect(screen.queryByText("report.pdf")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    expect(screen.getByText("report.pdf")).not.toBeNull();
    expect(screen.getByText("hacom.vn")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Link/ }));
    expect(screen.queryByText("hacom.vn")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Link/ }));
    expect(screen.getByText("hacom.vn")).not.toBeNull();
    expect(screen.queryByText("Ghi chú riêng")).toBeNull();
    expect(container.querySelectorAll("details")).toHaveLength(0);

    expect(screen.queryByRole("button", { name: "Chọn" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /close|đóng/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* quota request UI is intentionally not part of the My Documents drawer */
  it.skip("shows the quota request action only when Cloud marks the quota as near limit", () => {
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
        name: /Request more storage|Yêu cầu cấp thêm dung lượng/i,
      }),
    );
    expect(onRequestQuota).toHaveBeenCalledTimes(1);
  });

  it("shrinks a media drag selection when the pointer moves back", () => {
    vi.useFakeTimers();
    try {
      const mediaItems = Array.from({ length: 4 }, (_, index): CloudItem => ({
        ...imageItem,
        id: `image-${index + 1}`,
        title: `photo-${index + 1}.png`,
        accessUrl: `https://cloud.test/photo-${index + 1}.png`,
      }));

      const { container } = render(<CloudResourcesPreview items={mediaItems} />);
      fireEvent.click(within(container).getAllByRole("button", { name: "Xem tất cả" })[0]);

      const gallery = within(container).getAllByRole("region")[0];
      const mediaButtons = mediaItems.map((media) =>
        within(gallery).getByRole("button", { name: media.title ?? "" }),
      );

      fireEvent.pointerDown(mediaButtons[0], { button: 0, pointerType: "touch" });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.pointerEnter(mediaButtons[2], { pointerType: "touch" });
      expect(screen.getByText("3 hình ảnh")).not.toBeNull();

      fireEvent.pointerEnter(mediaButtons[1], { pointerType: "touch" });
      expect(screen.getByText("2 hình ảnh")).not.toBeNull();
      fireEvent.pointerUp(mediaButtons[1], { pointerType: "touch" });
    } finally {
      vi.useRealTimers();
    }
  });
});
