import { describe, it, expect } from "vitest";
import { resolveSourceUrl, getSourceHref, isSafeSourceUrl } from "./sourceUtils";
import type { AiSource } from "../types";

// In dev/test VITE_AI_CHAT_BASE_URL="/ai-api" (relative proxy prefix), so a
// source path "/api/sources/x" resolves to the proxied "/ai-api/api/sources/x".
const P = "/ai-api";

describe("resolveSourceUrl", () => {
  it("resolves a RELATIVE /api/sources/ url + proxy prefix (original bug: threw)", () => {
    expect(resolveSourceUrl("/api/sources/doc-1?page=3")).toBe(
      `${P}/api/sources/doc-1?page=3`,
    );
  });

  it("resolves a relative /api/source-files/ url", () => {
    expect(resolveSourceUrl("/api/source-files/F001?name=a.pdf")).toBe(
      `${P}/api/source-files/F001?name=a.pdf`,
    );
  });

  it("does not double-prefix a url that already has the proxy prefix", () => {
    expect(resolveSourceUrl("/ai-api/api/sources/x")).toBe(
      `${P}/api/sources/x`,
    );
  });

  it("rejects a non-source path (no open of internal urls)", () => {
    expect(resolveSourceUrl("/api/admin/secret")).toBeUndefined();
  });

  it("rejects a foreign absolute origin", () => {
    expect(resolveSourceUrl("https://evil.com/api/sources/x")).toBeUndefined();
  });

  it("rejects empty/undefined", () => {
    expect(resolveSourceUrl(undefined)).toBeUndefined();
    expect(resolveSourceUrl("")).toBeUndefined();
  });
});

describe("getSourceHref priority", () => {
  const base: AiSource = { citation_index: 1 };

  it("prefers reader_url over the other aliases", () => {
    const s: AiSource = {
      ...base,
      reader_url: "/api/sources/reader?page=1",
      url: "/api/sources/url",
      source_url: "/api/sources/src",
      open_url: "/api/source-files/F1",
    };
    expect(getSourceHref(s)).toBe(`${P}/api/sources/reader?page=1`);
  });

  it("falls back through url → open_url → download_url", () => {
    expect(getSourceHref({ ...base, url: "/api/sources/u" })).toBe(
      `${P}/api/sources/u`,
    );
    expect(getSourceHref({ ...base, open_url: "/api/source-files/F1" })).toBe(
      `${P}/api/source-files/F1`,
    );
    expect(
      getSourceHref({ ...base, download_url: "/api/source-files/F2" }),
    ).toBe(`${P}/api/source-files/F2`);
  });

  it("skips an unsafe alias and uses the next valid one", () => {
    const s: AiSource = {
      ...base,
      reader_url: "https://evil.com/api/sources/x",
      url: "/api/sources/ok",
    };
    expect(getSourceHref(s)).toBe(`${P}/api/sources/ok`);
  });

  it("returns undefined when no usable link exists", () => {
    expect(getSourceHref(base)).toBeUndefined();
    expect(isSafeSourceUrl(undefined)).toBe(false);
  });
});
