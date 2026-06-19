/**
 * @fileoverview Modal component
 * Reusable modal with semantic tokens and theme-safe styles.
 */

import React, { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button, IconButton } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  bodyClassName?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-4xl",
};

let openModalCount = 0;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const getFocusableElements = (container: HTMLElement | null): HTMLElement[] => {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => {
      if (element.hasAttribute("disabled")) {
        return false;
      }

      if (element.getAttribute("aria-hidden") === "true") {
        return false;
      }

      return element.offsetParent !== null || document.activeElement === element;
    },
  );
};

const lockBodyScroll = () => {
  if (typeof document === "undefined") {
    return;
  }

  if (openModalCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.dataset.scrollLocked = "true";
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  openModalCount += 1;
};

const unlockBodyScroll = () => {
  if (typeof document === "undefined" || openModalCount === 0) {
    return;
  }

  openModalCount -= 1;
  if (openModalCount > 0) {
    return;
  }

  document.body.style.overflow = previousBodyOverflow;
  document.body.style.paddingRight = previousBodyPaddingRight;
  delete document.body.dataset.scrollLocked;
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  footer,
  className,
  contentClassName,
  bodyClassName,
  initialFocusRef,
  restoreFocusRef,
}) => {
  const { t } = useTranslation();
  const titleId = React.useId();
  const descriptionId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const lastActiveElementRef = React.useRef<HTMLElement | null>(null);

  // Keep latest handler in a ref so the event listener never needs to be re-added
  // when props like onClose/closeOnEsc change — avoids focus-restore side effects mid-session
  const handleEscRef = React.useRef<(e: KeyboardEvent) => void>(() => undefined);
  handleEscRef.current = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      const contentElement = contentRef.current;
      const activeElement = document.activeElement;
      const isActiveInside =
        contentElement && activeElement instanceof Node
          ? contentElement.contains(activeElement)
          : false;

      if (e.key === "Tab" && isActiveInside) {
        const focusableElements = getFocusableElements(contentElement);
        if (focusableElements.length === 0) { e.preventDefault(); return; }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }

      if (e.key === "Escape" && closeOnEsc && isActiveInside) {
        e.preventDefault();
        onClose();
      }
    },
    [closeOnEsc, isOpen, onClose],
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    const restoreTargetRef = restoreFocusRef?.current ?? null;
    lastActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const stableHandler = (e: KeyboardEvent) => handleEscRef.current(e);
    document.addEventListener("keydown", stableHandler);
    lockBodyScroll();

    // Focus initial element once — RAF ensures DOM is painted
    const focusTimer = window.requestAnimationFrame(() => {
      const preferredTarget = initialFocusRef?.current;
      if (preferredTarget) { preferredTarget.focus(); return; }
      getFocusableElements(contentRef.current)[0]?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", stableHandler);
      unlockBodyScroll();

      const restoreTarget = restoreTargetRef ?? lastActiveElementRef.current;
      if (restoreTarget && typeof restoreTarget.focus === "function") {
        window.requestAnimationFrame(() => { restoreTarget.focus(); });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const modalContent = (
    <div
      className={clsx(
        "fixed inset-0 z-modal flex items-center justify-center p-4 sm:p-6",
        className,
      )}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-text-primary/45 backdrop-blur-sm"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />

      <div
        className={clsx(
          "relative flex w-full max-h-[min(90vh,48rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-elev3",
          "animate-modal-in will-change-transform",
          sizeClasses[size],
          contentClassName,
        )}
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
            <div>
              {title && (
                <h2 id={titleId} className="text-lg font-semibold text-text-primary">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-text-secondary">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <IconButton
                icon={<XMarkIcon className="h-5 w-5" />}
                aria-label={t("common:actions.close")}
                onClick={onClose}
                variant="ghost"
                size="sm"
              />
            )}
          </div>
        )}

        <div className={clsx("min-h-0 flex-1 overflow-y-auto p-5 sm:p-6", bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <div className="flex-shrink-0 border-t border-border px-5 py-4 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = "danger",
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t("common:actions.confirm");
  const resolvedCancelText = cancelText ?? t("common:actions.cancel");

  const variantStyles = {
    danger: {
      icon: "bg-danger/15 text-danger",
      button: "danger" as const,
    },
    warning: {
      icon: "bg-[#1976D2]/10 text-[#1565C0]",
      button: "brand" as const,
    },
    info: {
      icon: "bg-[#1976D2]/10 text-[#1565C0]",
      button: "brand" as const,
    },
  };

  const styles = variantStyles[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <div className="text-center">
        <div
          className={clsx(
            "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full",
            styles.icon,
          )}
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h3 className="mb-2 text-lg font-semibold text-text-primary">{title}</h3>
        <p className="mb-6 text-sm text-text-secondary">{message}</p>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="brand-outline"
            fullWidth
            disabled={isLoading}
            onClick={onClose}
          >
            {resolvedCancelText}
          </Button>

          <Button
            type="button"
            variant={styles.button}
            fullWidth
            disabled={isLoading}
            isLoading={isLoading}
            onClick={onConfirm}
          >
            {resolvedConfirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default Modal;
