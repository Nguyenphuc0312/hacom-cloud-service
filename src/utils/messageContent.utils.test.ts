import { describe, expect, it } from "vitest";

import { getPreviewFromMessage } from "./messageContent.utils";

describe("messageContent.utils", () => {
  it("strips HTML preview for explicit rich_text messages", () => {
    expect(
      getPreviewFromMessage({
        contentFormat: "rich_text",
        content: "<p><strong>Ok</strong></p>",
      }),
    ).toBe("Ok");
  });

  it("strips HTML preview for legacy bad data marked as plain_text", () => {
    expect(
      getPreviewFromMessage({
        contentFormat: "plain_text",
        content: "<p><u>hihi</u></p>",
      }),
    ).toBe("hihi");
  });

  it("keeps non-allowlisted angle-bracket text as plain preview", () => {
    expect(
      getPreviewFromMessage({
        contentFormat: "plain_text",
        content: "price is <abc> now",
      }),
    ).toBe("price is <abc> now");
  });
});
