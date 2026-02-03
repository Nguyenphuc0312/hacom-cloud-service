/**
 * @fileoverview New Chat Modal
 * Modal tìm kiếm và bắt đầu cuộc trò chuyện mới
 */

import React, { useState, useCallback, useEffect } from "react";
import clsx from "clsx";
import {
  MagnifyingGlassIcon,
  UserPlusIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Modal, Input, Button, Spinner, EmptySearchResults } from "../ui";
import { Avatar } from "../common/Avatar";
import { useDebounce } from "../../hooks";
import apiClient from "../../lib/axios";
import { toast } from "../ui";
import type { User as UserType } from "../../types";

interface User {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  status?: UserType["status"];
}

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChat: (userId: string) => void;
  onCreateGroup?: () => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  onStartChat,
  onCreateGroup,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [isGroupMode, setIsGroupMode] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Search users
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setUsers([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiClient.get(
        `/users/search?q=${encodeURIComponent(query)}`,
      );
      setUsers(response.data.data || []);
    } catch {
      toast.error("Không thể tìm kiếm người dùng");
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Trigger search when debounced query changes
  useEffect(() => {
    searchUsers(debouncedQuery);
  }, [debouncedQuery, searchUsers]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setUsers([]);
      setSelectedUsers([]);
      setIsGroupMode(false);
    }
  }, [isOpen]);

  // Handle user click
  const handleUserClick = (user: User) => {
    if (isGroupMode) {
      // Toggle selection in group mode
      setSelectedUsers((prev) =>
        prev.some((u) => u.id === user.id)
          ? prev.filter((u) => u.id !== user.id)
          : [...prev, user],
      );
    } else {
      // Start direct chat
      onStartChat(user.id);
      onClose();
    }
  };

  // Handle create group
  const handleCreateGroup = () => {
    if (selectedUsers.length < 1) {
      toast.error("Chọn ít nhất 1 người để tạo nhóm");
      return;
    }
    // TODO: Open create group modal with selected users
    onCreateGroup?.();
    onClose();
  };

  // Get display name
  const getDisplayName = (user: User) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.username;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cuộc trò chuyện mới"
      description={
        isGroupMode
          ? "Chọn thành viên để tạo nhóm"
          : "Tìm kiếm người dùng để bắt đầu trò chuyện"
      }
      size="md"
    >
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setIsGroupMode(false)}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
              !isGroupMode
                ? "bg-telegram-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
          >
            <UserPlusIcon className="w-5 h-5" />
            Tin nhắn trực tiếp
          </button>
          <button
            onClick={() => setIsGroupMode(true)}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
              isGroupMode
                ? "bg-telegram-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
          >
            <UserGroupIcon className="w-5 h-5" />
            Tạo nhóm
          </button>
        </div>

        {/* Search input */}
        <Input
          type="text"
          placeholder="Tìm kiếm theo tên hoặc username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
          autoFocus
        />

        {/* Selected users (group mode) */}
        {isGroupMode && selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-telegram-primary/10 text-telegram-primary rounded-full text-sm"
              >
                <span>{getDisplayName(user)}</span>
                <button
                  onClick={() =>
                    setSelectedUsers((prev) =>
                      prev.filter((u) => u.id !== user.id),
                    )
                  }
                  className="hover:bg-telegram-primary/20 rounded-full p-0.5"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="max-h-80 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : searchQuery.length > 0 && searchQuery.length < 2 ? (
            <p className="text-center text-gray-500 py-8 text-sm">
              Nhập ít nhất 2 ký tự để tìm kiếm
            </p>
          ) : users.length === 0 && debouncedQuery.length >= 2 ? (
            <EmptySearchResults query={debouncedQuery} />
          ) : (
            <div className="space-y-1">
              {users.map((user) => {
                const isSelected = selectedUsers.some((u) => u.id === user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => handleUserClick(user)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left",
                      isSelected
                        ? "bg-telegram-primary/10"
                        : "hover:bg-gray-100",
                    )}
                  >
                    <Avatar
                      src={user.avatar}
                      alt={getDisplayName(user)}
                      size="md"
                      status={user.status as User["status"]}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {getDisplayName(user)}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        @{user.username}
                      </p>
                    </div>
                    {isGroupMode && (
                      <div
                        className={clsx(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                          isSelected
                            ? "bg-telegram-primary border-telegram-primary"
                            : "border-gray-300",
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Create group button */}
        {isGroupMode && selectedUsers.length > 0 && (
          <Button fullWidth size="lg" onClick={handleCreateGroup}>
            Tạo nhóm ({selectedUsers.length} người)
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default NewChatModal;
