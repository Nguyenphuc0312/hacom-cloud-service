import { describe, expect, it } from "vitest";
import { resolvePublicResourceUrl } from "./index";

describe("resolvePublicResourceUrl", () => {
  it("allows http and https resource URLs", () => {
    expect(resolvePublicResourceUrl("https://files.example/a.png")).toBe(
      "https://files.example/a.png",
    );
    expect(resolvePublicResourceUrl("http://files.example/a.png")).toBe(
      "http://files.example/a.png",
    );
  });

  it("blocks websocket and data URLs by default", () => {
    expect(resolvePublicResourceUrl("wss://example.test/ws")).toBeUndefined();
    expect(
      resolvePublicResourceUrl("data:image/png;base64,AAAA"),
    ).toBeUndefined();
  });

  it("allows blob URLs only when explicitly requested", () => {
    expect(resolvePublicResourceUrl("blob:https://app.test/1")).toBeUndefined();
    expect(
      resolvePublicResourceUrl("blob:https://app.test/1", {
        context: "image",
        allowBlob: true,
      }),
    ).toBe("blob:https://app.test/1");
  });

  it("allows only safe raster image data URLs for image preview context", () => {
    expect(
      resolvePublicResourceUrl("data:image/png;base64,AAAA", {
        context: "image",
        allowDataImage: true,
      }),
    ).toBe("data:image/png;base64,AAAA");

    expect(
      resolvePublicResourceUrl("data:image/svg+xml;base64,AAAA", {
        context: "image",
        allowDataImage: true,
      }),
    ).toBeUndefined();

    expect(
      resolvePublicResourceUrl("data:text/html,<script>alert(1)</script>", {
        context: "image",
        allowDataImage: true,
      }),
    ).toBeUndefined();
  });
});
