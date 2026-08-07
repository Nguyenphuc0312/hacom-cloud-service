import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChatHeader } from "../../../components/chat/ChatHeader";
import { MessageInput } from "../../../components/input/MessageInput";
import { ConversationLane } from "../../../components/layout/ConversationLane";
import { Sidebar } from "../../../components/layout/Sidebar";
import {
  ImagePreviewModal,
  type GalleryImage,
} from "../../../components/modals/ImagePreviewModal";
import { VideoPlayerModal } from "../../../components/info/shared-resources/VideoPlayerModal";
import { InlineNotice, toast } from "../../../components/ui";
import { SimpleVirtualizedChatTimeline } from "../../chat/simple-virtual-timeline";
import { useResponsive } from "../../../responsive/responsive";
import { AppShell, ModuleSidebar } from "../../../shared/layout";
import { useAuthStore } from "../../../stores/authStore";
import { useChatStore } from "../../../stores/chatStore";
import {
  RoomType,
  UserStatus,
  type Attachment,
  type Conversation,
  type ImageClickPayload,
  type Message,
  type UserSummary,
} from "../../../types";
import { resolveChatLayoutProfile } from "../../../utils/densityPolicy";
import { useEnrichedProfileStore } from "../../../stores/enrichedProfileStore";
import { CLOUD_CONVERSATION_ID, CLOUD_MAX_UPLOAD_BYTES } from "../constants";
import {
  CloudConversationAvatar,
  CloudConversationEntry,
} from "../components/CloudConversationEntry";
import { CloudDeleteDialog } from "../components/CloudDeleteDialog";
import { CloudQuotaRequestDialog } from "../components/CloudQuotaRequestDialog";
import { CloudTrashTimeline } from "../components/CloudTrashTimeline";
import { CloudFilePreviewModal } from "../components/CloudFilePreviewModal";
import { CloudConversationInfoPanel } from "../components/CloudConversationInfoPanel";
import { useCloudWorkspace } from "../hooks/useCloudWorkspace";
import type { CloudFilter, CloudItem, CloudViewMode } from "../types";
import { cloudItemsToMessages } from "../utils/cloudMessageAdapter";
import {
  formatBytes,
  getCloudItemPreview,
  getCloudItemTitle,
} from "../utils/cloudFormat";
import { resolveCloudUserId } from "../utils/cloudIdentity";
import { shouldPromptQuotaRequest } from "../utils/cloudQuota";
import { getCachedCloudFileAccess } from "../utils/cloudFileAccessCache";
import { downloadResourceWithName } from "../../../utils/downloadFile";
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
    case "ITEM_NOT_READY":
      return "errors.itemNotReady";
    case "TRASH_EXPIRED":
      return "errors.trashExpired";
    case "INVALID_QUOTA_TIER":
      return "errors.invalidQuotaTier";
    case "QUOTA_REQUEST_PENDING":
      return "errors.quotaRequestPending";
    case "IDEMPOTENCY_CONFLICT":
      return "errors.idempotencyConflict";
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

const getCloudItemIdFromAttachment = (
  attachment: Attachment,
): string | undefined => {
  const objectKey = attachment.objectKey ?? "";
  if (!objectKey.startsWith("cloud:")) return undefined;
  const parts = objectKey.split(":");
  return parts.length >= 3 ? parts.at(-1) || undefined : undefined;
};

