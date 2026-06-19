import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChevronUpIcon,
  UserCircleIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UserMinusIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  getMemberActions,
  type ResolvedMemberAction,
  type GroupCapabilityMatrix,
} from "./utils/canPerformAction";
import { RoomMemberRole } from "../../../../types";

interface MemberActionsMenuProps {
  memberId: string;
  memberName: string;
  memberRole: RoomMemberRole;
  currentUserId: string;
  currentUserRole: RoomMemberRole;
  capabilities?: GroupCapabilityMatrix | null;
  onMakeAdmin: (memberId: string) => void;
  onRemoveAdmin: (memberId: string) => void;
  onTransferOwnership: (memberId: string) => void;
  onBanMember: (memberId: string) => void;
  onRemoveMember: (memberId: string) => void;
  isLoading?: boolean;
  className?: string;
}

export const MemberActionsMenu: React.FC<MemberActionsMenuProps> = ({
  memberId,
  memberName,
  memberRole,
  currentUserId,
  currentUserRole,
  capabilities,
  onMakeAdmin,
  onRemoveAdmin,
  onTransferOwnership,
  onBanMember,
  onRemoveMember,
  isLoading = false,
  className,
}) => {
  const { t } = useTranslation("profile");
  const [isOpen, setIsOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<"inline-confirm" | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const labels = {
    makeAdmin: t("profile:groupInfo.actions.makeAdmin"),
    removeAdmin: t("profile:groupInfo.actions.removeAdmin"),
    transferOwnership: t("profile:groupInfo.actions.transferOwnership"),
    banMember: t("profile:groupInfo.actions.banMember"),
    removeMember: t("profile:groupInfo.actions.removeMember"),
  };

  const actions = getMemberActions(
    {
      actorRole: currentUserRole,
      actorUserId: currentUserId,
      targetRole: memberRole,
      targetUserId: memberId,
      capabilities,
    },
    labels,
  );

  // Don't render kebab if no actions available
  if (actions.length === 0) {
    return null;
  }

  const handleToggle = () => {
    if (!isOpen) updatePos();
    setIsOpen((prev) => !prev);
    setActiveAction(null);
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setActiveAction(null);
  }, []);

  const handleActionClick = (action: ResolvedMemberAction) => {
    // Inline confirm for neutral actions (make/remove admin)
    if (action.variant === "neutral") {
      setActiveAction("inline-confirm");
      setIsOpen(false);
      return;
    }

    // Open modal for warning/danger actions
    setIsOpen(false);
    switch (action.type) {
      case "transfer-ownership":
        onTransferOwnership(memberId);
        break;
      case "ban-member":
        onBanMember(memberId);
        break;
      case "remove-member":
        onRemoveMember(memberId);
        break;
    }
  };

  const handleInlineConfirm = () => {
    if (memberRole === RoomMemberRole.ADMIN) {
      onRemoveAdmin(memberId);
    } else {
      onMakeAdmin(memberId);
    }
    setActiveAction(null);
  };

  const handleInlineCancel = () => {
    setActiveAction(null);
  };

  const updatePos = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, []);

  // Handle click outside + scroll + resize
  useEffect(() => {
    if (!isOpen && activeAction === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideMenu = menuRef.current?.contains(target);
      const insideButton = buttonRef.current?.contains(target);
      if (!insideMenu && !insideButton) handleClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { handleClose(); buttonRef.current?.focus(); }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [isOpen, activeAction, handleClose, updatePos]);

  // Keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen) return;

    const focusableItems = menuItemRefs.current.filter(Boolean);
    const currentIndex = focusableItems.findIndex(
      (item) => item === document.activeElement,
    );

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (currentIndex === -1 || currentIndex === focusableItems.length - 1) {
          focusableItems[0]?.focus();
        } else {
          focusableItems[currentIndex + 1]?.focus();
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (currentIndex === -1 || currentIndex === 0) {
          focusableItems[focusableItems.length - 1]?.focus();
        } else {
          focusableItems[currentIndex - 1]?.focus();
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (currentIndex >= 0) {
          focusableItems[currentIndex]?.click();
        }
        break;
    }
  };

  const getActionIcon = (action: ResolvedMemberAction) => {
    switch (action.type) {
      case "make-admin":
        return <ShieldCheckIcon className="h-4 w-4" />;
      case "remove-admin":
        return <UserCircleIcon className="h-4 w-4" />;
      case "transfer-ownership":
        return <UserPlusIcon className="h-4 w-4" />;
      case "ban-member":
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      case "remove-member":
        return <UserMinusIcon className="h-4 w-4" />;
    }
  };

  // Split actions into sections
  const neutralActions = actions.filter((a) => a.variant === "neutral");
  const destructiveActions = actions.filter((a) => a.variant !== "neutral");
  const showSeparator = neutralActions.length > 0 && destructiveActions.length > 0;

  const portalContent = (
    <>
      {/* Inline confirmation popover */}
      {activeAction === "inline-confirm" && menuPos && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
          className="z-[9999] min-w-52 rounded-lg border border-border bg-surface p-3 shadow-elev3 animate-fade-in"
        >
          <p className="mb-3 text-sm text-text-primary">
            {memberRole === RoomMemberRole.ADMIN
              ? t("profile:groupInfo.confirm.removeAdmin", { name: memberName })
              : t("profile:groupInfo.confirm.makeAdmin", { name: memberName })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleInlineCancel}
              className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
            >
              {t("common:actions.cancel")}
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleInlineConfirm}
              className="flex-1 rounded-md bg-[#1565C0] px-3 py-1.5 text-sm text-white hover:bg-[#1976D2] disabled:opacity-60"
            >
              {t("common:actions.confirm")}
            </button>
          </div>
        </div>
      )}

      {/* Dropdown menu */}
      {isOpen && menuPos && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
          className="z-[9999] min-w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-elev3 animate-fade-in focus-visible:outline-none"
          role="menu"
          aria-orientation="vertical"
          onKeyDown={handleKeyDown}
        >
          {neutralActions.map((action, index) => (
            <button
              key={action.id}
              ref={(el) => { menuItemRefs.current[index] = el; }}
              type="button"
              disabled={isLoading}
              onClick={() => handleActionClick(action)}
              className={clsx(
                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-micro",
                "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
                "focus-visible:outline-none focus-visible:bg-surface-overlay",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              role="menuitem"
            >
              {getActionIcon(action)}
              <span>{action.label}</span>
            </button>
          ))}

          {showSeparator && <div className="my-1 h-px bg-border/60" role="separator" />}

          {destructiveActions.map((action, idx) => {
            const actualIndex = neutralActions.length + idx;
            return (
              <button
                key={action.id}
                ref={(el) => { menuItemRefs.current[actualIndex] = el; }}
                type="button"
                disabled={isLoading}
                onClick={() => handleActionClick(action)}
                className={clsx(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-micro",
                  action.variant === "warning"
                    ? "text-warning hover:bg-warning/8"
                    : "text-danger hover:bg-danger/8",
                  "focus-visible:outline-none focus-visible:bg-surface-overlay",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                role="menuitem"
              >
                {getActionIcon(action)}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className={clsx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={clsx(
          "flex h-8 w-8 items-center justify-center rounded-md transition-all",
          "opacity-0 group-hover:opacity-100",
          "hover:bg-surface-overlay active:bg-surface-active",
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        aria-label={t("profile:groupInfo.actions.options", { name: memberName })}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <ChevronUpIcon className="h-5 w-5 rotate-90 transform text-text-muted" />
      </button>

      {createPortal(portalContent, document.body)}
    </div>
  );
};
