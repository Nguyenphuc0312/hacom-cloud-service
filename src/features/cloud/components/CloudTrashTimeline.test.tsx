import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudItem } from "../types";
import { CloudTrashTimeline } from "./CloudTrashTimeline";

const trashedTextItem: CloudItem = {
  id: "trash-text-1",
  type: "text",
  status: "trashed",
  title: "Ghi chú kiểm tra",
  content: "Nội dung kiểm tra preview trong Trash",
  sizeBytes: 40,
  createdAt: "2026-08-07T00:00:00Z",
  updatedAt: "2026-08-07T00:00:00Z",
  deletedAt: "2026-08-07T00:01:00Z",
  purgeAfter: "2026-08-08T00:01:00Z",
};

describe("CloudTrashTimeline", () => {
  it("keeps preview and download available for a trashed item before URL hydration", () => {
    const onPreview = vi.fn();
    const onDownload = vi.fn();

    render(
      <CloudTrashTimeline
        items={[trashedTextItem]}
        isLoading={false}
        isLoadingMore={false}
        hasMore={false}
        isMutating={false}
        onRestore={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
        onPreview={onPreview}
        onDownload={onDownload}
        onLoadMore={vi.fn()}
      />,
    );

    const preview = screen.getByRole("button", {
      name: /preview|xem trước/i,
    });
    const download = screen.getByRole("button", {
      name: /download|tải/i,
    });

    fireEvent.click(preview);
    fireEvent.click(download);

    expect(onPreview).toHaveBeenCalledWith(trashedTextItem);
    expect(onDownload).toHaveBeenCalledWith(trashedTextItem);
  });
});