export default function CloudPage() {
  const { t } = useTranslation("cloud");
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const { width, chatLayoutBreakpoint } = useResponsive();
  const [draft, setDraft] = useState("");
  const [draftResetKey, setDraftResetKey] = useState(0);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<CloudFilter>("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<CloudViewMode>("active");
  const [deleteTarget, setDeleteTarget] = useState<CloudItem | null>(null);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isQuotaRequestOpen, setIsQuotaRequestOpen] = useState(false);
  const [videoPreview, setVideoPreview] = useState<{
    url: string;
    fileName?: string;
  } | null>(null);
  const [imagePreview, setImagePreview] =
    useState<ImageClickPayload | null>(null);
  const [filePreview, setFilePreview] = useState<{
    url: string;
    fileName?: string;
    contentType?: string;
    itemId?: string;
  } | null>(null);
  const cloudUserId = resolveCloudUserId(authUser?.id);
  const workspace = useCloudWorkspace(cloudUserId, deferredSearch, filter);
  const showQuotaRequest =
    shouldPromptQuotaRequest(workspace.quota, workspace.quotaRequest) ||
    workspace.quotaRequest?.status === "pending";
  const fetchConversations = useChatStore((state) => state.fetchConversations);
  const hasFetchedConversationsOnce = useChatStore(
    (state) => state.hasFetchedConversationsOnce,
  );
  const isLoadingConversations = useChatStore(
    (state) => state.isLoadingConversations,
  );
  const conversationsError = useChatStore((state) => state.conversationsError);

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
      id: cloudUserId ?? "auth-pending",
      username: "user",
      displayName: "Ng??i d?ng",
      avatar: "",
      status: UserStatus.ONLINE,
      isBot: false,
    };
  }, [authUser, cloudUserId]);

  useLayoutEffect(() => {
    useEnrichedProfileStore
      .getState()
      .setEnrichedName(
        currentUser.id,
        currentUser.displayName || currentUser.username,
      );
  }, [currentUser.displayName, currentUser.id, currentUser.username]);

  useEffect(() => {
    if (!authUser || hasFetchedConversationsOnce || isLoadingConversations) {
      return;
    }
    void fetchConversations();
  }, [
    authUser,
    fetchConversations,
    hasFetchedConversationsOnce,
    isLoadingConversations,
  ]);

  useEffect(() => {
    if (workspace.error?.code === "QUOTA_EXCEEDED") {
      setIsQuotaRequestOpen(true);
    }
  }, [workspace.error?.code]);

  const pageLayoutState =
    chatLayoutBreakpoint === "compact"
      ? "mobile"
      : isInfoPanelOpen && chatLayoutBreakpoint === "wide"
        ? "with-panel"
        : "normal";
  // ChatWindow deliberately keeps the content density at the normal profile
  // while a docked inspector is open. Cloud must follow the same rule; using
  // `with-panel` here capped the timeline lane at 39rem and made My Documents
  // look narrower than a regular Chat conversation.
  const contentLayoutState =
    chatLayoutBreakpoint === "compact" ? "mobile" : "normal";
  const layoutProfile = resolveChatLayoutProfile(width, contentLayoutState);

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

  // Cloud media is rendered by the same MessageBodyRenderer as a regular
  // conversation. Build the gallery from the hydrated workspace items so a
  // click in the timeline opens the exact Chat/Zalo-style viewer (counter,
  // filmstrip, zoom, rotate, download and keyboard navigation), while keeping
  // the owner metadata shown in the viewer footer.
  const cloudImageGallery = useMemo<GalleryImage[]>(
    () =>
      [...(viewMode === "trash" ? workspace.trashItems : workspace.items)]
        .filter(
          (item) =>
            item.type === "image" &&
            item.status === "ready" &&
            Boolean(item.accessUrl),
        )
        .sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime(),
        )
        .map((item) => ({
          url: item.accessUrl!,
          alt: getCloudItemTitle(item, {
            text: t("item.untitledText"),
            link: t("item.untitledLink"),
            file: t("item.untitledFile"),
          }),
          senderName: currentUser.displayName,
          senderAvatar: currentUser.avatar,
          sentAt: item.createdAt,
          groupKey: item.id,
        })),
    [
      currentUser.avatar,
      currentUser.displayName,
      t,
      viewMode,
      workspace.items,
      workspace.trashItems,
    ],
  );

  const handleImagePreview = useCallback(
    (payload: ImageClickPayload) => {
      const index = cloudImageGallery.findIndex(
        (image) =>
          image.groupKey === payload.groupKey || image.url === payload.url,
      );
      setImagePreview({
        ...payload,
        initialIndex: index >= 0 ? index : cloudImageGallery.length,
      });
    },
    [cloudImageGallery],
  );

  const previewGallery = useMemo<GalleryImage[]>(() => {
    if (!imagePreview) return cloudImageGallery;
    const hasCurrentImage = cloudImageGallery.some(
      (image) =>
        image.groupKey === imagePreview.groupKey ||
        image.url === imagePreview.url,
    );
    if (hasCurrentImage) return cloudImageGallery;
    return [
      ...cloudImageGallery,
      {
        url: imagePreview.url,
        alt: imagePreview.alt,
        senderName: imagePreview.senderName ?? currentUser.displayName,
        senderAvatar: imagePreview.senderAvatar ?? currentUser.avatar,
        sentAt: imagePreview.sentAt,
        groupKey: imagePreview.groupKey,
      },
    ];
  }, [cloudImageGallery, currentUser.avatar, currentUser.displayName, imagePreview]);

  const previewInitialIndex = useMemo(() => {
    if (!imagePreview || previewGallery.length === 0) return 0;
    const index = previewGallery.findIndex(
      (image) =>
        image.groupKey === imagePreview.groupKey ||
        image.url === imagePreview.url,
    );
    return index >= 0 ? index : imagePreview.initialIndex ?? 0;
  }, [imagePreview, previewGallery]);

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

  const visibleTrashItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return workspace.trashItems;
    return workspace.trashItems.filter((item) => {
      const title = getCloudItemTitle(item, {
        text: t("item.untitledText"),
        link: t("item.untitledLink"),
        file: t("item.untitledFile"),
      });
      return `${title} ${getCloudItemPreview(item)}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [search, t, workspace.trashItems]);

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

  const handleSendAudio = useCallback(
    async (file: File) => {
      await workspace.uploadFile(file);
    },
    [workspace],
  );

  const resolveCloudAttachmentUrl = useCallback(
    async (attachment: Attachment, force = false): Promise<string | undefined> => {
      const objectKey = attachment.objectKey ?? "";
      if (cloudUserId && objectKey.startsWith("cloud:")) {
        const itemId = getCloudItemIdFromAttachment(attachment);
        if (itemId) {
          const access = await getCachedCloudFileAccess(cloudUserId, itemId, {
            force,
          });
          return access.url;
        }
      }
      return attachment.url ?? attachment.downloadUrl;
    },
    [cloudUserId],
  );

  const handleFilePreview = useCallback(
    (attachment: Attachment) => {
      void resolveCloudAttachmentUrl(attachment).then((url) => {
        if (!url) return;
        const isVideo =
          attachment.mimeType?.startsWith("video/") === true ||
          /\.(?:mp4|webm|mov|avi|mkv)$/i.test(attachment.fileName ?? "");
        if (isVideo) {
          setVideoPreview({ url, fileName: attachment.fileName ?? undefined });
        } else {
          setFilePreview({
            url,
            fileName: attachment.fileName ?? undefined,
            contentType: attachment.mimeType,
            itemId: getCloudItemIdFromAttachment(attachment),
          });
        }
      });
    },
    [resolveCloudAttachmentUrl],
  );

  const handleTrashPreview = useCallback(
    (item: CloudItem) => {
      if (!cloudUserId) return;
      void getCachedCloudFileAccess(cloudUserId, item.id)
        .then((access) => {
          if (item.type === "image") {
            setImagePreview({
              url: access.url,
              alt: getCloudItemTitle(item, {
                text: t("item.untitledText"),
                link: t("item.untitledLink"),
                file: t("item.untitledFile"),
              }),
              groupKey: item.id,
              conversationId: CLOUD_CONVERSATION_ID,
              senderName: currentUser.displayName,
              senderAvatar: currentUser.avatar,
              sentAt: item.createdAt,
              initialIndex: 0,
            });
          } else if (item.type === "video") {
            setVideoPreview({ url: access.url, fileName: item.title ?? undefined });
          } else {
            setFilePreview({
              url: access.url,
              fileName: item.title ?? undefined,
              contentType: item.contentType,
              itemId: item.id,
            });
          }
        })
        .catch(() => undefined);
    },
    [cloudUserId, currentUser.avatar, currentUser.displayName, t],
  );

  const handleCloudDownload = useCallback(
    (item: CloudItem) => {
      if (!cloudUserId) return;
      void getCachedCloudFileAccess(cloudUserId, item.id).then((access) =>
        downloadResourceWithName(access.url, item.title || `cloud-${item.id}`),
      );
    },
    [cloudUserId],
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      navigate(`/chat/${conversationId}`);
    },
    [navigate],
  );

  const noopMessageAction = useCallback(
    (_message: Message) => {
      void _message;
      showPhaseNotice();
    },
    [showPhaseNotice],
  );

  const noopMessageIdAction = useCallback(
    (_messageId: string) => {
      void _messageId;
      showPhaseNotice();
    },
    [showPhaseNotice],
  );

  const handleDeleteRequest = useCallback(
    (messageId: string) => {
      const item = workspace.items.find(
        (candidate) => candidate.id === messageId,
      );
      if (item) setDeleteTarget(item);
    },
    [workspace.items],
  );

  const handleTrash = useCallback(
    async (itemId: string) => {
      await workspace.trashItem(itemId);
      toast.success(t("toast.movedToTrash"));
    },
    [t, workspace],
  );

  const handleRestore = useCallback(
    async (itemId: string) => {
      await workspace.restoreItem(itemId);
      toast.success(t("toast.restored"));
    },
    [t, workspace],
  );

  const handlePermanentDelete = useCallback(
    async (itemId: string) => {
      await workspace.permanentlyDeleteItem(itemId);
      toast.success(t("toast.permanentlyDeleted"));
    },
    [t, workspace],
  );

  return (
    <AppShell
      className="chat-page-shell cloud-chat-page"
      data-chat-layout-state={pageLayoutState}
      moduleSidebar={
        <ModuleSidebar
          className="chat-page-module-sidebar cloud-chat-module-sidebar"
          contentClassName="min-h-0"
        >
          <div className="h-full min-h-0 w-full">
            <Sidebar
              layoutState={contentLayoutState}
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
                isLoadingConversations && !hasFetchedConversationsOnce
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
          data-chat-layout-state={contentLayoutState}
        >
          <ChatHeader
            conversation={conversation}
            currentUserId={currentUser.id}
            titleOverride={t("workspace.title")}
            subtitleOverride={
              viewMode === "trash"
                ? t("trash.headerSubtitle")
                : t("workspace.onlyYou")
            }
            avatarOverride={<CloudConversationAvatar size="sm" />}
            onBack={() => navigate("/chat")}
            onInfoClick={() => setIsInfoPanelOpen((isOpen) => !isOpen)}
            onSearchClick={() => setIsSearchOpen((value) => !value)}
            onPinnedClick={showPhaseNotice}
          />

          {isSearchOpen ? (
            <div className="border-b border-border/60 bg-surface py-2">
              <ConversationLane>
                <div className="relative block">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden
                  />
                  <input
                    id="cloud-search-input"
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("search.placeholder")}
                    aria-label={t("search.aria")}
                    className="input-surface h-9 w-full pl-9 pr-9 text-sm"
                  />
                  <select
                    value={filter}
                    onChange={(event) =>
                      setFilter(event.target.value as CloudFilter)
                    }
                    aria-label={t("navigation.aria")}
                    className="input-surface mt-2 h-9 w-full text-sm"
                  >
                    {(
                      [
                        "all",
                        "text",
                        "link",
                        "image",
                        "video",
                        "audio",
                        "file",
                      ] as CloudFilter[]
                    ).map((value) => (
                      <option key={value} value={value}>
                        {t(`navigation.${value}`)}
                      </option>
                    ))}
                  </select>
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
                </div>
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

          {viewMode === "active" ? (
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
              onDelete={handleDeleteRequest}
              onImageClick={handleImagePreview}
              onFilePreview={handleFilePreview}
              hasMore={Boolean(workspace.nextCursor)}
              isLoadingMore={workspace.isLoadingMore}
              isInitialLoading={workspace.isLoading}
              onLoadMore={() => workspace.loadMore()}
              density="comfortable"
              layoutState={contentLayoutState}
              selectedMessageIds={new Set()}
              className="min-h-0 flex-1"
            />
          ) : workspace.trashUnavailable ? (
            <ConversationLane className="flex min-h-0 flex-1 items-start pt-5">
              <InlineNotice
                tone="warning"
                message={t("errors.trashUnavailable")}
              />
            </ConversationLane>
          ) : (
            <CloudTrashTimeline
              items={visibleTrashItems}
              isLoading={workspace.isLoadingTrash}
              isLoadingMore={workspace.isLoadingMoreTrash}
              hasMore={Boolean(workspace.trashNextCursor)}
              isMutating={workspace.isMutating}
              onRestore={handleRestore}
              onDelete={setDeleteTarget}
              onPreview={handleTrashPreview}
              onDownload={handleCloudDownload}
              onLoadMore={() => workspace.loadMoreTrash()}
            />
          )}

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
            {viewMode === "active" ? (
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
                          ? formatBytes(workspace.quota?.reservedBytes ?? 0)
                          : "",
                      })
                    : undefined
                }
                composerMode="online"
                conversationName={t("workspace.title")}
                onAddFiles={handleAddFiles}
                onSendAudio={handleSendAudio}
              />
            ) : (
              <div className="cloud-trash-retention-note">
                <ConversationLane>
                  <p>{t("trash.retentionNotice")}</p>
                </ConversationLane>
              </div>
            )}
          </div>
        </div>
        <div
          className={clsx(
            "fixed inset-y-0 right-0 z-40 w-full max-w-full transform-gpu transition-transform duration-300 ease-out sm:max-w-[min(26rem,94vw)] xl:relative xl:z-0 xl:max-w-none xl:flex-shrink-0 xl:overflow-hidden xl:bg-transparent xl:transition-[width,border-color] xl:duration-300",
            isInfoPanelOpen
              ? "translate-x-0 xl:w-[var(--app-inspector-width)] xl:border-l xl:border-border/60"
              : "translate-x-full xl:w-0 xl:border-l xl:border-border/0",
          )}
          aria-hidden={!isInfoPanelOpen}
        >
          <div
            className={clsx(
              "h-full w-full transform-gpu bg-surface transition-[transform,opacity] duration-300 ease-out xl:absolute xl:inset-y-0 xl:right-0 xl:w-[var(--app-inspector-width)]",
              isInfoPanelOpen
                ? "translate-x-0 opacity-100"
                : "pointer-events-none translate-x-4 opacity-0 xl:translate-x-6",
            )}
            style={{ backgroundColor: "hsl(var(--color-sidebar-surface))" }}
          >
            <CloudConversationInfoPanel
              items={workspace.items}
              trashItems={workspace.trashItems}
              userId={cloudUserId}
              currentUser={currentUser}
              quota={workspace.quota}
              quotaRequest={workspace.quotaRequest}
              showQuotaRequest={showQuotaRequest}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onRequestQuota={() => setIsQuotaRequestOpen(true)}
              onEmptyTrash={workspace.emptyTrash}
              isMutating={workspace.isMutating}
              onClose={() => setIsInfoPanelOpen(false)}
            />
          </div>
        </div>
        {isInfoPanelOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-text-primary/50 xl:hidden"
            onClick={() => setIsInfoPanelOpen(false)}
            aria-label={t("common.close")}
          />
        ) : null}
      </section>
      <CloudDeleteDialog
        key={`${deleteTarget?.id ?? "closed"}-${viewMode}`}
        item={deleteTarget}
        permanentOnly={viewMode === "trash"}
        isLoading={workspace.isMutating}
        onClose={() => setDeleteTarget(null)}
        onTrash={handleTrash}
        onPermanentDelete={handlePermanentDelete}
      />
      <CloudQuotaRequestDialog
        isOpen={isQuotaRequestOpen}
        quota={workspace.quota}
        currentRequest={workspace.quotaRequest}
        isLoading={workspace.isRequestingQuota}
        onClose={() => setIsQuotaRequestOpen(false)}
        onSubmit={async (requestedQuotaBytes, reason) => {
          await workspace.requestQuota(requestedQuotaBytes, reason);
          toast.success(t("quotaRequest.submitted"));
        }}
      />
      <VideoPlayerModal
        isOpen={videoPreview !== null}
        onClose={() => setVideoPreview(null)}
        url={videoPreview?.url ?? null}
        fileName={videoPreview?.fileName}
      />
      <ImagePreviewModal
        isOpen={imagePreview !== null}
        onClose={() => setImagePreview(null)}
        images={previewGallery}
        initialIndex={previewInitialIndex}
        onDownload={async (image) => {
          const itemId = image.groupKey;
          if (!cloudUserId || !itemId) return image.url;
          const access = await getCachedCloudFileAccess(cloudUserId, itemId);
          return access.url;
        }}
        onViewAll={() => {
          setImagePreview(null);
          setIsInfoPanelOpen(true);
        }}
      />
      <CloudFilePreviewModal
        isOpen={filePreview !== null}
        onClose={() => setFilePreview(null)}
        url={filePreview?.url ?? null}
        fileName={filePreview?.fileName}
        contentType={filePreview?.contentType}
        onDownload={async () => {
          if (!filePreview?.itemId || !cloudUserId) return filePreview?.url;
          const access = await getCachedCloudFileAccess(
            cloudUserId,
            filePreview.itemId,
          );
          return access.url;
        }}
      />
    </AppShell>
  );
}
