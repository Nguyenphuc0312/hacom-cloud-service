import { describe, expect, it } from "vitest";
import {
  canDownloadResource,
  canPreviewResource,
  getResourceCapabilityMetadata,
} from "./resourceCapabilities";

describe("resource capability policy", () => {
  it("keeps legacy resources usable when capability fields are absent", () => {
    const legacyResource = {};

    expect(canPreviewResource(legacyResource)).toBe(true);
    expect(canDownloadResource(legacyResource)).toBe(true);
    expect(getResourceCapabilityMetadata(legacyResource)).toEqual({});
  });

  it("preserves explicit server capability denials across UI surfaces", () => {
    const blockedResource = { canPreview: false, canDownload: false };

    expect(canPreviewResource(blockedResource)).toBe(false);
    expect(canDownloadResource(blockedResource)).toBe(false);
    expect(getResourceCapabilityMetadata(blockedResource)).toEqual(blockedResource);
  });
});
