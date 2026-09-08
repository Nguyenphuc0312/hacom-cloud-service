/**
 * @fileoverview useDropZone — drag-and-drop hook for file uploads.
 *
 * Tracks dragEnter/dragLeave events with a counter to handle nested elements.
 * Filters for "Files" data transfer type to avoid text / URL drops.
 * Returns `isDragActive` and event handlers to attach to a container.
 */

import { useCallback, useRef, useState } from "react";

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
};

/**
 * Browsers do not expose a portable folder `File` object. Detect directories
 * before handing the remaining files to the shared attachment queue.
 */
export const hasDroppedDirectory = (
  dataTransfer: Pick<DataTransfer, "files" | "items">,
): boolean => {
  const items = Array.from(dataTransfer.items);

  if (
    items.some((item) => {
      if (item.kind !== "file") return false;
      return (
        (item as DataTransferItemWithEntry).webkitGetAsEntry?.()
          ?.isDirectory === true
      );
    })
  ) {
    return true;
  }

  // Chromium reports a folder as a file item with no File when the legacy
  // entry API is unavailable. Do not silently accept that ambiguous drop.
  return (
    dataTransfer.files.length === 0 &&
    items.some((item) => item.kind === "file")
  );
};

export interface UseDropZoneOptions {
  /** Called when files are dropped */
  onDrop: (files: File[]) => void;
  /** Whether drop is disabled (e.g. no conversation selected) */
  disabled?: boolean;
  /** Called when user drops files while disabled */
  onDropRejected?: () => void;
  /** Called when a dropped folder cannot be attached */
  onDropFolderRejected?: () => void;
}

export interface UseDropZoneReturn {
  /** Whether a file drag is currently over the drop zone */
  isDragActive: boolean;
  /** Props to spread on the container element */
  dropZoneProps: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** Dismiss the overlay (e.g. on ESC) */
  dismiss: () => void;
}

export function useDropZone({
  onDrop,
  disabled = false,
  onDropRejected,
  onDropFolderRejected,
}: UseDropZoneOptions): UseDropZoneReturn {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounter.current += 1;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragActive(true);
      }
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) {
        e.dataTransfer.dropEffect = "none";
        return;
      }
      // Required to allow drop
      e.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragActive(false);

      if (disabled) {
        onDropRejected?.();
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      if (hasDroppedDirectory(e.dataTransfer)) {
        onDropFolderRejected?.();
      }
      if (files.length > 0) {
        onDrop(files);
      }
    },
    [disabled, onDrop, onDropFolderRejected, onDropRejected],
  );

  const dismiss = useCallback(() => {
    dragCounter.current = 0;
    setIsDragActive(false);
  }, []);

  return {
    isDragActive,
    dropZoneProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    dismiss,
  };
}

export default useDropZone;
