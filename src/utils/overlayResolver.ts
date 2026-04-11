export type OverlaySlot =
  | "top-center"
  | "bottom-right"
  | "bottom-center";

export interface OverlayCandidate {
  id: string;
  visible: boolean;
  priority: number;
  slot: OverlaySlot;
  canCollapse?: boolean;
  collapseSlot?: OverlaySlot;
}

export interface ResolvedOverlayPlacement {
  visible: boolean;
  slot: OverlaySlot;
  collapsed: boolean;
}

const SLOT_CAPACITY: Record<OverlaySlot, number> = {
  "top-center": 1,
  "bottom-right": 1,
  "bottom-center": 1,
};

export const resolveOverlayPlacements = (
  candidates: OverlayCandidate[],
): Record<string, ResolvedOverlayPlacement> => {
  const placementMap: Record<string, ResolvedOverlayPlacement> = {};
  const slotUsage = new Map<OverlaySlot, OverlayCandidate[]>();

  const sorted = [...candidates]
    .filter((candidate) => candidate.visible)
    .sort((a, b) => b.priority - a.priority);

  for (const candidate of sorted) {
    const currentSlotItems = slotUsage.get(candidate.slot) || [];
    if (currentSlotItems.length < SLOT_CAPACITY[candidate.slot]) {
      currentSlotItems.push(candidate);
      slotUsage.set(candidate.slot, currentSlotItems);
      placementMap[candidate.id] = {
        visible: true,
        slot: candidate.slot,
        collapsed: false,
      };
      continue;
    }

    if (
      candidate.canCollapse &&
      candidate.collapseSlot &&
      (slotUsage.get(candidate.collapseSlot)?.length || 0) <
        SLOT_CAPACITY[candidate.collapseSlot]
    ) {
      const collapseItems = slotUsage.get(candidate.collapseSlot) || [];
      collapseItems.push(candidate);
      slotUsage.set(candidate.collapseSlot, collapseItems);
      placementMap[candidate.id] = {
        visible: true,
        slot: candidate.collapseSlot,
        collapsed: true,
      };
      continue;
    }

    placementMap[candidate.id] = {
      visible: false,
      slot: candidate.slot,
      collapsed: false,
    };
  }

  return placementMap;
};
