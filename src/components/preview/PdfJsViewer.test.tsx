/**
 * @fileoverview Bảo vệ 2 lỗi thật đã gặp ở PdfJsViewer (05-08-26):
 *
 * 1. "PDF trắng tinh": đưa thẳng { url } cho pdf.js thay vì tự fetch →
 *    ArrayBuffer. pdf.js tự phát range request; signed URL / CDN không phục vụ
 *    được range đúng cách nên phần thân trang tải hụt — header vẫn hiện đủ
 *    "53 pages" nhưng mọi trang trắng trơn. Test dưới khoá lại đường nạp file.
 *
 * 2. Vòng lặp render: effect vẽ trang từng có `renderedPages` trong deps nhưng
 *    chính nó lại setRenderedPages → mỗi trang vẽ xong kích hoạt lại cả danh sách.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeAll } from "vitest";

// pdf.js không chạy được trong jsdom (cần worker + canvas 2d thật) → giả lập ở mức
// module. Phần được kiểm ở đây là vòng đời DOM của React, không phải pdf.js.
const renderCalls: number[] = [];
const getDocumentArgs: Array<Record<string, unknown>> = [];

vi.mock("pdfjs-dist", () => {
  const makePage = (pageNumber: number) => ({
    getViewport: () => ({ width: 600, height: 800 }),
    render: () => {
      renderCalls.push(pageNumber);
      return { promise: Promise.resolve(), cancel: () => {} };
    },
  });
  return {
    GlobalWorkerOptions: { workerPort: null },
    getDocument: (args: Record<string, unknown>) => {
      getDocumentArgs.push(args);
      return {
        promise: Promise.resolve({
          numPages: 3,
          getPage: (n: number) => Promise.resolve(makePage(n)),
        }),
      };
    },
  };
});

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?worker", () => ({
  default: class {
    terminate() {}
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}));

// jsdom không có IntersectionObserver → giả lập bản luôn báo "đang hiển thị"
// để mọi trang đều đi vào nhánh render.
beforeAll(() => {
  class FakeIntersectionObserver {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.cb(
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

  // jsdom trả null cho getContext("2d") nếu không có canvas package.
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}) as unknown as CanvasRenderingContext2D,
  ) as unknown as HTMLCanvasElement["getContext"];
});

const { PdfJsViewer } = await import("./PdfJsViewer");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PdfJsViewer", () => {
  it("server KHÔNG hỗ trợ range (trả 200) → tải cả file, không đưa url cho pdf.js", async () => {
    getDocumentArgs.length = 0;
    // 200 = server phớt lờ header Range. Đưa { url } trong tình huống này chính
    // là thứ gây trắng màn hôm 05-08-26.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response,
    );

    render(
      <PdfJsViewer url="https://example.test/a.pdf" fileName="a.pdf" fileSize={1024} />,
    );
    await screen.findByText(/3 pages/);

    expect(getDocumentArgs[0]).toHaveProperty("data");
    expect(getDocumentArgs[0]).not.toHaveProperty("url");
  });

  it("server CÓ hỗ trợ range (trả 206) → giao url cho pdf.js tải dần", async () => {
    getDocumentArgs.length = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 206 }) as Response,
    );

    render(<PdfJsViewer url="https://example.test/big.pdf" fileName="big.pdf" />);
    await screen.findByText(/3 pages/);

    // Chỉ dò 2 byte, KHÔNG tải cả file — đây là điểm giúp file 200 trang mở ngay.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      headers: { Range: "bytes=0-1" },
    });
    expect(getDocumentArgs[0]).toHaveProperty("url");
    expect(getDocumentArgs[0]).not.toHaveProperty("data");
  });

  it("dò range lỗi (CORS chặn) → vẫn xem được bằng đường tải cả file", async () => {
    getDocumentArgs.length = 0;
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      call += 1;
      // Lần 1 = dò range bị CORS chặn; lần 2 = tải cả file, phải thành công.
      return call === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }) as Response);
    });

    render(<PdfJsViewer url="https://example.test/cors.pdf" fileName="cors.pdf" />);
    await screen.findByText(/3 pages/);

    expect(getDocumentArgs[0]).toHaveProperty("data");
  });

  it("luôn tắt XFA và font hệ thống — PDF là nội dung không tin cậy", async () => {
    getDocumentArgs.length = 0;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response,
    );

    render(<PdfJsViewer url="https://example.test/x.pdf" fileName="x.pdf" />);
    await screen.findByText(/3 pages/);

    expect(getDocumentArgs[0]).toMatchObject({
      enableXfa: false,
      useSystemFonts: false,
    });
  });

  it("vẽ canvas cho các trang lọt vào viewport", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response,
    );
    const { container } = render(
      <PdfJsViewer url="https://example.test/c.pdf" fileName="c.pdf" />,
    );
    await screen.findByText(/3 pages/);

    await waitFor(() => {
      expect(container.querySelectorAll("canvas").length).toBe(3);
    });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(800);
  });

  it("không vẽ lại trang đã vẽ khi cha re-render", async () => {
    renderCalls.length = 0;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response,
    );
    render(<PdfJsViewer url="https://example.test/b.pdf" fileName="b.pdf" />);
    await screen.findByText(/3 pages/);
    await waitFor(() => expect(renderCalls.length).toBe(3));

    // Đợi thêm một nhịp: nếu effect còn vòng lặp (bug cũ ở deps renderedPages)
    // thì số lần render sẽ tiếp tục tăng.
    await new Promise((r) => setTimeout(r, 50));
    expect(renderCalls.length).toBe(3);
  });
});
