import { describe, expect, it } from "vitest";
import { getConversationMenuPosition } from "./conversationMenuPosition";

describe("getConversationMenuPosition", () => {
  it("right-aligns the menu below its trigger when space is available", () => {
    expect(
      getConversationMenuPosition(
        { left: 420, right: 448, top: 120, bottom: 148 },
        { width: 288, height: 160 },
        { width: 1136, height: 900 },
      ),
    ).toEqual({ left: 160, top: 152 });
  });

  it("opens above the trigger near the bottom of the viewport", () => {
    expect(
      getConversationMenuPosition(
        { left: 420, right: 448, top: 820, bottom: 848 },
        { width: 288, height: 160 },
        { width: 1136, height: 900 },
      ),
    ).toEqual({ left: 160, top: 656 });
  });

  it("keeps the menu inside narrow viewports", () => {
    expect(
      getConversationMenuPosition(
        { left: 4, right: 32, top: 4, bottom: 32 },
        { width: 288, height: 200 },
        { width: 320, height: 240 },
      ),
    ).toEqual({ left: 8, top: 8 });
  });
});
