import { MessageType, type Message } from "../../../types";

export const CLOUD_DELETE_DRAG_MIME = "application/x-hacom-cloud-delete";

export type CloudDeleteDragSource = "single" | "selection";

export interface CloudDeleteDragPayload {
  itemIds: string[];
  source: CloudDeleteDragSource;
}

const MEDIA_MESSAGE_TYPES = new Set<MessageType>([
  MessageType.FILE,
  MessageType.IMAGE,
  MessageType.VIDEO,
  MessageType.AUDIO,
]);

const uniqueIds = (ids: readonly string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const normalized = id.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

export const normalizeCloudDeleteDragPayload = (
  payload: CloudDeleteDragPayload,
): CloudDeleteDragPayload | null => {
  const itemIds = uniqueIds(payload.itemIds);
  if (itemIds.length === 0) return null;
  if (payload.source !== "single" && payload.source !== "selection") return null;
  return { itemIds, source: payload.source };
};

export const encodeCloudDeleteDrag = (
  dataTransfer: DataTransfer,
  payload: CloudDeleteDragPayload,
): boolean => {
  const normalized = normalizeCloudDeleteDragPayload(payload);
  if (!normalized) return false;
  dataTransfer.setData(CLOUD_DELETE_DRAG_MIME, JSON.stringify(normalized));
  dataTransfer.effectAllowed = "copyMove";
  return true;
};

export const decodeCloudDeleteDrag = (
  dataTransfer: DataTransfer,
): CloudDeleteDragPayload | null => {
  if (!Array.from(dataTransfer.types).includes(CLOUD_DELETE_DRAG_MIME)) return null;
  try {
    const candidate = JSON.parse(dataTransfer.getData(CLOUD_DELETE_DRAG_MIME)) as {
      itemIds?: unknown;
      source?: unknown;
    };
    if (
      !Array.isArray(candidate.itemIds) ||
      !candidate.itemIds.every((id) => typeof id === "string") ||
      (candidate.source !== "single" && candidate.source !== "selection")
    ) {
      return null;
    }
    return normalizeCloudDeleteDragPayload({
      itemIds: candidate.itemIds,
      source: candidate.source,
    });
  } catch {
    return null;
  }
};

export const isCloudDeleteDrag = (dataTransfer: DataTransfer): boolean =>
  Array.from(dataTransfer.types).includes(CLOUD_DELETE_DRAG_MIME);

export const resolveCloudDeleteDragSource = (params: {
  message: Message;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  selectedMessageIds?: Set<string>;
}): CloudDeleteDragPayload | null => {
  const selectedIds = params.selectedMessageIds
    ? uniqueIds([...params.selectedMessageIds])
    : [];

  // Any non-empty selection, including a single selected text message, moves as a unit.
  if (params.isSelectionMode && params.isSelected && selectedIds.length > 0) {
    return { itemIds: selectedIds, source: "selection" };
  }

  if (!params.isSelectionMode && MEDIA_MESSAGE_TYPES.has(params.message.type)) {
    return { itemIds: [params.message.id], source: "single" };
  }

  return null;
};

export const applyCloudDeleteDragGhost = (
  dataTransfer: DataTransfer,
  label: string,
  count: number,
): void => {
  if (typeof document === "undefined") return;
  const ghost = document.createElement("div");
  ghost.textContent = count > 1 ? `${count} mục đã chọn` : label;
  ghost.style.cssText =
    "position:fixed;top:-1000px;left:-1000px;padding:8px 12px;border-radius:999px;background:#1565c0;color:#fff;font:600 13px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.2);";
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 12, 16);
  window.setTimeout(() => ghost.remove(), 0);
};
