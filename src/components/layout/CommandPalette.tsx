import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { ROUTE_PATHS } from "../../router/paths";
import {
  emitOpenNewChatModal,
  markOpenNewChatIntent,
} from "../../lib/commandPalette";
import { isDirectConversation } from "../../lib/conversationAdapter";
import {
  getConversationDisplayName,
  getMessagePreview,
  getOtherParticipant,
} from "../../utils/messageHelpers";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { useAuthStore, useChatStore, useFriendshipStore } from "../../stores";
import type { Conversation } from "../../types";

type CommandGroup = "navigation" | "actions" | "conversations" | "users";

type CommandIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  description?: string;
  keywords: string[];
  icon: CommandIcon;
  shortcut?: string;
  badge?: string;
  baseScore?: number;
  execute: () => void;
}

interface IndexedCommandItem extends CommandItem {
  index: number;
}

interface GroupBucket {
  id: CommandGroup;
  title: string;
  items: IndexedCommandItem[];
}

interface UserCandidate {
  id: string;
  label: string;
  username?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const GROUP_ORDER: CommandGroup[] = [
  "navigation",
  "actions",
  "conversations",
  "users",
];

const getShortcutForPlatform = (): string => {
  if (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
  ) {
    return "Cmd+K";
  }

  return "Ctrl+K";
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const fuzzyScore = (query: string, target: string): number => {
  const normalizedQuery = normalizeText(query);
  const normalizedTarget = normalizeText(target);

  if (!normalizedQuery) {
    return 1;
  }

  if (!normalizedTarget) {
    return -1;
  }

  if (normalizedTarget === normalizedQuery) {
    return 120;
  }

  if (normalizedTarget.startsWith(normalizedQuery)) {
    return 96;
  }

  const tokenMatch = normalizedTarget
    .split(/\s+/)
    .some((token) => token.startsWith(normalizedQuery));
  if (tokenMatch) {
    return 82;
  }

  const includesIndex = normalizedTarget.indexOf(normalizedQuery);
  if (includesIndex >= 0) {
    return 64 - Math.min(includesIndex, 20);
  }

  let queryIndex = 0;
  let lastMatch = -1;
  let gapPenalty = 0;

  for (
    let i = 0;
    i < normalizedTarget.length && queryIndex < normalizedQuery.length;
    i += 1
  ) {
    if (normalizedTarget[i] !== normalizedQuery[queryIndex]) {
      continue;
    }

    if (lastMatch >= 0) {
      gapPenalty += i - lastMatch - 1;
    }

    lastMatch = i;
    queryIndex += 1;
  }

  if (queryIndex < normalizedQuery.length) {
    return -1;
  }

  return Math.max(16, 52 - gapPenalty);
};

const getConversationKeywords = (conversation: Conversation): string[] => {
  const participants = Array.isArray(conversation.participants)
    ? conversation.participants
    : [];

  return participants.flatMap((participant) => [
    participant.displayName ?? "",
    participant.username ?? "",
  ]);
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const conversations = useChatStore((state) => state.conversations);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const currentUser = useAuthStore((state) => state.user);
  const friends = useFriendshipStore((state) => state.friends);

  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const previousLocationKeyRef = React.useRef(location.key);
  const openShortcut = React.useMemo(() => getShortcutForPlatform(), []);
  const currentUserId = currentUser?.id ?? "";

  const closePalette = React.useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    onClose();
  }, [onClose]);

  const triggerNewChat = React.useCallback(() => {
    markOpenNewChatIntent();

    if (location.pathname.startsWith(ROUTE_PATHS.CHAT)) {
      emitOpenNewChatModal();
      return;
    }

    navigate(ROUTE_PATHS.CHAT);
  }, [location.pathname, navigate]);

  const directConversationByUserId = React.useMemo(() => {
    const map = new Map<string, string>();

    conversations.forEach((conversation) => {
      if (!isDirectConversation(conversation)) {
        return;
      }

      const otherParticipant = getOtherParticipant(conversation, currentUserId);
      if (!otherParticipant?.id) {
        return;
      }

      map.set(otherParticipant.id, conversation.id);
    });

    return map;
  }, [conversations, currentUserId]);

  const userCandidates = React.useMemo(() => {
    const users = new Map<string, UserCandidate>();

    friends.forEach((friend) => {
      if (!friend.id || friend.id === currentUserId) {
        return;
      }
      const fullName = resolveUserDisplayName(friend, {
        allowLegacyFallback: true,
      });

      users.set(friend.id, {
        id: friend.id,
        label: fullName || friend.username,
        username: friend.username,
      });
    });

    conversations.forEach((conversation) => {
      const participants = Array.isArray(conversation.participants)
        ? conversation.participants
        : [];

      participants.forEach((participant) => {
        if (!participant.id || participant.id === currentUserId) {
          return;
        }

        const existing = users.get(participant.id);
        users.set(participant.id, {
          id: participant.id,
          label:
            existing?.label ||
            resolveUserDisplayName(participant, {
              allowLegacyFallback: true,
            }) ||
            participant.username,
          username: existing?.username || participant.username,
        });
      });

      const other = conversation.otherUser;
      if (other?.id && other.id !== currentUserId) {
        const existing = users.get(other.id);
        users.set(other.id, {
          id: other.id,
          label:
            existing?.label ||
            resolveUserDisplayName(other, {
              allowLegacyFallback: true,
            }) ||
            other.username,
          username: existing?.username || other.username,
        });
      }
    });

    return Array.from(users.values()).slice(0, 40);
  }, [conversations, currentUserId, friends]);

