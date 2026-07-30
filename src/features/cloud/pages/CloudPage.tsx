import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChatHeader } from "../../../components/chat/ChatHeader";
import { MessageInput } from "../../../components/input/MessageInput";
import { ConversationLane } from "../../../components/layout/ConversationLane";
import { Sidebar } from "../../../components/layout/Sidebar";
import { InlineNotice, toast } from "../../../components/ui";
import { SimpleVirtualizedChatTimeline } from "../../chat/simple-virtual-timeline";
import { useResponsive } from "../../../responsive/responsive";
import { AppShell, ModuleSidebar } from "../../../shared/layout";
import { useAuthStore } from "../../../stores/authStore";
import { useChatStore } from "../../../stores/chatStore";
import {
  RoomType,
  UserStatus,
  type Conversation,
  type Message,
  type UserSummary,
} from "../../../types";
import { resolveChatLayoutProfile } from "../../../utils/densityPolicy";
import { useEnrichedProfileStore } from "../../../stores/enrichedProfileStore";
import {
  CLOUD_CONVERSATION_ID,
  CLOUD_MAX_UPLOAD_BYTES,
} from "../constants";
import {
  CloudConversationAvatar,
  CloudConversationEntry,
} from "../components/CloudConversationEntry";
import { useCloudWorkspace } from "../hooks/useCloudWorkspace";
import { cloudItemsToMessages } from "../utils/cloudMessageAdapter";
import { formatBytes } from "../utils/cloudFormat";
import "../styles/cloud.css";

const getErrorTranslationKey = (code: string): string => {
  switch (code) {
    case "DEMO_USER_REQUIRED":
    case "CLOUD_USER_MISSING":
      return "errors.user";
    case "QUOTA_EXCEEDED":
      return "errors.quota";
    case "FILE_TOO_LARGE":
      return "errors.fileTooLarge";
    case "DRIVE_NOT_ACTIVE":
      return "errors.driveInactive";
    case "OBJECT_UPLOAD_NETWORK_ERROR":
    case "CLOUD_NETWORK_ERROR":
    case "CLOUD_UNAVAILABLE":
      return "errors.offline";
    default:
      return "errors.generic";
  }
};

const stripRichText = (value: string): string =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

const isStandaloneHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.toString().length > 0
    );
  } catch {
    return false;
  }
};

