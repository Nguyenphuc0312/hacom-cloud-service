import React, { useState, useCallback } from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  PencilIcon,
  BellIcon,
  PhotoIcon,
  UserPlusIcon,
  ExclamationTriangleIcon,
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "../common/Avatar";
import { Input, Spinner, toast } from "../ui";
import type { Conversation, UserSummary } from "../../types";
import { useDebounce } from "../../hooks";
import { conversationApi, userApi } from "../../services/api";
import { useChatStore } from "../../stores";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";

interface GroupInfoProps {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
  className?: string;
}

export const GroupInfo: React.FC<GroupInfoProps> = ({
  conversation,
  currentUserId,
  onClose,
  className,
}) => {
  const { t } = useTranslation(["profile", "common"]);

  const participants = React.useMemo(
    () =>
      Array.isArray(conversation.participants) ? conversation.participants : [],
    [conversation.participants],
  );

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"members" | "media" | "files">(
    "members",
  );
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);
  const { updateConversation, removeConversation } = useChatStore();

  const isAdmin = false;

  const searchUsers = useCallback(
    async (query: string) => {
      if (!query.trim() || query.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await userApi.searchUsers(query, 1, 10);
        const participantIds = new Set(participants.map((p) => p.id));
        const users = unwrapApiSuccess(response).filter(
          (u) => !participantIds.has(u.id) && u.id !== currentUserId,
        );
        setSearchResults(users as unknown as UserSummary[]);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [participants, currentUserId],
  );

  React.useEffect(() => {
    void searchUsers(debouncedQuery);
  }, [debouncedQuery, searchUsers]);

  const handleAddMember = useCallback(
    async (userId: string) => {
      setIsSubmitting(true);
      try {
        const response = await conversationApi.addMembers(conversation.id, [
          userId,
        ]);
        const updatedConversation = unwrapApiSuccess(response);
        updateConversation(conversation.id, updatedConversation);
        setSearchQuery("");
        setSearchResults([]);
        setShowAddMember(false);
        toast.success(t("profile:toast.memberAdded"));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.memberAddFailed"));
      } finally {
        setIsSubmitting(false);
      }
    },
    [conversation.id, t, updateConversation],
  );

  const handleLeaveGroup = useCallback(async () => {
    if (!window.confirm(t("profile:groupInfo.leaveConfirm"))) return;

    setIsSubmitting(true);
    try {
      await conversationApi.leaveConversation(conversation.id);
      removeConversation(conversation.id);
      toast.success(t("profile:toast.leftGroup"));
      onClose();
      navigate("/chat");
    } catch (error) {
      toast.error(t("profile:toast.leaveGroupFailed"));
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [conversation.id, navigate, onClose, removeConversation, t]);

  const tabs = [
    { id: "members", label: t("profile:groupInfo.tabs.members") },
    { id: "media", label: t("profile:groupInfo.tabs.media") },
    { id: "files", label: t("profile:groupInfo.tabs.files") },
  ] as const;

  return (
    <div className={clsx("flex flex-col h-full bg-surface", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-text-primary">
          {t("profile:groupInfo.title")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-surface-overlay transition-colors"
          aria-label={t("common:actions.close")}
        >
          <XMarkIcon className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center py-6 px-4">
          <Avatar src={conversation.avatar} alt={conversation.name} size="xl" />

          <div className="mt-4 text-center">
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2 justify-center">
              {conversation.name}
              {isAdmin && (
                <button
                  type="button"
                  className="p-1 hover:bg-surface-overlay rounded-full"
                >
                  <PencilIcon className="w-4 h-4 text-text-muted" />
                </button>
              )}
            </h2>

            <p className="text-sm text-text-muted mt-1">
              {t("profile:groupInfo.membersCount", {
                count: conversation.participantCount ?? participants.length,
              })}
            </p>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        <div className="py-2">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <BellIcon className="w-5 h-5 text-text-muted" />
              <span className="text-sm text-text-primary">
                {t("profile:groupInfo.notifications")}
              </span>
            </div>
            <div
              className={clsx(
                "w-10 h-6 rounded-full relative",
                conversation.isMuted ? "bg-border-strong" : "bg-primary",
              )}
            >
              <div
                className={clsx(
                  "absolute top-1 w-4 h-4 bg-surface rounded-full shadow transition-all",
                  conversation.isMuted ? "left-1" : "right-1",
                )}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="py-2">
          {activeTab === "members" && (
            <>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowAddMember((prev) => !prev)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors text-primary"
              >
                <UserPlusIcon className="w-5 h-5" />
                <span className="text-sm font-medium">
                  {t("profile:groupInfo.addMember")}
                </span>
              </button>

              {showAddMember && (
                <div className="px-4 pb-3 space-y-2">
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("profile:groupInfo.searchMemberPlaceholder")}
                    leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
                    disabled={isSubmitting}
                  />
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                    {isSearching ? (
                      <div className="py-4 flex justify-center">
                        <Spinner size="md" />
                      </div>
                    ) : searchResults.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-text-muted">
                        {t("profile:groupInfo.noSearchResult")}
                      </p>
                    ) : (
                      searchResults.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => void handleAddMember(user.id)}
                          disabled={isSubmitting}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover"
                        >
                          <Avatar
                            src={user.avatar}
                            alt={user.displayName || user.username}
                            size="sm"
                            status={user.status}
                            showStatus
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {user.displayName || user.username}
                            </p>
                            <p className="text-xs text-text-muted truncate">
                              @{user.username}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  <Avatar
                    src={participant.avatar}
                    alt={participant.displayName || participant.username}
                    size="md"
                    status={participant.status}
                    showStatus
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {participant.displayName || participant.username}
                      {participant.id === currentUserId && (
                        <span className="ml-2 text-xs text-text-muted">
                          {t("profile:groupInfo.youSuffix")}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      @{participant.username}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}

          {activeTab === "media" && (
            <div className="p-4">
              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="aspect-square bg-surface-overlay rounded-lg flex items-center justify-center"
                  >
                    <PhotoIcon className="w-8 h-8 text-border-strong" />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="w-full mt-4 py-2 text-sm text-primary font-medium hover:bg-surface-hover rounded-lg"
              >
                {t("profile:groupInfo.viewAllMedia")}
              </button>
            </div>
          )}

          {activeTab === "files" && (
            <div className="p-4 text-center text-text-muted text-sm">
              {t("profile:groupInfo.noSharedFiles")}
            </div>
          )}
        </div>

        <div className="h-px bg-border mx-4" />

        <div className="py-2">
          <button
            type="button"
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors text-danger"
          >
            <ExclamationTriangleIcon className="w-5 h-5" />
            <span className="text-sm">{t("profile:groupInfo.reportGroup")}</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleLeaveGroup()}
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors text-danger"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span className="text-sm">{t("profile:groupInfo.leaveGroup")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupInfo;