  const navigationCommands = React.useMemo<CommandItem[]>(
    () => [
      {
        id: "nav-chat",
        group: "navigation",
        label: t("chat:header.searchInChat"),
        description: t("common:commandPalette.openChatWorkspace"),
        keywords: ["chat", "messages", "home"],
        icon: ChatBubbleLeftRightIcon,
        execute: () => navigate(ROUTE_PATHS.CHAT),
      },
      {
        id: "nav-friends",
        group: "navigation",
        label: t("friends:title"),
        description: t("common:commandPalette.findFriends"),
        keywords: ["friends", "contacts", "users"],
        icon: UserGroupIcon,
        execute: () => navigate(ROUTE_PATHS.FRIENDS),
      },
      {
        id: "nav-settings",
        group: "navigation",
        label: t("settings:pageTitle"),
        description: t("settings:description"),
        keywords: ["settings", "preferences", "theme"],
        icon: Cog6ToothIcon,
        execute: () => navigate(ROUTE_PATHS.SETTINGS),
      },
    ],
    [navigate, t],
  );

  const actionCommands = React.useMemo<CommandItem[]>(
    () => [
      {
        id: "action-new-chat",
        group: "actions",
        label: t("chat:empty.startNewChat"),
        description: t("common:commandPalette.newConversation"),
        keywords: ["new", "chat", "message", "compose"],
        icon: PlusIcon,
        shortcut: openShortcut,
        baseScore: 8,
        execute: triggerNewChat,
      },
    ],
    [openShortcut, t, triggerNewChat],
  );

  const conversationCommands = React.useMemo<CommandItem[]>(
    () =>
      conversations.map((conversation) => {
        const unreadCount = conversation.unreadCount ?? 0;
        const label =
          getConversationDisplayName(conversation, currentUserId) ||
          t("common:labels.conversation");
        const description = conversation.lastMessage
          ? getMessagePreview(conversation.lastMessage, currentUserId, 72)
          : t("sidebar:room.noMessagesYet");

        return {
          id: `conversation:${conversation.id}`,
          group: "conversations",
          label,
          description,
          keywords: getConversationKeywords(conversation),
          icon: ChatBubbleLeftRightIcon,
          badge: unreadCount > 0 ? `${unreadCount}` : undefined,
          baseScore:
            (conversation.isPinned ? 10 : 0) +
            Math.min(18, unreadCount * 3) +
            (conversation.id === useChatStore.getState().selectedConversationId
              ? 4
              : 0),
          execute: () => {
            selectConversation(conversation.id);
            navigate(`${ROUTE_PATHS.CHAT}/${conversation.id}`);
          },
        } satisfies CommandItem;
      }),
    [conversations, currentUserId, navigate, selectConversation, t],
  );

  const userCommands = React.useMemo<CommandItem[]>(
    () =>
      userCandidates.map((candidate) => {
        const directConversationId = directConversationByUserId.get(
          candidate.id,
        );

        return {
          id: `user:${candidate.id}`,
          group: "users",
          label: candidate.label,
          description: directConversationId
            ? t("common:commandPalette.openDirectConversation")
            : t("common:commandPalette.searchInFriends"),
          keywords: [candidate.username ?? "", "user", "person", "friend"],
          icon: UserCircleIcon,
          execute: () => {
            if (directConversationId) {
              selectConversation(directConversationId);
              navigate(`${ROUTE_PATHS.CHAT}/${directConversationId}`);
              return;
            }

            const searchTerm = candidate.username || candidate.label;
            navigate(
              `${ROUTE_PATHS.FRIENDS}?q=${encodeURIComponent(searchTerm)}`,
            );
          },
        } satisfies CommandItem;
      }),
    [
      directConversationByUserId,
      navigate,
      selectConversation,
      t,
      userCandidates,
    ],
  );

  const allCommands = React.useMemo(
    () => [
      ...navigationCommands,
      ...actionCommands,
      ...conversationCommands,
      ...userCommands,
    ],
    [actionCommands, conversationCommands, navigationCommands, userCommands],
  );