export default function CloudPage() {
  const { t } = useTranslation("cloud");
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const { width, chatLayoutBreakpoint } = useResponsive();
  const [draft, setDraft] = useState("");
  const [draftResetKey, setDraftResetKey] = useState(0);
  const [search, setSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const workspace = useCloudWorkspace(authUser?.id);
  const fetchConversations = useChatStore((state) => state.fetchConversations);
  const hasFetchedConversationsOnce = useChatStore(
    (state) => state.hasFetchedConversationsOnce,
  );
  const isLoadingConversations = useChatStore(
    (state) => state.isLoadingConversations,
  );
  const conversationsError = useChatStore(
    (state) => state.conversationsError,
  );

  const currentUser = useMemo<UserSummary>(() => {
    if (authUser) {
      return {
        id: authUser.id,
        username: authUser.username,
        displayName:
          authUser.displayName ||
          authUser.effectiveDisplayName ||
          authUser.username,
        avatar: authUser.avatar,
        status: authUser.status as UserStatus,
        isBot: false,
      };
    }

    return {
      id: "auth-pending",
      username: "user",
      displayName: "Người dùng",
      avatar: "",
      status: UserStatus.ONLINE,
      isBot: false,
    };
  }, [authUser]);

  useLayoutEffect(() => {
    useEnrichedProfileStore
      .getState()
      .setEnrichedName(
        currentUser.id,
        currentUser.displayName || currentUser.username,
      );
  }, [currentUser.displayName, currentUser.id, currentUser.username]);

  useEffect(() => {
    if (
      !authUser ||
      hasFetchedConversationsOnce ||
      isLoadingConversations
    ) {
      return;
    }
    void fetchConversations();
  }, [
    authUser,
    fetchConversations,
    hasFetchedConversationsOnce,
    isLoadingConversations,
  ]);

  const layoutState =
    chatLayoutBreakpoint === "compact" ? "mobile" : "normal";
  const layoutProfile = resolveChatLayoutProfile(width, layoutState);

  const conversation = useMemo<Conversation>(
    () => ({
      id: CLOUD_CONVERSATION_ID,
      type: RoomType.GROUP,
      name: t("workspace.title"),
      avatar: null,
      unreadCount: 0,
      isPinned: true,
      isMuted: false,
      isArchived: false,
      isBlocked: false,
      participants: [currentUser],
      participantCount: 1,
      createdBy: currentUser.id,
      currentUserId: currentUser.id,
      canCurrentUserSend: true,
      createdAt: new Date(0),
      updatedAt: new Date(),
    }),
    [currentUser, t],
  );

  const messages = useMemo(
    () =>
      cloudItemsToMessages(workspace.items, currentUser, {
        link: t("item.untitledLink"),
        file: t("item.untitledFile"),
      }),
    [currentUser, t, workspace.items],
  );

  const visibleMessages = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return messages;
    return messages.filter((message) => {
      const attachmentNames =
        message.attachments
          ?.map((attachment) => attachment.fileName ?? "")
          .join(" ") ?? "";
      return `${message.plainText ?? message.content} ${attachmentNames}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [messages, search]);

  const showPhaseNotice = useCallback(() => {
    toast.info(t("workspace.phaseAction"));
  }, [t]);

  const handleSend = useCallback(
    async (rawContent?: string) => {
      const content = stripRichText(rawContent ?? "");
      if (!content) return;
      if (isStandaloneHttpUrl(content)) {
        await workspace.createLink(content, "");
        toast.success(t("toast.linkCreated"));
      } else {
        await workspace.createText(content);
        toast.success(t("toast.textCreated"));
      }
      setDraft("");
      setDraftResetKey((value) => value + 1);
    },
    [t, workspace],
  );

  const handleAddFiles = useCallback(
    (files: File[]) => {
      const accepted: File[] = [];
      const errors: string[] = [];
      files.forEach((file) => {
        if (file.size <= 0) {
          errors.push(t("composer.errors.emptyFile"));
        } else if (file.size > CLOUD_MAX_UPLOAD_BYTES) {
          errors.push(t("composer.errors.fileTooLarge"));
        } else {
          accepted.push(file);
        }
      });

      if (accepted.length > 0) {
        void (async () => {
          for (const file of accepted) {
            try {
              await workspace.uploadFile(file);
              toast.success(t("toast.uploadStarted"));
            } catch {
              // The canonical API error is rendered above the composer.
              break;
            }
          }
        })();
      }
      return { errors };
    },
    [t, workspace],
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      navigate(`/chat/${conversationId}`);
    },
    [navigate],
  );

  const noopMessageAction = useCallback((_message: Message) => {
    void _message;
    showPhaseNotice();
  }, [showPhaseNotice]);

  const noopMessageIdAction = useCallback((_messageId: string) => {
    void _messageId;
    showPhaseNotice();
  }, [showPhaseNotice]);

  return (
    <AppShell
      className="chat-page-shell cloud-chat-page"
      data-chat-layout-state={layoutState}
      moduleSidebar={
        <ModuleSidebar
          className="chat-page-module-sidebar cloud-chat-module-sidebar"
          contentClassName="min-h-0"
        >
          <div className="h-full min-h-0 w-full">
            <Sidebar
              layoutState={layoutState}
              currentUser={currentUser}
              selectedId={CLOUD_CONVERSATION_ID}
              leadingContent={
                <CloudConversationEntry
                  items={workspace.items}
                  isActive
                  onSelect={() => undefined}
                />
              }
              showConversationSkeleton={
                isLoadingConversations &&
                !hasFetchedConversationsOnce
              }
              conversationsError={conversationsError}
              onSelectConversation={handleSelectConversation}
              onRetryConversations={() => void fetchConversations()}
              onCurrentUserClick={() => navigate("/settings")}
            />
          </div>
        </ModuleSidebar>
      }
    >
      <section className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          className="chat-background chat-shell relative flex min-w-0 flex-1 flex-col overflow-hidden"
          data-chat-layout-profile={layoutProfile}
          data-chat-layout-state={layoutState}
        >
          <ChatHeader
            conversation={conversation}
            currentUserId={currentUser.id}
            titleOverride={t("workspace.title")}
            subtitleOverride={t("workspace.onlyYou")}
            avatarOverride={<CloudConversationAvatar size="sm" />}
            onBack={() => navigate("/chat")}
            onInfoClick={showPhaseNotice}
            onSearchClick={() => setIsSearchOpen((value) => !value)}
            onPinnedClick={showPhaseNotice}
          />

          {isSearchOpen ? (
            <div className="border-b border-border/60 bg-surface py-2">
              <ConversationLane>
                <label className="relative block">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden
                  />
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("search.placeholder")}
                    aria-label={t("search.aria")}
                    className="input-surface h-9 w-full pl-9 pr-9 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setIsSearchOpen(false);
                    }}
                    className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover"
                    aria-label={t("common.close")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </label>
              </ConversationLane>
            </div>
          ) : null}

          {workspace.error ? (
            <ConversationLane className="pt-3">
              <InlineNotice
                tone="error"
                message={t(getErrorTranslationKey(workspace.error.code))}
                dismissible
                onDismiss={workspace.clearError}
                action={
                  workspace.error.requestId ? (
                    <span className="font-mono text-[10px] opacity-75">
                      {workspace.error.requestId.slice(0, 8)}
                    </span>
                  ) : undefined
                }
              />
            </ConversationLane>
          ) : null}

          <SimpleVirtualizedChatTimeline
            conversationId={CLOUD_CONVERSATION_ID}
            conversationType={conversation.type}
            currentUserId={currentUser.id}
            messages={visibleMessages}
            onReply={noopMessageAction}
            onReact={noopMessageIdAction}
            onForward={noopMessageAction}
            onPin={noopMessageIdAction}
            onEdit={noopMessageAction}
            onDelete={noopMessageIdAction}
            hasMore={Boolean(workspace.nextCursor)}
            isLoadingMore={workspace.isLoadingMore}
            isInitialLoading={workspace.isLoading}
            onLoadMore={() => workspace.loadMore()}
            density="comfortable"
            layoutState={layoutState}
            selectedMessageIds={new Set()}
            className="min-h-0 flex-1"
          />

          {workspace.uploadProgress ? (
            <div className="cloud-chat-upload" role="status" aria-live="polite">
              <ConversationLane>
                <div className="cloud-chat-upload__pill">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {workspace.uploadProgress.fileName}
                  </span>
                  <span className="shrink-0 font-semibold text-[#1565C0]">
                    {workspace.uploadProgress.stage === "uploading"
                      ? `${workspace.uploadProgress.percent}%`
                      : t(`upload.stage.${workspace.uploadProgress.stage}`)}
                  </span>
                </div>
              </ConversationLane>
            </div>
          ) : null}

          <div className="sticky bottom-0 z-sticky shrink-0">
            <MessageInput
              value={draft}
              valueResetKey={draftResetKey}
              onChange={setDraft}
              onSend={handleSend}
              mode="normal"
              conversationId={CLOUD_CONVERSATION_ID}
              conversationType="direct"
              currentUserId={currentUser.id}
              sendOnEnter
              disabled={workspace.isMutating}
              submitDisabled={workspace.isMutating}
              attachmentsDisabled={workspace.isMutating}
              disabledReason={
                workspace.isMutating
                  ? t("workspace.saving", {
                      size: workspace.uploadProgress
                        ? formatBytes(
                            workspace.quota?.reservedBytes ?? 0,
                          )
                        : "",
                    })
                  : undefined
              }
              composerMode="online"
              conversationName={t("workspace.title")}
              onAddFiles={handleAddFiles}
            />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
