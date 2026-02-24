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
        toast.success("Đã thêm thành viên vào nhóm");
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || "Không thể thêm thành viên");
      } finally {
        setIsSubmitting(false);
      }
    },
    [conversation.id, updateConversation],
  );

  const handleLeaveGroup = useCallback(async () => {
    if (!window.confirm("Bạn có chắc muốn rời nhóm này?")) return;

    setIsSubmitting(true);
    try {
      await conversationApi.leaveConversation(conversation.id);
      removeConversation(conversation.id);
      toast.success("Đã rời nhóm");
      onClose();
      navigate("/chat");
    } catch (error) {
      toast.error("Không thể rời nhóm lúc này");
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [conversation.id, navigate, onClose, removeConversation]);

  return (
    <div className={clsx("flex flex-col h-full bg-white", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Thông tin nhóm</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Đóng"
        >
          <XMarkIcon className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center py-6 px-4">
          <Avatar src={conversation.avatar} alt={conversation.name} size="xl" />

          <div className="mt-4 text-center">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2 justify-center">
              {conversation.name}
              {isAdmin && (
                <button
                  type="button"
                  className="p-1 hover:bg-gray-100 rounded-full"
                >
                  <PencilIcon className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              {conversation.participantCount ?? participants.length} thành viên
            </p>
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        <div className="py-2">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <BellIcon className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-900">Thông báo</span>
            </div>
            <div
              className={clsx(
                "w-10 h-6 rounded-full relative",
                conversation.isMuted ? "bg-gray-300" : "bg-telegram-primary",
              )}
            >
              <div
                className={clsx(
                  "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all",
                  conversation.isMuted ? "left-1" : "right-1",
                )}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        <div className="flex border-b border-gray-200">
          {[
            { id: "members", label: "Thành viên" },
            { id: "media", label: "Phương tiện" },
            { id: "files", label: "Tệp" },
          ].map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={clsx(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-telegram-primary border-b-2 border-telegram-primary"
                  : "text-gray-500 hover:text-gray-700",
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
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors text-telegram-primary"
              >
                <UserPlusIcon className="w-5 h-5" />
                <span className="text-sm font-medium">Thêm thành viên</span>
              </button>

              {showAddMember && (
                <div className="px-4 pb-3 space-y-2">
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm thành viên..."
                    leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
                    disabled={isSubmitting}
                  />
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200">
                    {isSearching ? (
                      <div className="py-4 flex justify-center">
                        <Spinner size="md" />
                      </div>
                    ) : searchResults.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-gray-500">
                        Không có kết quả phù hợp
                      </p>
                    ) : (
                      searchResults.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => void handleAddMember(user.id)}
                          disabled={isSubmitting}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                        >
                          <Avatar
                            src={user.avatar}
                            alt={user.displayName || user.username}
                            size="sm"
                            status={user.status}
                            showStatus
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.displayName || user.username}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
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
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <Avatar
                    src={participant.avatar}
                    alt={participant.displayName || participant.username}
                    size="md"
                    status={participant.status}
                    showStatus
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {participant.displayName || participant.username}
                      {participant.id === currentUserId && (
                        <span className="ml-2 text-xs text-gray-500">
                          (Ban)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
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
                    className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center"
                  >
                    <PhotoIcon className="w-8 h-8 text-gray-300" />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="w-full mt-4 py-2 text-sm text-telegram-primary font-medium hover:bg-gray-50 rounded-lg"
              >
                Xem tat ca phuong tien
              </button>
            </div>
          )}

          {activeTab === "files" && (
            <div className="p-4 text-center text-gray-500 text-sm">
              Chua co tep duoc chia se
            </div>
          )}
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        <div className="py-2">
          <button
            type="button"
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-red-50 transition-colors text-red-500"
          >
            <ExclamationTriangleIcon className="w-5 h-5" />
            <span className="text-sm">Bao cao nhom</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleLeaveGroup()}
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-red-50 transition-colors text-red-500"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span className="text-sm">Roi nhom</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupInfo;
