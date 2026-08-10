export interface ConversationMenuPosition {
  left: number;
  top: number;
}

interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

const VIEWPORT_PADDING = 8;
const MENU_GAP = 4;

export const getConversationMenuPosition = (
  anchor: AnchorRect,
  menuSize: { width: number; height: number },
  viewport: ViewportSize,
): ConversationMenuPosition => {
  const left = Math.max(
    VIEWPORT_PADDING,
    Math.min(
      anchor.right - menuSize.width,
      viewport.width - menuSize.width - VIEWPORT_PADDING,
    ),
  );
  const topBelow = anchor.bottom + MENU_GAP;
  const topAbove = anchor.top - menuSize.height - MENU_GAP;
  const top =
    topBelow + menuSize.height <= viewport.height - VIEWPORT_PADDING
      ? topBelow
      : Math.max(
          VIEWPORT_PADDING,
          Math.min(
            topAbove,
            viewport.height - menuSize.height - VIEWPORT_PADDING,
          ),
        );

  return { left, top };
};
