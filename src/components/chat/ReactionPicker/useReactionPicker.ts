/**
 * Hook to manage ReactionPicker open/close state and positioning.
 */

import { useState, useEffect, useCallback, useRef, type RefObject } from "react";

export type PickerPosition = "top" | "bottom";

interface UseReactionPickerOptions {
  triggerRef: RefObject<HTMLElement | null>;
  pickerHeight?: number;
}

interface UseReactionPickerReturn {
  isOpen: boolean;
  position: PickerPosition;
  pickerStyle: React.CSSProperties;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const PICKER_HEIGHT_ESTIMATE = 320;
const VIEWPORT_MARGIN = 8;

export function useReactionPicker({
  triggerRef,
  pickerHeight = PICKER_HEIGHT_ESTIMATE,
}: UseReactionPickerOptions): UseReactionPickerReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<PickerPosition>("bottom");
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    // Check if there's enough space below
    const needsToOpenUpward = spaceBelow < pickerHeight + VIEWPORT_MARGIN;
    const newPosition: PickerPosition = needsToOpenUpward ? "top" : "bottom";

    // Calculate horizontal position
    let left: number;
    const pickerWidth = 296;

    // Center the picker relative to the trigger
    left = triggerRect.left + triggerRect.width / 2 - pickerWidth / 2;

    // Clamp to viewport edges
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - pickerWidth - VIEWPORT_MARGIN));

    const newStyle: React.CSSProperties = {
      position: "absolute",
      left,
      ...(newPosition === "top"
        ? { bottom: window.innerHeight - triggerRect.top + 4 }
        : { top: triggerRect.bottom + 4 }),
    };

    setPosition(newPosition);
    setPickerStyle(newStyle);
  }, [triggerRef, pickerHeight]);

  const open = useCallback(() => {
    setIsOpen(true);
    // Compute position after a brief delay to ensure DOM is ready
    requestAnimationFrame(() => {
      computePosition();
    });
  }, [computePosition]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking inside the picker or trigger
      if (triggerRef.current && triggerRef.current.contains(target)) {
        return;
      }

      if (pickerRef.current && pickerRef.current.contains(target)) {
        return;
      }

      close();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, triggerRef, close]);

  // Recompute position on scroll or resize
  useEffect(() => {
    if (!isOpen) return;

    const handleUpdate = () => {
      computePosition();
    };

    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, { passive: true });

    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate);
    };
  }, [isOpen, computePosition]);

  return {
    isOpen,
    position,
    pickerStyle,
    open,
    close,
    toggle,
  };
}

/**
 * Hook to track and expose the picker ref.
 */
export function usePickerRef() {
  const ref = useRef<HTMLDivElement | null>(null);
  return ref;
}
