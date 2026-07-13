import React from "react";
import ReactDOM from "react-dom";
import clsx from "clsx";

interface DraggableProfileModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Stacking context for the overlay. Defaults to `z-50`; pass a higher one
   *  (e.g. `z-[210]`) when opened from inside another modal. */
  zClassName?: string;
}

/**
 * Floating card shell for the UserProfile popup (Zalo-style).
 *
 * Fixes "profile bị che mất ở màn nhỏ / zoom 125-150%": the card height is
 * capped to the viewport and its body is a single scroll region, so the whole
 * profile can be scrolled up/down inside the card instead of being clipped.
 *
 * Rendered via a portal on document.body, replacing the old inline centered
 * wrappers across GroupInfo / message clusters / ChatPage.
 */
export const DraggableProfileModal: React.FC<DraggableProfileModalProps> = ({
  onClose,
  children,
  zClassName = "z-50",
}) => {
  return ReactDOM.createPortal(
    <div
      className={clsx(
        "fixed inset-0 flex items-center justify-center px-4 py-10",
        zClassName,
      )}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 flex max-h-[72vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Body fills the capped card height; UserProfile (h-full flex-col)
            keeps its own header pinned and scrolls its content inside here.
            [&>*] makes the profile grow to fill even through a <Suspense>. */}
        <div className="flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DraggableProfileModal;
