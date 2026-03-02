/**
 * @fileoverview useDropZone — drag-and-drop hook for file uploads.
 *
 * Tracks dragEnter/dragLeave events with a counter to handle nested elements.
 * Filters for "Files" data transfer type to avoid text / URL drops.
 * Returns `isDragActive` and event handlers to attach to a container.
 */

import { useCallback, useRef, useState } from "react";

export interface UseDropZoneOptions {
  /** Called when files are dropped */
  onDrop: (files: File[]) => void;
  /** Whether drop is disabled (e.g. no conversation selected) */
  disabled?: boolean;
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
      if (disabled) return;
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

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onDrop(files);
      }
    },
    [disabled, onDrop],
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
