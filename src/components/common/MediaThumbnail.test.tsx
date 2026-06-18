import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MediaThumbnail } from "./MediaThumbnail";

afterEach(() => cleanup());

describe("MediaThumbnail", () => {
  it("renders image thumbnail when available", () => {
    render(
      <MediaThumbnail
        attachment={{ id: "img-1", fileName: "photo.jpg", mimeType: "image/jpeg" }}
        src="https://cdn.example/photo-thumb.jpg"
        alt="Photo"
      />,
    );

    expect(screen.getByRole("img", { name: "Photo" })).toBeInTheDocument();
  });

  it("falls back when image thumbnail fails", () => {
    render(
      <MediaThumbnail
        attachment={{ id: "img-1", fileName: "photo.jpg", mimeType: "image/jpeg" }}
        src="https://cdn.example/missing.jpg"
        alt="Photo"
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Photo" }));

    expect(screen.getByText("Hinh anh")).toBeInTheDocument();
  });

  it("renders video thumbnail with a play overlay", () => {
    render(
      <MediaThumbnail
        attachment={{ id: "vid-1", fileName: "clip.mp4", mimeType: "video/mp4" }}
        src="https://cdn.example/clip-thumb.jpg"
        alt="Clip"
      />,
    );

    expect(screen.getByRole("img", { name: "Clip" })).toBeInTheDocument();
  });

  it("renders video fallback when thumbnail is missing", () => {
    render(
      <MediaThumbnail
        attachment={{ id: "vid-1", fileName: "clip.mp4", mimeType: "video/mp4" }}
      />,
    );

    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders video fallback when thumbnail fails", () => {
    render(
      <MediaThumbnail
        attachment={{ id: "vid-1", fileName: "clip.mp4", mimeType: "video/mp4" }}
        src="https://cdn.example/clip-missing.jpg"
        alt="Clip"
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Clip" }));

    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
  });

  it("renders file fallback for documents", () => {
    render(
      <MediaThumbnail
        attachment={{ id: "pdf-1", fileName: "report.pdf", mimeType: "application/pdf", fileSize: 1024 }}
      />,
    );

    expect(screen.getByTitle("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("1.0 KB")).toBeInTheDocument();
  });

  it("detects video by extension when mimeType is missing", () => {
    render(<MediaThumbnail attachment={{ fileName: "recording.mp4" }} />);

    expect(screen.getByText("recording.mp4")).toBeInTheDocument();
  });

  it("does not crash when attachment id is missing", () => {
    render(<MediaThumbnail attachment={{ fileName: "unknown.bin" }} />);

    expect(screen.getByTitle("unknown.bin")).toBeInTheDocument();
  });
});
