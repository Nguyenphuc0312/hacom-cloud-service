import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, type Attachment } from "../../types";
import { ImageMessage } from "./ImageMessage";

const batchState = vi.hoisted(() => ({
  current: {} as Record<
    string,
    {
      fileId: string;
      url: string | null;
      status: "ready" | "processing";
      isRetryable?: boolean;
      placeholder?: string | null;
    }
  >,
}));

const hookState = vi.hoisted(() => ({
  batch: vi.fn(),
  fetchPreview: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      key === "chat:image.notPreviewable"
        ? key
        : options?.defaultValue ?? key,
  }),
}));

vi.mock("../../hooks", () => ({
  useBatchThumbnailUrl: (...args: unknown[]) => {
    hookState.batch(...args);
    return {
      urls: batchState.current,
      isLoading: false,
      refresh: vi.fn(),
    };
  },
  usePreviewUrl: () => ({
    url: null,
    fetchUrl: hookState.fetchPreview,
  }),
}));

vi.mock("../../hooks/useInViewport", () => ({
  useInViewport: () => true,
}));

vi.mock("../../utils/imagePerformanceTelemetry", () => ({
  afterNextPaint: (callback: () => void) => {
    callback();
    return vi.fn();
  },
  getRedactedResourceTiming: () => ({}),
  markImagePerformanceMilestone: vi.fn(),
  reportImagePerformance: vi.fn(),
}));

afterEach(cleanup);

const attachment = {
  id: "image-1",
  type: FileType.IMAGE,
  fileName: "large.jpg",
  fileSize: 16 * 1024 * 1024,
  width: 4032,
  height: 3024,
  url: "https://storage.example/original-large.jpg",
} as Attachment;

describe("ImageMessage large-image timeline source", () => {
  beforeEach(() => {
    batchState.current = {};
    hookState.batch.mockClear();
    hookState.fetchPreview.mockReset();
    hookState.fetchPreview.mockResolvedValue(null);
  });

  it("renders the ready thumbnail behind the explicit HD control", () => {
    batchState.current = {
      "image-1": {
        fileId: "image-1",
        url: "https://storage.example/variants/thumbnail.jpg",
        status: "ready",
      },
    };

    render(
      <ImageMessage
        conversationId="conversation-1"
        attachment={attachment}
        isOwn
      />,
    );

    expect(screen.getByRole("img", { name: "large.jpg" })).toHaveAttribute(
      "src",
      "https://storage.example/variants/thumbnail.jpg",
    );
    expect(screen.getByRole("button", { name: "Tải ảnh HD" })).toBeVisible();
  });

  it("never falls back to the persisted original while the thumbnail is processing", () => {
    batchState.current = {
      "image-1": {
        fileId: "image-1",
        url: null,
        status: "processing",
        isRetryable: true,
      },
    };

    render(
      <ImageMessage
        conversationId="conversation-1"
        attachment={attachment}
        isOwn
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Đang xử lý...")).toBeVisible();
  });

  it("paints an inline placeholder while processing without requesting the original", () => {
    const placeholder = "data:image/jpeg;base64,cGxhY2Vob2xkZXI=";
    batchState.current = {
      "image-1": {
        fileId: "image-1",
        url: null,
        status: "processing",
        isRetryable: true,
        placeholder,
      },
    };

    const { container } = render(
      <ImageMessage
        conversationId="conversation-1"
        attachment={attachment}
        isOwn
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector('[style*="data:image/jpeg;base64"]')).toBeTruthy();
    expect(container.innerHTML).not.toContain(attachment.url);
  });

  it("disables the HD download action when download is explicitly blocked", () => {
    batchState.current = {
      "image-1": {
        fileId: "image-1",
        url: "https://storage.example/variants/thumbnail.jpg",
        status: "ready",
      },
    };

    render(
      <ImageMessage
        conversationId="conversation-1"
        attachment={{ ...attachment, canDownload: false }}
        isOwn
      />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not request, render, or open an explicitly blocked image", () => {
    const batchThumbnail = "https://storage.example/variants/blocked-thumbnail.jpg";
    const storedThumbnail = "https://storage.example/variants/stored-thumbnail.jpg";
    batchState.current = {
      "image-1": {
        fileId: "image-1",
        url: batchThumbnail,
        status: "ready",
      },
    };
    const onClick = vi.fn();
    const blockedAttachment = {
      ...attachment,
      canPreview: false,
      thumbnailUrl: storedThumbnail,
      placeholder: "data:image/jpeg;base64,cGxhY2Vob2xkZXI=",
    } as Attachment;

    const { container } = render(
      <ImageMessage
        conversationId="conversation-1"
        attachment={blockedAttachment}
        isOwn
        onClick={onClick}
      />,
    );

    expect(hookState.batch).toHaveBeenLastCalledWith(
      "conversation-1",
      [],
      { autoFetch: false },
    );
    expect(hookState.fetchPreview).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("chat:image.notPreviewable")).toBeVisible();
    expect(container.innerHTML).not.toContain(batchThumbnail);
    expect(container.innerHTML).not.toContain(storedThumbnail);
    expect(container.innerHTML).not.toContain(attachment.url);
    expect(onClick).not.toHaveBeenCalled();
  });

});
