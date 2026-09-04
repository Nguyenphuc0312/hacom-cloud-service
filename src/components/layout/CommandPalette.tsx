import React from "react";
import { flushSync } from "react-dom";
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
import { resolvePublicResourceUrl } from "../../config";
import { Avatar } from "../common/Avatar";
import {
  emitOpenNewChatModal,
  markOpenNewChatIntent,
} from "../../lib/commandPalette";
import { isDirectConversation } from "../../lib/conversationAdapter";
import {
  getConversationAvatar,
  getConversationDisplayName,
  getMessagePreview,
  getOtherParticipant,
} from "../../utils/messageHelpers";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { useAuthStore, useChatStore, useFriendshipStore } from "../../stores";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { scoreSearchMatch } from "../../utils/contactSearchMatch";
import { dispatchStartDirectMessage } from "../../features/chat/events/chatUiEvents";

type CommandGroup = "navigation" | "actions" | "conversations" | "users";

type CommandIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  description?: string;
  keywords: string[];
  icon: CommandIcon;
  /** For conversation/user rows: show a real avatar (with initials fallback)
   *  instead of the generic icon. Resolved to a public URL, may be undefined. */
  avatarSrc?: string;
  showAvatar?: boolean;
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
  searchTerms: string[];
  username?: string;
  avatar?: string;
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
  const friendByUserId = useFriendshipStore((state) => state.friendByUserId);
  const nameByUserId = useEnrichedProfileStore((s) => s.nameByUserId);

  // "tên gợi nhớ" (alias) resolution — same priority the sidebar uses
  // (RoomItem): the authoritative friend-index alias wins, then the enriched
  // name injection, then whatever real-name fallback the caller has.
  const resolveAliasName = React.useCallback(
    (userId: string | undefined, fallback: string): string => {
      if (!userId) {
        return fallback;
      }
      return friendByUserId[userId]?.alias || nameByUserId[userId] || fallback;
    },
    [friendByUserId, nameByUserId],
  );

  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const previousLocationKeyRef = React.useRef(location.key);
  const [highlight, setHighlight] = React.useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    visible: false,
  });
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
      const realName =
        resolveUserDisplayName(friend, { allowLegacyFallback: true }) ||
        friend.username;
      const label = friend.alias || nameByUserId[friend.id] || realName;

      users.set(friend.id, {
        id: friend.id,
        label,
        searchTerms: [
          friend.alias ?? "",
          nameByUserId[friend.id] ?? "",
          realName,
          friend.fullName ?? "",
          friend.username,
          friend.employeeCode ?? friend.employee_code ?? "",
          friend.departmentName ?? "",
          friend.unitCode ?? "",
          friend.title ?? "",
        ],
        username: friend.username,
        avatar: friend.avatar,
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
          searchTerms: [
            ...(existing?.searchTerms ?? []),
            participant.displayName ?? "",
            participant.username ?? "",
          ],
          username: existing?.username || participant.username,
          avatar: existing?.avatar || participant.avatar,
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
          searchTerms: [
            ...(existing?.searchTerms ?? []),
            other.displayName ?? "",
            other.username ?? "",
          ],
          username: existing?.username || other.username,
          avatar: existing?.avatar || other.avatar,
        });
      }
    });

    return Array.from(users.values());
  }, [conversations, currentUserId, friends, nameByUserId]);

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
        const baseName =
          getConversationDisplayName(conversation, currentUserId) ||
          t("common:labels.conversation");
        // DM rows honour the partner's alias; groups keep their real name.
        const partnerId = isDirectConversation(conversation)
          ? getOtherParticipant(conversation, currentUserId)?.id
          : undefined;
        const label = resolveAliasName(partnerId, baseName);
        const description = conversation.lastMessage
          ? getMessagePreview(conversation.lastMessage, currentUserId, 72)
          : t("sidebar:room.noMessagesYet");

        return {
          id: `conversation:${conversation.id}`,
          group: "conversations",
          label,
          description,
          keywords: [baseName, label],
          icon: ChatBubbleLeftRightIcon,
          showAvatar: true,
          avatarSrc:
            resolvePublicResourceUrl(
              getConversationAvatar(conversation, currentUserId),
            ) ?? undefined,
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
    [
      conversations,
      currentUserId,
      navigate,
      resolveAliasName,
      selectConversation,
      t,
    ],
  );

  const userCommands = React.useMemo<CommandItem[]>(
    () =>
      userCandidates.map((candidate) => {
        const directConversationId = directConversationByUserId.get(
          candidate.id,
        );
        const displayName = resolveAliasName(candidate.id, candidate.label);

        return {
          id: `user:${candidate.id}`,
          group: "users",
          label: displayName,
          description: directConversationId
            ? t("common:commandPalette.openDirectConversation")
            : t("common:commandPalette.newConversation"),
          keywords: [
            candidate.label,
            displayName,
            ...candidate.searchTerms,
            candidate.username ?? "",
            "user",
            "person",
            "friend",
          ],
          icon: UserCircleIcon,
          showAvatar: true,
          avatarSrc: resolvePublicResourceUrl(candidate.avatar) ?? undefined,
          execute: () => {
            if (directConversationId) {
              selectConversation(directConversationId);
              navigate(`${ROUTE_PATHS.CHAT}/${directConversationId}`);
              return;
            }

            dispatchStartDirectMessage({ userId: candidate.id });
          },
        } satisfies CommandItem;
      }),
    [
      directConversationByUserId,
      navigate,
      resolveAliasName,
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
    const normalizedQuery = query.trim();

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
        const includeDescription =
          command.group === "navigation" || command.group === "actions";
        const score = scoreSearchMatch(normalizedQuery, [
          command.label,
          includeDescription ? command.description : "",
          ...command.keywords,
        ]);
        return {
          command,
          score: score >= 0 ? score + (command.baseScore ?? 0) : -1,
        };
      })
      .filter((entry) => entry.score >= 0)
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
  // Keep the palette mounted through its exit animation: "open" while visible,
  // "closing" while the exit keyframe plays, "closed" once fully unmounted.
  const [phase, setPhase] = React.useState<"open" | "closing" | "closed">(
    isOpen ? "open" : "closed",
  );

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setPhase("open");
      setQuery("");
      setActiveIndex(0);
    } else {
      setPhase((current) => (current === "closed" ? "closed" : "closing"));
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

  // Keep the active row in view AND position the gliding highlight pill. Both
  // must happen in one layout pass: scrollIntoView mutates scrollTop, and the
  // pill's offset is measured relative to that same (post-scroll) scroll state.
  React.useLayoutEffect(() => {
    if (phase === "closed") {
      return;
    }

    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const activeNode = container.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`,
    );
    if (!activeNode) {
      setHighlight((current) => ({ ...current, visible: false }));
      return;
    }

    activeNode.scrollIntoView({ block: "nearest" });

    // offset* are layout values relative to the positioned scroll container and,
    // unlike getBoundingClientRect, are immune to the panel's entrance scale
    // transform — so the pill is sized correctly even measured mid-animation.
    setHighlight({
      top: activeNode.offsetTop,
      left: activeNode.offsetLeft,
      width: activeNode.offsetWidth,
      height: activeNode.offsetHeight,
      visible: true,
    });
  }, [activeIndex, groupedCommands, phase]);

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
      const run = () => {
        closePalette();
        command.execute();
      };

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      // Dissolve the palette into its destination via the View Transitions API.
      // flushSync commits the close+navigate inside the transition so the old
      // snapshot (palette up) crossfades to the new one. Unsupported → plain run.
      if (
        !prefersReducedMotion &&
        typeof document !== "undefined" &&
        "startViewTransition" in document
      ) {
        document.startViewTransition(() => flushSync(run));
        return;
      }

      run();
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

  if (phase === "closed") {
    return null;
  }

  const isClosing = phase === "closing";

  return (
    <div
      className="fixed inset-0 z-modal p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("common:actions.close")}
        className={clsx(
          "absolute inset-0 bg-text-primary/45 backdrop-blur-sm",
          isClosing ? "cmdk-overlay-out" : "cmdk-overlay-in",
        )}
        onClick={closePalette}
      />

      <div
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && phase === "closing") {
            setPhase("closed");
          }
        }}
        className={clsx(
          "relative mx-auto flex h-[min(74vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl",
          "border border-border bg-surface-raised shadow-elev3 origin-center",
          isClosing ? "cmdk-panel-out" : "cmdk-panel-in",
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
              <span>{t("common:shortcut.esc")}</span>
            </span>
          </label>
          <p className="mt-2 text-caption text-text-muted">
            {t("common:labels.shortcut")}: {openShortcut}
          </p>
        </div>

        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto px-2 py-2 sm:px-3"
        >
          <div
            aria-hidden="true"
            className="cmdk-highlight pointer-events-none absolute left-0 top-0 rounded-xl border border-primary/30 bg-primary/12 shadow-xs"
            style={{
              transform: `translate3d(${highlight.left}px, ${highlight.top}px, 0)`,
              width: highlight.width,
              height: highlight.height,
              opacity: highlight.visible ? 1 : 0,
            }}
          />

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
                        "relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-micro",
                        isActive
                          ? "border-transparent bg-transparent text-text-primary"
                          : "border-transparent text-text-secondary hover:border-border hover:bg-surface-hover hover:text-text-primary",
                      )}
                      onMouseEnter={() => setActiveIndex(command.index)}
                      onClick={() => executeCommand(command)}
                    >
                      {command.showAvatar ? (
                        <Avatar
                          src={command.avatarSrc}
                          alt={command.label}
                          size="sm"
                          className="shrink-0"
                        />
                      ) : (
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
                      )}

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
