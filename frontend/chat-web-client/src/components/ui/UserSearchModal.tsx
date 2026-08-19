/**
 * UserSearchModal - Search for users to view their calendar
 */

import React, { useState, useCallback, useEffect } from "react";
import clsx from "clsx";
import { MagnifyingGlassIcon, XMarkIcon, CalendarIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { userApi } from "@/services/api";
import { loadUserProfiles } from "@/services/userBatchLoader";
import { useAuthStore } from "@/stores/authStore";
import { Avatar } from "@/components/common/Avatar";
import { Modal } from "@/components/ui/Modal";
import { resolvePublicResourceUrl } from "@/config";

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (userId: string, userName: string) => void;
}

interface SearchResult {
  id: string;
  displayName: string;
  avatar?: string;
  department?: string;
  company?: string;
}

export const UserSearchModal: React.FC<UserSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectUser,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const currentUser = useAuthStore((s) => s.user);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  const handleSearch = useCallback((searchQuery: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await userApi.searchUsers(searchQuery, 1, 10);
        if (response.success && response.data) {
          const mappedResults: SearchResult[] = response.data
            .filter((user) => user.id !== currentUser?.id) // Exclude self
            .map((user) => ({
              id: user.id,
              displayName:
                user.effectiveDisplayName ||
                user.displayName ||
                user.fullName ||
                user.fullNameFromHR ||
                user.username ||
                user.email ||
                "Unknown User",
              avatar: user.avatar || undefined,
              department: user.departmentName || "",
              company: user.orgUnit || "",
            }));
          setResults(mappedResults);

          // /users/search không trả avatar/công ty đầy đủ → enrich từ /users/batch
          // (giống lịch & bạn bè). Cache nên mở lại tìm kiếm gần như tức thì.
          void loadUserProfiles(mappedResults.map((r) => r.id)).then((profileMap) => {
            setResults((prev) =>
              prev.map((r) => {
                const p = profileMap[r.id];
                if (!p) return r;
                return {
                  ...r,
                  avatar: r.avatar ?? p.avatarUrl ?? undefined,
                  department: r.department || p.department || "",
                  company: r.company || p.company || "",
                };
              }),
            );
          });
        } else {
          setResults([]);
        }
      } catch (error) {
        console.error("Failed to search users:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce
  }, [currentUser?.id]);

  useEffect(() => {
    handleSearch(query);
  }, [query, handleSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (selected) {
        onSelectUser(selected.id, selected.displayName);
        handleClose();
      }
    }
  }, [results, selectedIndex, onSelectUser]);

  const handleClose = () => {
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    onClose();
  };

  const handleSelectUser = (user: SearchResult) => {
    onSelectUser(user.id, user.displayName);
    handleClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Tìm kiếm người để xem lịch"
      size="md"
    >
      <div className="space-y-4">
        {/* Search input */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Nhập tên, email hoặc mã nhân viên..."
            autoFocus
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pl-10 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {results.map((user, index) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelectUser(user)}
                className={clsx(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  index === selectedIndex
                    ? "bg-primary/10"
                    : "hover:bg-surface-hover"
                )}
              >
                <Avatar
                  src={user.avatar ? resolvePublicResourceUrl(user.avatar) : undefined}
                  alt={user.displayName}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {user.displayName}
                  </p>
                  {(user.department || user.company) && (
                    <p className="truncate text-xs text-text-muted">
                      {[user.department, user.company].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <CalendarIcon className="h-5 w-5 shrink-0 text-text-muted" />
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query && !isLoading && results.length === 0 && (
          <div className="py-8 text-center">
            <UserCircleIcon className="mx-auto h-12 w-12 text-text-muted" />
            <p className="mt-2 text-sm text-text-secondary">
              Không tìm thấy người dùng nào
            </p>
            <p className="text-xs text-text-muted">
              Thử tìm kiếm với từ khóa khác
            </p>
          </div>
        )}

        {/* Hint */}
        {!query && (
          <div className="py-4 text-center">
            <p className="text-sm text-text-muted">
              Nhập tên, email hoặc mã nhân viên để tìm kiếm
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default UserSearchModal;
