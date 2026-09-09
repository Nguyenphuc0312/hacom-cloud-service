/**
 * PdfJsViewer lifecycle tests. PDF.js itself is mocked because jsdom lacks a
 * worker and a 2D canvas; these tests lock the source-selection and teardown
 * behaviour of the React viewer.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pdfState = vi.hoisted(() => ({
  renderCalls: [] as number[],
  getDocumentArgs: [] as Array<Record<string, unknown>>,
  loadingDestroy: vi.fn(),
  documentDestroy: vi.fn(),
  renderError: null as unknown,
}));

const loggerState = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  logger: { warn: loggerState.warn },
}));

vi.mock("pdfjs-dist", () => {
  const makePage = (pageNumber: number) => ({
    getViewport: () => ({ width: 600, height: 800 }),
    render: () => {
      pdfState.renderCalls.push(pageNumber);
      return {
        promise: pdfState.renderError
          ? Promise.reject(pdfState.renderError)
          : Promise.resolve(),
        cancel: () => undefined,
      };
    },
  });
  return {
    GlobalWorkerOptions: { workerPort: null },
    getDocument: (args: Record<string, unknown>) => {
      pdfState.getDocumentArgs.push(args);
      return {
        promise: Promise.resolve({
          numPages: 3,
          getPage: (pageNumber: number) => Promise.resolve(makePage(pageNumber)),
          destroy: pdfState.documentDestroy,
        }),
        destroy: pdfState.loadingDestroy,
      };
    },
  };
});

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?worker", () => ({
  default: class {
    terminate() {}
  },
}));

beforeAll(() => {
  class FakeIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }

    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}) as unknown as CanvasRenderingContext2D,
  ) as unknown as HTMLCanvasElement["getContext"];
});

const { PdfJsViewer } = await import("./PdfJsViewer");

beforeEach(() => {
  pdfState.renderCalls.length = 0;
  pdfState.getDocumentArgs.length = 0;
  pdfState.loadingDestroy.mockClear();
  pdfState.documentDestroy.mockClear();
  pdfState.renderError = null;
  loggerState.warn.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const waitForPdf = async (fileName: string) => {
  await screen.findByLabelText(`Xem PDF ${fileName}`);
  await waitFor(() => expect(pdfState.getDocumentArgs).toHaveLength(1));
};

describe("PdfJsViewer", () => {
  it("uses a bounded whole-file fallback when the server ignores Range", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }) as Response),
    );

    render(<PdfJsViewer url="https://example.test/a.pdf" fileName="a.pdf" fileSize={1024} />);
    await waitForPdf("a.pdf");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(pdfState.getDocumentArgs[0]).toHaveProperty("data");
    expect(pdfState.getDocumentArgs[0]).not.toHaveProperty("url");
  });

  it("passes the URL to PDF.js only after a valid 206 Content-Range probe", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(2), {
        status: 206,
        headers: { "Content-Range": "bytes 0-1/999" },
      }) as Response,
    );

    render(<PdfJsViewer url="https://example.test/big.pdf" fileName="big.pdf" />);
    await waitForPdf("big.pdf");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      headers: { Range: "bytes=0-1" },
    });
    expect(pdfState.getDocumentArgs[0]).toHaveProperty("url", "https://example.test/big.pdf");
    expect(pdfState.getDocumentArgs[0]).not.toHaveProperty("data");
  });

  it("does not trust a malformed 206 probe and falls back to a bounded file fetch", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      call += 1;
      return Promise.resolve(
        new Response(new ArrayBuffer(call === 1 ? 2 : 8), {
          status: call === 1 ? 206 : 200,
        }) as Response,
      );
    });

    render(<PdfJsViewer url="https://example.test/malformed.pdf" fileName="malformed.pdf" />);
    await waitForPdf("malformed.pdf");

    expect(call).toBe(2);
    expect(pdfState.getDocumentArgs[0]).toHaveProperty("data");
    expect(pdfState.getDocumentArgs[0]).not.toHaveProperty("url");
  });

  it("does not whole-fetch an oversized PDF when Range is unavailable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response,
    );

    render(
      <PdfJsViewer
        url="https://example.test/large.pdf"
        fileName="large.pdf"
        fileSize={Number.MAX_SAFE_INTEGER}
      />,
    );

    await screen.findByRole("alert");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(pdfState.getDocumentArgs).toHaveLength(0);
  });

  it("keeps untrusted-PDF hardening enabled for every source path", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }) as Response),
    );

    render(<PdfJsViewer url="https://example.test/x.pdf" fileName="x.pdf" />);
    await waitForPdf("x.pdf");

    expect(pdfState.getDocumentArgs[0]).toMatchObject({
      enableXfa: false,
      useSystemFonts: false,
    });
  });

  it("renders canvases only after pages are observed near the viewport", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }) as Response),
    );
    const { container } = render(
      <PdfJsViewer url="https://example.test/c.pdf" fileName="c.pdf" />,
    );
    await waitForPdf("c.pdf");

    await waitFor(() => {
      expect(container.querySelectorAll("canvas")).toHaveLength(3);
    });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(800);
  });

  it("does not render observed pages again after parent state changes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }) as Response),
    );
    render(<PdfJsViewer url="https://example.test/no-loop.pdf" fileName="no-loop.pdf" />);
    await waitForPdf("no-loop.pdf");
    await waitFor(() => expect(pdfState.renderCalls).toHaveLength(3));

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(pdfState.renderCalls).toHaveLength(3);
  });

  it("logs a redacted error kind instead of raw signed-source details", async () => {
    const signedDetail = "https://storage.example/file.pdf?signature=not-for-telemetry";
    const signedName = "opaque_signed_error_name_123";
    const renderError = new Error(signedDetail);
    renderError.name = signedName;
    pdfState.renderError = renderError;
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }) as Response),
    );

    render(<PdfJsViewer url="https://example.test/render-error.pdf" fileName="render-error.pdf" />);
    await waitForPdf("render-error.pdf");
    await waitFor(() => expect(loggerState.warn).toHaveBeenCalled());

    expect(loggerState.warn).toHaveBeenCalledWith(
      "pdf-viewer",
      "page_render_failed",
      expect.objectContaining({ errorKind: "error" }),
    );
    expect(JSON.stringify(loggerState.warn.mock.calls)).not.toContain(signedDetail);
    expect(JSON.stringify(loggerState.warn.mock.calls)).not.toContain(signedName);
  });

  it("destroys the loaded PDF document when the viewer unmounts", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }) as Response),
    );
    const { unmount } = render(
      <PdfJsViewer url="https://example.test/close.pdf" fileName="close.pdf" />,
    );
    await waitForPdf("close.pdf");

    unmount();

    expect(pdfState.documentDestroy).toHaveBeenCalledTimes(1);
  });
});