  const filteredCommands = React.useMemo(() => {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
      return [
        ...navigationCommands,
        ...actionCommands,
        ...conversationCommands.slice(0, 8),
        ...userCommands.slice(0, 6),
      ];
    }

    return allCommands
      .map((command) => {
        const haystack = [
          command.label,
          command.description ?? "",
          ...command.keywords,
        ].join(" ");
        const score = fuzzyScore(normalizedQuery, haystack);
        return {
          command,
          score: score > 0 ? score + (command.baseScore ?? 0) : -1,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.command)
      .slice(0, 28);
  }, [
    actionCommands,
    allCommands,
    conversationCommands,
    navigationCommands,
    query,
    userCommands,
  ]);

  const groupTitleById = React.useMemo<Record<CommandGroup, string>>(
    () => ({
      navigation: t("common:labels.navigation"),
      actions: t("common:actions.title"),
      conversations: t("common:labels.conversation"),
      users: t("common:labels.people"),
    }),
    [t],
  );

  const groupedCommands = React.useMemo<GroupBucket[]>(() => {
    const buckets: GroupBucket[] = [];
    let indexCursor = 0;

    GROUP_ORDER.forEach((groupId) => {
      const groupItems = filteredCommands
        .filter((command) => command.group === groupId)
        .map((command) => ({
          ...command,
          index: indexCursor++,
        }));

      if (groupItems.length === 0) {
        return;
      }

      buckets.push({
        id: groupId,
        title: groupTitleById[groupId],
        items: groupItems,
      });
    });

    return buckets;
  }, [filteredCommands, groupTitleById]);

  const indexedCommands = React.useMemo(
    () => groupedCommands.flatMap((bucket) => bucket.items),
    [groupedCommands],
  );

  const commandCount = indexedCommands.length;

  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen]);

  const [prevCommandCount, setPrevCommandCount] = React.useState(commandCount);

  if (commandCount !== prevCommandCount) {
    setPrevCommandCount(commandCount);
    if (isOpen) {
      setActiveIndex((current) => {
        if (commandCount === 0) {
          return 0;
        }
        return Math.max(0, Math.min(current, commandCount - 1));
      });
    }
  }

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const activeNode = document.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`,
    );
    activeNode?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      previousLocationKeyRef.current = location.key;
      return;
    }

    if (previousLocationKeyRef.current !== location.key) {
      closePalette();
    }

    previousLocationKeyRef.current = location.key;
  }, [closePalette, isOpen, location.key]);

  const executeCommand = React.useCallback(
    (command: CommandItem) => {
      closePalette();
      command.execute();
    },
    [closePalette],
  );

  const handleInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
        return;
      }

      if (commandCount === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % commandCount);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          current <= 0 ? commandCount - 1 : current - 1,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const activeCommand = indexedCommands[activeIndex];
        if (activeCommand) {
          executeCommand(activeCommand);
        }
      }
    },
    [activeIndex, closePalette, commandCount, executeCommand, indexedCommands],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-modal p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("common:actions.close")}
        className="absolute inset-0 bg-text-primary/45 backdrop-blur-sm"
        onClick={closePalette}
      />

      <div
        className={clsx(
          "relative mx-auto flex h-[min(74vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl",
          "border border-border bg-surface-raised shadow-elev3 animate-slide-up-fade",
        )}
      >
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <label className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
            <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={t("common:commandPalette.searchPlaceholder")}
              className="w-full bg-transparent text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              aria-label={t("common:commandPalette.searchAria")}
            />
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-overlay px-2 py-1 text-caption text-text-muted">
              <span>Esc</span>
            </span>
          </label>
          <p className="mt-2 text-caption text-text-muted">
            {t("common:labels.shortcut")}: {openShortcut}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-3">
          {groupedCommands.length === 0 && (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-muted">
              {t("common:status.empty")}
            </div>
          )}

          {groupedCommands.map((bucket) => (
            <section key={bucket.id} className="py-1">
              <div className="px-2 py-2 text-caption font-medium uppercase tracking-[0.08em] text-text-muted/85">
                {bucket.title}
              </div>

              <div className="space-y-1">
                {bucket.items.map((command) => {
                  const Icon = command.icon;
                  const isActive = command.index === activeIndex;

                  return (
                    <button
                      key={command.id}
                      type="button"
                      data-command-index={command.index}
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-micro",
                        isActive
                          ? "border-primary/30 bg-primary/12 text-text-primary shadow-xs"
                          : "border-transparent text-text-secondary hover:border-border hover:bg-surface-hover hover:text-text-primary",
                      )}
                      onMouseEnter={() => setActiveIndex(command.index)}
                      onClick={() => executeCommand(command)}
                    >
                      <span
                        className={clsx(
                          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                          isActive
                            ? "border-primary/30 bg-primary/15 text-primary"
                            : "border-border/80 bg-surface-overlay text-text-muted",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-medium">
                          {command.label}
                        </span>
                        {command.description && (
                          <span className="block truncate text-caption text-text-muted">
                            {command.description}
                          </span>
                        )}
                      </span>

                      {command.badge && (
                        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary/15 px-1.5 py-0.5 text-caption font-semibold text-primary">
                          {command.badge}
                        </span>
                      )}

                      {command.shortcut && (
                        <span className="rounded-md border border-border bg-surface-overlay px-2 py-1 text-caption text-text-muted">
                          {command.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
