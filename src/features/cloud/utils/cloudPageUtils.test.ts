import { describe, expect, it } from "vitest";
import { MessageType, type Message } from "../../../types";
import {
  getCloudErrorTranslationKey,
  getCloudMessageSearchText,
  getMessageRangeIds,
  isStandaloneHttpUrl,
  stripCloudRichText,
} from "./cloudPageUtils";

const message = (id: string, content: string, plainText = content): Message =>
  ({ id, type: MessageType.TEXT, content, plainText }) as Message;

describe("cloudPageUtils", () => {
  it("maps known service errors and falls back for unknown errors", () => {
    expect(getCloudErrorTranslationKey("QUOTA_EXCEEDED")).toBe("errors.quota");
    expect(getCloudErrorTranslationKey("CLOUD_UNAVAILABLE")).toBe("errors.offline");
    expect(getCloudErrorTranslationKey("UNKNOWN")).toBe("errors.generic");
  });

  it("normalizes rich text without treating markup as message content", () => {
    expect(stripCloudRichText("<p>Xin&nbsp;chào<br/>Hacom</p>")).toBe("Xin chào\nHacom");
  });

  it("accepts only standalone HTTP and HTTPS URLs", () => {
    expect(isStandaloneHttpUrl("https://hacom.vn/path")).toBe(true);
    expect(isStandaloneHttpUrl("mailto:support@hacom.vn")).toBe(false);
    expect(isStandaloneHttpUrl("xem https://hacom.vn")).toBe(false);
  });

  it("does not duplicate mirrored Cloud text during search", () => {
    expect(getCloudMessageSearchText(message("1", "nội dung"))).toBe("nội dung");
    expect(getCloudMessageSearchText(message("2", "html", "plain"))).toBe("plain html");
  });

  it("returns an inclusive range in either selection direction", () => {
    const messages = [message("1", "a"), message("2", "b"), message("3", "c")];
    expect(getMessageRangeIds(messages, "3", "1")).toEqual(["1", "2", "3"]);
    expect(getMessageRangeIds(messages, "missing", "1")).toEqual([]);
  });
});
