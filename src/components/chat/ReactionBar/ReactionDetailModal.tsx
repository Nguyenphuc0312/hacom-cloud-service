import React, { useMemo, useState } from "react";
import { clsx } from "clsx";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { createPortal } from "react-dom";
import type { Reaction } from "@hacom/chat-shared-types/chat";
import { Avatar } from "../../common/Avatar";
import { resolveUserDisplayName } from "../../../features/chat/identity/resolveUserDisplayName";
import { useAuthStore, useChatStore } from "../../../stores";
import { resolvePublicResourceUrl } from "../../../config";

interface ReactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  reactions: Reaction[];
  currentUserId?: string;
  conversationId?: string;
}

const ALL_TAB = "__all__";

export const ReactionDetailModal: React.FC<ReactionDetailModalProps> = ({
  isOpen,
  onClose,
  reactions,
  currentUserId,
  conversationId,
}) => {
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);

  const currentUser = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);

  const participantMap = useMemo(() => {
    const map: Record<string, { displayName: string; avatar?: string }> = {};

    if (conversationId) {
      const conv = conversations.find((c) => c.id === conversationId);
      (conv?.participants ?? []).forEach((p) => {
        map[p.id] = {
          displayName: resolveUserDisplayName(p),
          avatar: p.avatar,
        };
      });
    }

    if (currentUser) {
      map[currentUser.id] = {
        displayName: resolveUserDisplayName(currentUser),
        avatar: currentUser.avatar,
      };
    }

    return map;
  }, [conversations, conversationId, currentUser]);

  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0);

  const filteredReactors = useMemo(() => {
    const list: Array<{ userId: string; emoji: string }> = [];
    const source = activeTab === ALL_TAB ? reactions : reactions.filter((r) => r.emoji === activeTab);
    source.forEach((r) => {
      r.userIds.forEach((uid) => {
        list.push({ userId: uid, emoji: r.emoji });
      });
    });
    return list;
  }, [reactions, activeTab]);

  const getTabCount = (emoji: string) =>
    reactions.find((r) => r.emoji === emoji)?.count ?? 0;

  const getUserInfo = (userId: string) => {
    const info = participantMap[userId];
    if (userId === currentUserId) {
      return {
        displayName: info?.displayName ?? resolveUserDisplayName(currentUser),
        avatar: info?.avatar ?? currentUser?.avatar,
        isMe: true,
      };
    }
    return {
      displayName: info?.displayName ?? "Người dùng",
      avatar: info?.avatar,
      isMe: false,
    };
  };

  React.useEffect(() => {
    if (!isOpen) setActiveTab(ALL_TAB);
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-text-primary/45 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative flex flex-col w-full max-w-sm max-h-[70vh] rounded-xl border border-border bg-surface shadow-elev3 animate-slide-in-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-text-primary">Biểu cảm</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar tabs */}
          <div className="flex flex-col gap-0.5 p-2 border-r border-border shrink-0 min-w-[100px] overflow-y-auto">
            <button
              type="button"
              onClick={() => setActiveTab(ALL_TAB)}
              className={clsx(
                "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                activeTab === ALL_TAB
                  ? "bg-[#1976D2]/10 text-[#1565C0] font-medium"
                  : "text-text-secondary hover:bg-surface-hover",
              )}
            >
              <span>Tất cả</span>
              <span className="tabular-nums text-xs font-medium">{totalCount}</span>
            </button>

            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => setActiveTab(r.emoji)}
                className={clsx(
                  "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                  activeTab === r.emoji
                    ? "bg-[#1976D2]/10 text-[#1565C0] font-medium"
                    : "text-text-secondary hover:bg-surface-hover",
                )}
              >
                <span className="text-base leading-none">{r.emoji}</span>
                <span className="tabular-nums text-xs font-medium">{getTabCount(r.emoji)}</span>
              </button>
            ))}
          </div>

          {/* Reactor list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredReactors.length === 0 ? (
              <div className="flex items-center justify-center h-full py-8 text-sm text-text-muted">
                Không có dữ liệu
              </div>
            ) : (
              <ul className="p-2 flex flex-col gap-0.5">
                {filteredReactors.map(({ userId, emoji }) => {
                  const { displayName, avatar, isMe } = getUserInfo(userId);
                  const resolvedAvatar = avatar ? resolvePublicResourceUrl(avatar) : undefined;

                  return (
                    <li
                      key={`${userId}-${emoji}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                    >
                      <Avatar
                        src={resolvedAvatar}
                        alt={displayName}
                        size="sm"
                      />
                      <span className={clsx(
                        "flex-1 min-w-0 truncate text-sm",
                        isMe ? "text-[#1565C0] font-medium" : "text-text-primary",
                      )}>
                        {isMe ? "Bạn" : displayName}
                      </span>
                      <span className="text-base leading-none shrink-0">{emoji}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ReactionDetailModal;
