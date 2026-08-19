import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { resolveForwardErrorMessage } from "./forwardErrorMessage";

describe("resolveForwardErrorMessage", () => {
  it("giải thích rõ khi DM đã huỷ kết bạn thay vì câu lỗi chung", () => {
    const result = resolveForwardErrorMessage({
      code: "DIRECT_CHAT_FRIENDSHIP_REQUIRED",
      message: "Friendship required before sending direct messages",
    });

    expect(result).toBe(i18n.t("chat:composer.unfriendedRestriction"));
  });

  it("dùng message của server cho các lỗi khác", () => {
    expect(
      resolveForwardErrorMessage({ code: "FORBIDDEN", message: "Bạn đã bị chặn" }),
    ).toBe("Bạn đã bị chặn");
  });

  it("về câu chung khi lỗi không có message", () => {
    expect(resolveForwardErrorMessage(undefined)).toBe(
      i18n.t("chat:message.forward.error"),
    );
  });
});
