import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImagePreviewModal } from "./ImagePreviewModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../common/Avatar", () => ({
  Avatar: () => null,
}));

vi.mock("../common/SafeImage", () => ({
  SafeImage: ({ src, alt }: { src: string; alt?: string }) => (
    <img src={src} alt={alt ?? ""} />
  ),
}));

beforeEach(() => {
  document.body.style.overflow = "";
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("ImagePreviewModal capability gates", () => {
  it("does not render a direct image viewer when preview is explicitly blocked", () => {
    render(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageUrl="https://storage.example/blocked.jpg"
        canPreview={false}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.querySelector("img")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("does not fall through to an allowed gallery neighbor when the selected image is blocked", () => {
    render(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        images={[
          { url: "https://storage.example/allowed-gallery.jpg" },
          {
            url: "https://storage.example/blocked-gallery.jpg",
            canPreview: false,
          },
        ]}
        initialIndex={1}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.querySelector("img")).toBeNull();
  });

  it("disables download when the current image cannot be downloaded", () => {
    render(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageUrl="https://storage.example/preview-only.jpg"
        canDownload={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "profile:imagePreview.download" }),
    ).toBeDisabled();
  });
});
