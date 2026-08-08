import React, { useState, useEffect, useRef, useCallback } from "react";
import clsx from "clsx";
import { useClickOutside } from "../../../hooks";
import { MagnifyingGlassIcon, XMarkIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { searchUsersUseCase } from "../../chat/usecases/searchUsers";
import { resolvePublicResourceUrl } from "../../../config";
import { SafeImage } from "../../../components/common/SafeImage";
import { getInitials } from "../../../utils/mediaFallback";

export interface AssigneeUser {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface AssigneePickerProps {
  value: AssigneeUser | null;
  onChange: (user: AssigneeUser | null) => void;
  currentUserId?: string;
  currentUserName?: string;
}

function getUserLabel(u: { username: string; firstName?: string | null; lastName?: string | null; displayName?: string | null; effectiveDisplayName?: string | null }): string {
  if (u.effectiveDisplayName) return u.effectiveDisplayName;
  if (u.displayName) return u.displayName;
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return full || u.username;
}

export const AssigneePicker: React.FC<AssigneePickerProps> = ({
  value,
  onChange,
  currentUserId,
  currentUserName,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssigneeUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setIsLoading(true);
    try {
      const res = await searchUsersUseCase(q, 1, 10, { includeSelf: true });
      const users: AssigneeUser[] = (res.success ? res.data : []).map((u: {
        id: string; username: string; firstName?: string | null; lastName?: string | null;
        displayName?: string | null; effectiveDisplayName?: string | null; avatar?: string | null;
      }) => ({
        id: u.id,
        displayName: getUserLabel(u),
        avatar: u.avatar ?? null,
      }));
      setResults(users);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  useClickOutside(containerRef, () => setIsOpen(false));

  const handleSelect = (user: AssigneeUser) => {
    onChange(user);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  const handleSelf = () => {
    if (currentUserId && currentUserName) {
      onChange({ id: currentUserId, displayName: currentUserName, avatar: null });
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2">
          <AssigneeAvatar user={value} size={6} />
          <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{value.displayName}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            placeholder="Tìm người phụ trách..."
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {!value && isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-52 overflow-y-auto">
          {currentUserId && !query && (
            <button
              type="button"
              onClick={handleSelf}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            >
              <UserCircleIcon className="h-5 w-5" />
              Giao cho tôi
            </button>
          )}

          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-400">Đang tìm...</div>
          )}

          {!isLoading && query && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">Không có kết quả</div>
          )}

          {results.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelect(user)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <AssigneeAvatar user={user} size={6} />
              <span className="text-gray-900 dark:text-gray-100">{user.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const AssigneeAvatar: React.FC<{ user: { displayName: string; avatar: string | null }; size?: number }> = ({
  user,
  size = 6,
}) => {
  const avatarUrl = user.avatar ? resolvePublicResourceUrl(user.avatar, { context: 'image' }) : undefined;
  const initials = getInitials(user.displayName);
  const sizeClass = `h-${size} w-${size}`;
  const fallback = (
    <div className={clsx(sizeClass, 'rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xs font-medium text-indigo-700 dark:text-indigo-300')}>
      {initials || <UserCircleIcon className="h-4 w-4" />}
    </div>
  );

  return (
    <SafeImage
      src={avatarUrl}
      alt={user.displayName}
      className={clsx(sizeClass, 'rounded-full object-cover')}
      fallback={fallback}
    />
  );
};
