import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(__dirname, "MessageInput.tsx"),
  "utf8",
);

describe("MessageInput location composer flow", () => {
  it("uses one-shot geolocation with stale callback guards", () => {
    expect(source).toContain("navigator.geolocation.getCurrentPosition");
    expect(source).not.toContain("watchPosition");
    expect(source).toContain("locationRequestSeqRef.current !== requestSeq");
  });

  it("renders location flow as a compact composer popover", () => {
    expect(source).toContain("max-w-[440px]");
    expect(source).toContain("sm:w-[min(440px,calc(100vw-32px))]");
    expect(source).not.toContain("w-full rounded-lg border border-border bg-surface px-3 py-3");
  });

  it("keeps the send-location action label visible", () => {
    expect(source).toContain("min-w-[108px]");
    expect(source).toContain("whitespace-nowrap");
    expect(source).toContain("Gửi vị trí");
    expect(source).toContain("Đang gửi...");
  });
});
