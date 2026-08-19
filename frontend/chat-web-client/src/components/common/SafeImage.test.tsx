import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SafeImage } from "./SafeImage";

afterEach(() => cleanup());

describe("SafeImage", () => {
  it("renders fallback when src is null", () => {
    render(
      <SafeImage
        src={null}
        alt="broken"
        fallback={<div data-testid="fallback">Fallback</div>}
      />,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders fallback after image error", () => {
    render(
      <SafeImage
        src="https://cdn.example/missing.jpg"
        alt="avatar"
        fallback={<div data-testid="fallback">Fallback</div>}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "avatar" }));

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
  });

  it("does not retry the same failed source more than once", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <SafeImage
        src="https://cdn.example/expired.jpg"
        alt="signed"
        fallback={<div data-testid="fallback">Fallback</div>}
        retryOnSignedUrlExpired
        onRetrySource={retry}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "signed" }));
    rerender(
      <SafeImage
        src="https://cdn.example/expired.jpg"
        alt="signed"
        fallback={<div data-testid="fallback">Fallback</div>}
        retryOnSignedUrlExpired
        onRetrySource={retry}
      />,
    );

    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("img", { name: "signed" })).not.toBeInTheDocument();
  });

  it("hides the loading fallback after load", () => {
    render(
      <SafeImage
        src="https://cdn.example/ok.jpg"
        alt="loaded"
        fallback={<div>Fallback</div>}
        loadingFallback={<div data-testid="loading">Loading</div>}
      />,
    );

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    fireEvent.load(screen.getByRole("img", { name: "loaded" }));
    expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
  });

  it("keeps painting the loaded image while a new src decodes (no blank frame)", () => {
    const { rerender } = render(
      <SafeImage src="https://cdn.example/a.jpg" alt="a" fallback={<div>Fallback</div>} />,
    );
    fireEvent.load(screen.getByRole("img", { name: "a" }));

    // Switch to a new src: the <img> must not blank — it should still point at
    // the previously-loaded image until the incoming one is ready.
    rerender(
      <SafeImage src="https://cdn.example/b.jpg" alt="b" fallback={<div>Fallback</div>} />,
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.example/a.jpg",
    );
  });
});
