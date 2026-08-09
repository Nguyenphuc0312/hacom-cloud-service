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
    }
  >,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("../../hooks", () => ({
  useBatchThumbnailUrl: () => ({
    urls: batchState.current,
    isLoading: false,
    refresh: vi.fn(),
  }),
  usePreviewUrl: () => ({
    url: null,
    fetchUrl: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock("../../hooks/useInViewport", () => ({
  useInViewport: () => true,
}));

vi.mock("../../utils/imagePerformanceTelemetry", () => ({
  getRedactedResourceTiming: () => ({}),
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
});
