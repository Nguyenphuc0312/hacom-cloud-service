import { describe, expect, it } from "vitest";
import { MessageType, type Message } from "../../../types";
import { resolveCloudDeleteDragSource } from "./cloudDeleteDrag";

const message = (id: string, type: MessageType): Message =>
  ({ id, type } as Message);

describe("cloud delete drag", () => {
  it("allows an individual media item but not unselected text", () => {
    expect(resolveCloudDeleteDragSource({ message: message("media", MessageType.IMAGE) }))
      .toEqual({ itemIds: ["media"], source: "single" });
    expect(resolveCloudDeleteDragSource({ message: message("text", MessageType.TEXT) }))
      .toBeNull();
  });

  it("allows one selected text message and a multi-message selection", () => {
    expect(resolveCloudDeleteDragSource({
      message: message("one", MessageType.TEXT),
      isSelectionMode: true,
      isSelected: true,
      selectedMessageIds: new Set(["one"]),
    })).toEqual({ itemIds: ["one"], source: "selection" });
    expect(resolveCloudDeleteDragSource({
      message: message("one", MessageType.TEXT),
      isSelectionMode: true,
      isSelected: true,
      selectedMessageIds: new Set(["one", "two"]),
    })).toEqual({ itemIds: ["one", "two"], source: "selection" });
  });
});
