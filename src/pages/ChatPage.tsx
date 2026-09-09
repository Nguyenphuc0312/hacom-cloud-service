/**
 * @fileoverview Chat Page - Main chat interface
 * Integrated with Zustand stores and WebSocket.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Sidebar } from "../components/layout/Sidebar";
import { ChatWindow } from "../components/layout/ChatWindow";
import { FeatureErrorBoundary } from "../components/error";
import { AppShell, ModuleSidebar } from "../shared/layout";
import {
  ConfirmDialog,
  NotificationListSkeleton,
  ChatWorkspaceSkeleton,
  ProfileSkeleton,
  Skeleton,
} from "../components/ui";
import { toast } from "../components/ui";
import { ErrorState, NoChatSelected } from "../components/ui/EmptyState";
import {
  useAuthStore,
  useChatStore,
  useSelectedConversation,
  useCurrentTypingStatus,
  useCurrentTypingStatuses,
  useConversationCount,
  useFriendshipStore,
} from "../stores";
import { useGlobalWebSocket } from "../features/realtime/GlobalWebSocketProvider";
import type {
  Attachment,
  Conversation,
  ImageClickPayload,
  Message,
  UserSummary,
} from "../types";
import { useFilePreview } from "../hooks/useFilePreview";
import type { PreviewTarget } from "../hooks/useFilePreview";
import { getPreviewType } from "../utils/formatFileSize";
import type { PreviewType } from "../utils/formatFileSize";
import { UserStatus } from "../types";
import { isDirectConversation } from "../lib/conversationAdapter";
import { resolveConversationId } from "../lib/conversationIdentity";
import { getOtherParticipant } from "../utils/messageHelpers";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import {
  listenForContactProfileView,
  listenForFileSourceInvalidated,
  listenForMentionProfileView,
  readChatRouteIntent,
} from "../features/chat/events/chatUiEvents";
import { logMessageDebug } from "../utils/messageDebug";
import { logger } from "../utils/logger";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import {
  chatApi as rtkChatApi,
  useAddReactionMutation,
  useDeleteMessageMutation,
  useEditMessageMutation,
  useGetMessagesQuery,
  useRemoveReactionMutation,
} from "../features/api/chatApi";
import type { GalleryImage } from "../components/modals/ImagePreviewModal";
import { useSendMessage } from "../features/chat/hooks/useSendMessage";
import { useConversationSession } from "../features/chat/hooks/useConversationSession";
import { useConversationValidation } from "../features/chat/hooks/useConversationValidation";
import {
  CHAT_OPEN_NEW_CHAT_EVENT,
  consumeOpenNewChatIntent,
} from "../lib/commandPalette";
import { chatApi } from "../features/chat/api";
import { store } from "../store";
import type { ChatLayoutState } from "../utils/densityPolicy";
import { isUuid } from "../utils/isUuid";
import { useResponsive } from "../responsive/responsive";
import { resolvePublicResourceUrl } from "../config";
import { getCachedUserProfile } from "../services/userProfileCache";
import { DraggableProfileModal } from "../components/info/DraggableProfileModal";
import { conversationApi, fileApi } from "../services/api";
import { fetchThumbnailUrlsShared } from "../hooks/useBatchThumbnailUrl";
import {
  cacheCloudConversationId,
  isPersonalCloudConversation,
  readCachedCloudConversationId,
} from "../features/cloud/personalCloudPolicy";
import { cloudApi } from "../features/cloud/api/cloudApi";
import { asRecord, asString } from "../utils/payloadGuards";
import { buildEditedLastMessagePreviewPatch } from "../stores/conversationSummaryState";

const UserProfile = React.lazy(() => import("../components/info/UserProfile"));
const GroupInfo = React.lazy(() => import("../components/info/GroupInfo"));
const importCloudSurface = () =>
  import("../features/cloud/components/CloudChatWorkspace");
const PersonalCloudConversationSurface = React.lazy(() =>
  importCloudSurface().then((module) => ({
    default: module.PersonalCloudConversationSurface,
  })),
);
const NewChatModal = React.lazy(
  () => import("../components/modals/NewChatModal"),
);
const AddFriendModal = React.lazy(
  () => import("../components/modals/AddFriendModal"),
);
const ImagePreviewModal = React.lazy(
  () => import("../components/modals/ImagePreviewModal"),
);
const FilePreviewModal = React.lazy(
  () => import("../components/modals/FilePreviewModal"),
);
const SharedContentModal = React.lazy(() =>
  import("../components/info/shared-resources/SharedContentModal").then((m) => ({
    default: m.SharedContentModal,
  })),
);

type GalleryImageWithAttachment = GalleryImage & {
  attachmentId?: string;
};

const LIGHTBOX_PRELOAD_RADIUS = 4;
const LIGHTBOX_PREVIEW_CONCURRENCY = 2;
const LIGHTBOX_PREVIEW_URL_CAP = 64;

const isImageAttachment = (attachment: Attachment): boolean =>
  attachment.mimeType?.startsWith("image/") === true ||
  /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(attachment.fileName ?? "");

const getPreviewSender = (message: Message) => {
  const sender = asRecord(asRecord(message)?.sender);
  return {
    uploaderName:
      asString(message.senderName) ||
      asString(sender?.fullName) ||
      asString(sender?.displayName) ||
      asString(sender?.username),
    uploaderAvatarUrl:
      asString(message.senderAvatar) ||
      asString(sender?.avatarUrl) ||
      asString(sender?.avatar),
  };
};

/** Filmstrip shows the most-recent images; must stay in sync with FILMSTRIP_MAX in the modal. */
const LIGHTBOX_FILMSTRIP_MAX = 15;

const getLightboxPreloadIds = (
  images: readonly GalleryImageWithAttachment[],
  currentIndex: number,
): string[] => {
  if (images.length === 0) return [];
  // Full-res preview URLs for the current image and its neighbors (arrow nav).
  // Filmstrip thumbnails are handled separately via the shared thumbnail cache.
  const start = Math.max(0, currentIndex - LIGHTBOX_PRELOAD_RADIUS);
  const end = Math.min(images.length - 1, currentIndex + LIGHTBOX_PRELOAD_RADIUS);
  const ids = new Set<string>();
  for (let index = start; index <= end; index += 1) {
    const attachmentId = images[index]?.attachmentId;
    if (attachmentId) ids.add(attachmentId);
  }
  return Array.from(ids);
};

const mergeBoundedPreviewUrls = (
  current: Record<string, string>,
  incoming: Record<string, string>,
  priorityIds: readonly string[],
): Record<string, string> => {
  const merged = { ...current, ...incoming };
  const entries = Object.entries(merged);
  if (entries.length <= LIGHTBOX_PREVIEW_URL_CAP) {
    return merged;
  }

  const next: Record<string, string> = {};
  for (const id of priorityIds) {
    const url = merged[id];
    if (url) next[id] = url;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (Object.keys(next).length >= LIGHTBOX_PREVIEW_URL_CAP) break;
    const [id, url] = entries[index];
    if (!(id in next)) {
      next[id] = url;
    }
  }

  return next;
};

/** Wrapper that builds the full gallery from RTK cache before opening the lightbox */
const ImagePreviewModalGallery: React.FC<{
  imagePreview: ImageClickPayload;
  onClose: () => void;
}> = ({ imagePreview, onClose }) => {
  const convId = imagePreview.conversationId ?? "";
  // Missing capability fields are legacy payloads and remain allowed.
  const previewBlocked = imagePreview.canPreview === false;
  const { data } = useGetMessagesQuery(
    { conversationId: convId },
    { skip: !convId || previewBlocked },
  );

  // Track attachment IDs that need preview URLs
  const [previewUrls, setPreviewUrls] = React.useState<Record<string, string>>({});
  // Non-expiring thumbnail URLs for the filmstrip — same source the "Kho lưu trữ"
  // library uses, so the strip renders identically instead of showing "Ảnh".
  const [thumbUrls, setThumbUrls] = React.useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = React.useState(imagePreview.initialIndex ?? 0);
  const inFlightPreviewIdsRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    setPreviewUrls({});
    setThumbUrls({});
    setCurrentIndex(imagePreview.initialIndex ?? 0);
    inFlightPreviewIdsRef.current.clear();
  }, [convId, imagePreview.groupKey, imagePreview.url, imagePreview.initialIndex]);

  const { images, initialIndex, canOpen } = useMemo(() => {
    if (previewBlocked) {
      return { images: [], initialIndex: 0, canOpen: false };
    }

    const msgs = data?.messages ?? [];
    const gallery: GalleryImageWithAttachment[] = [];
    let found = 0;
    let currentBlocked = false;

    for (const msg of msgs) {
      const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
      const imgAttachments = attachments.filter(isImageAttachment);
      for (const att of imgAttachments) {
        const isCurrentImage =
          att.id === imagePreview.groupKey ||
          att.url === imagePreview.url ||
          att.thumbnailUrl === imagePreview.url;

        if (att.canPreview === false) {
          if (isCurrentImage) currentBlocked = true;
          continue;
        }

        // For clicked image, use the already-resolved URL.
        // For other images, use a preview URL if available, otherwise stored URL.
        const url = isCurrentImage
          ? imagePreview.url
          : (previewUrls[att.id] ??
             thumbUrls[att.id] ??
             resolvePublicResourceUrl(att.thumbnailUrl ?? att.url) ??
             "");

        if (isCurrentImage) found = gallery.length;
        gallery.push({
          url,
          alt: att.fileName,
          senderName: msg.senderName,
          senderAvatar: msg.senderAvatar,
          sentAt: msg.serverTs,
          groupKey: msg.id,
          attachmentId: att.id,
          canPreview: att.canPreview,
          canDownload: att.canDownload,
        });
      }
    }

    if (currentBlocked) {
      return { images: [], initialIndex: 0, canOpen: false };
    }

    if (gallery.length === 0) {
      return {
        images: [{
          url: imagePreview.url,
          alt: imagePreview.alt,
          senderName: imagePreview.senderName,
          senderAvatar: imagePreview.senderAvatar,
          sentAt: imagePreview.sentAt,
          canPreview: imagePreview.canPreview,
          canDownload: imagePreview.canDownload,
        }],
        initialIndex: 0,
        canOpen: true,
      };
    }
    return { images: gallery, initialIndex: found, canOpen: true };
  }, [data, imagePreview, previewBlocked, previewUrls, thumbUrls]);

  React.useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  // Filmstrip thumbnails: batch-fetch non-expiring thumbnail URLs for the whole
  // visible strip from the SAME shared cache as "Kho lưu trữ". This is why the
  // library shows every image but the strip used to show "Ảnh" — the strip was
  // falling back to expired signed URLs from the message cache.
  const filmstripIds = useMemo(() => {
    const start = Math.max(0, images.length - LIGHTBOX_FILMSTRIP_MAX);
    return images
      .slice(start)
      .map((img) => img.attachmentId)
      .filter((id): id is string => Boolean(id));
  }, [images]);
  const filmstripIdsKey = filmstripIds.join("|");

  React.useEffect(() => {
    const ids = filmstripIdsKey ? filmstripIdsKey.split("|") : [];
    if (!convId || ids.length === 0) return;
    let cancelled = false;
    void fetchThumbnailUrlsShared(convId, ids)
      .then((resolved) => {
        if (cancelled) return;
        setThumbUrls((prev) => {
          let changed = false;
          const merged = { ...prev };
          for (const [id, item] of Object.entries(resolved)) {
            if (item.url && merged[id] !== item.url) {
              merged[id] = item.url;
              changed = true;
            }
          }
          return changed ? merged : prev; // no-op if nothing new — avoids re-render loop
        });
      })
      .catch(() => { /* keep fallback; strip cell shows "Ảnh" until retry */ });
    return () => { cancelled = true; };
  }, [convId, filmstripIdsKey]);

  const preloadAttachmentIds = useMemo(
    () => getLightboxPreloadIds(images, currentIndex),
    [currentIndex, images],
  );
  const preloadAttachmentKey = preloadAttachmentIds.join("|");

  // Fetch preview URLs only for the visible image and a small neighborhood.
  React.useEffect(() => {
    if (!preloadAttachmentIds.length || !convId) return;

    const abortController = new AbortController();

    const fetchPreviewsForAttachments = async () => {
      const newUrls: Record<string, string> = {};

      const idsToFetch = preloadAttachmentIds.filter((attId) => {
        if (previewUrls[attId]) return false;
        if (inFlightPreviewIdsRef.current.has(attId)) return false;
        inFlightPreviewIdsRef.current.add(attId);
        return true;
      });
      if (idsToFetch.length === 0) return;

      let cursor = 0;
      const worker = async () => {
        while (cursor < idsToFetch.length && !abortController.signal.aborted) {
          const attId = idsToFetch[cursor];
          cursor += 1;
          try {
          const response = await fileApi.getPreviewUrl({
            conversationId: convId,
            attachmentId: attId,
            signal: abortController.signal,
          });

          const payload = unwrapApiSuccess(response);
          const resolvedUrl = resolvePublicResourceUrl(payload.url, {
            context: "image",
            allowBlob: true,
          });
            if (resolvedUrl) {
              newUrls[attId] = resolvedUrl;
            }
          } catch {
            // Keep fallback thumbnail/current URL; lightbox navigation must not fail.
          } finally {
            inFlightPreviewIdsRef.current.delete(attId);
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(LIGHTBOX_PREVIEW_CONCURRENCY, idsToFetch.length) },
          () => worker(),
        ),
      );

      if (!abortController.signal.aborted) {
        if (Object.keys(newUrls).length > 0) {
          setPreviewUrls((prev) =>
            mergeBoundedPreviewUrls(prev, newUrls, preloadAttachmentIds),
          );
        }
      }
    };

    void fetchPreviewsForAttachments();

    return () => {
      abortController.abort();
    };
    // Depend ONLY on the stable id set (preloadAttachmentKey). Including the array
    // ref or previewUrls made this re-run on every thumbUrls update, whose cleanup
    // aborted in-flight preview requests (the 0 B "cancelled" rows in Network).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, preloadAttachmentKey]);

  const [showArchive, setShowArchive] = React.useState(false);

  if (!canOpen) return null;

  if (showArchive && convId) {
    // "Xem tất cả" → hand off to the full Kho lưu trữ (media tab). Closing it
    // returns to the timeline, not the lightbox — same as tapping "xem chi tiết".
    return (
      <SharedContentModal
        isOpen
        conversationId={convId}
        defaultTab="media"
        onClose={() => {
          setShowArchive(false);
          onClose();
        }}
      />
    );
  }

  return (
    <ImagePreviewModal
      isOpen
      onClose={onClose}
      images={images}
      initialIndex={initialIndex}
      onIndexChange={setCurrentIndex}
      onViewAll={convId ? () => setShowArchive(true) : undefined}
    />
  );
};

type InfoPanelMode = "conversation" | "self-profile" | "contact-profile";

const CONVERSATIONS_PAGE_SIZE = 100;

/**
 * Minimal shape check: is this payload complete enough to drop straight into
 * the sidebar without a follow-up fetch? We require the identity (`id`), the
 * room `type` (drives direct/group rendering) and a `participants` array
 * (drives display name/avatar for direct chats). Fields are derived from the
 * `Conversation` type + `conversationAdapter` normalization, not hardcoded.
 */
const isCompleteConversation = (value: unknown): value is Conversation => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Conversation> & {
    participants?: unknown;
  };
  return Boolean(
    candidate.id &&
      candidate.type &&
      Array.isArray(candidate.participants),
  );
};

const DeferredPanelFallback: React.FC = () => (
  <div className="h-full px-1 py-2" aria-busy="true">
    <NotificationListSkeleton count={5} />
  </div>
);

/**
 * Khung chờ của Cloud: giữ đúng bố cục header / timeline / composer để khi nội dung
 * thật vào, không có cú nhảy layout. Dùng skeleton danh sách chung ở đây sẽ nhìn như
 * một trang khác chớp qua rồi mới tới Cloud.
 */
const PersonalCloudSurfaceSkeleton: React.FC = () => (
  <div className="flex h-full min-h-0 flex-col bg-surface" aria-busy="true">
    <div className="flex min-h-[var(--app-header-height)] shrink-0 items-center gap-3 border-b border-border/70 px-4">
      <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="skeleton h-3.5 w-32 rounded" />
        <div className="skeleton h-3 w-56 rounded" />
      </div>
    </div>
    <div className="min-h-0 flex-1" />
    <div className="shrink-0 border-t border-border/70 px-[var(--chat-lane-padding)] py-3">
      <div className="skeleton mx-auto h-11 w-full max-w-[var(--chat-content-lane)] rounded-full" />
    </div>
  </div>
);

const DeferredModalFallback: React.FC = () => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-text-primary/40 backdrop-blur-sm">
    <div
      className="w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-border/80 bg-surface/95 p-4 shadow-elev3"
      aria-busy="true"
    >
      <Skeleton className="h-6 w-40" rounded="sm" />
      <div className="mt-4 space-y-3">
        <Skeleton className="h-10 w-full" rounded="md" />
        <Skeleton className="h-10 w-full" rounded="md" />
        <Skeleton className="h-10 w-2/3" rounded="md" />
      </div>
    </div>
  </div>
);

const INFO_PANEL_EXIT_DURATION_MS = 240;

const loadConversationMutationUseCases = () =>
  import("../features/chat/usecases/createPrivateConversation").then(
    async ({ createPrivateConversationUseCase }) => {
      const { createGroupConversationUseCase } = await import(
        "../features/chat/usecases/createGroupConversation"
      );

      return {
        createPrivateConversationUseCase,
        createGroupConversationUseCase,
      };
    },
  );

export const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const routeConversationId = conversationId ?? null;
  const navigate = useNavigate();
  const location = useLocation();
  const routeIntent = readChatRouteIntent(location.state);
  const shouldTraceRenderLoop = import.meta.env.DEV;

  // Auth store
  const {
    user,
    isLoading: isAuthLoading,
    isInitialized: isAuthInitialized,
    refreshUser,
  } = useAuthStore();

  // Chat store — stable functions + data that drives re-renders.
  // Per-conversation loading/error/hasMore are derived separately below to
  // avoid re-renders when OTHER conversations' states change (e.g. during
  // idle prefetch of adjacent rooms).
  const {
    selectedConversationId,
    selectConversation,
    addConversation,
    updateConversation,
    isLoadingConversations,
    hasFetchedConversationsOnce,
    conversationsError,
    fetchConversations,
    fetchMessages,
    markAsRead,
  } = useChatStore(
    useShallow((state) => ({
      selectedConversationId: state.selectedConversationId,
      selectConversation: state.selectConversation,
      addConversation: state.addConversation,
      updateConversation: state.updateConversation,
      isLoadingConversations: state.isLoadingConversations,
      hasFetchedConversationsOnce: state.hasFetchedConversationsOnce,
      conversationsError: state.conversationsError,
      fetchConversations: state.fetchConversations,
      fetchMessages: state.fetchMessages,
      markAsRead: state.markAsRead,
    })),
  );

  // Per-conversation derived selectors — only re-render when THIS
  // conversation's values change, not when other conversations load.


  // Selectors
  const selectedConversation = useSelectedConversation();
  const typingStatus = useCurrentTypingStatus();
  const typingStatuses = useCurrentTypingStatuses();
  const conversationCount = useConversationCount();
  const refreshFriendshipDirectory = useFriendshipStore(
    (state) => state.refreshDirectory,
  );
  // WebSocket
  const {
    connectionState,
    sendTyping,
    stopTyping,
    joinConversation,
    leaveConversation,
  } = useGlobalWebSocket();

  // Local state
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [infoPanelMode, setInfoPanelMode] = useState<InfoPanelMode | null>(
    null,
  );
  const [contactProfileUserId, setContactProfileUserId] = useState<string | null>(null);
  const [mentionProfile, setMentionProfile] = useState<{ userId: string; avatarUrl?: string; displayName?: string } | null>(null);
  const { chatLayoutBreakpoint } = useResponsive();
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImageClickPayload | null>(null);
  const filePreview = useFilePreview();
  const closeFilePreview = filePreview.close;
  const previewConversationId = filePreview.current?.conversationId ?? null;
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<{
    messageId: string;
    mode: "FOR_ME" | "FOR_EVERYONE";
    /** true khi viewer là admin/owner xóa tin của người khác → copy khác sender recall. */
    isAdminDeletion?: boolean;
  } | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const conversationsPageRef = useRef(1);
  const roomCreationLockRef = useRef(false);
  const [externalJumpTarget, setExternalJumpTarget] = useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);
  const [externalJumpRequestVersion, setExternalJumpRequestVersion] =
    useState(0);
  const renderCountRef = useRef(0);
  const chatPaneRef = useRef<HTMLDivElement | null>(null);

  const conversationAccessDeniedMessage = t(
    "error:chat.conversationAccessDenied",
  );
  const conversationOpenFailedMessage = t("error:chat.conversationOpenFailed");
  const {
    isValidatingRoom,
    lastValidatedConversationId,
    conversationValidationError,
    handleRetryConversationValidation,
  } = useConversationValidation({
    routeConversationId,
    addConversation,
    updateConversation,
    conversationAccessDeniedMessage,
    conversationOpenFailedMessage,
    shouldTraceRenderLoop,
  });

  useEffect(() => {
    if (!shouldTraceRenderLoop) {
      return;
    }

    renderCountRef.current += 1;
    logMessageDebug("ChatPage", "render_count", {
      renderCount: renderCountRef.current,
      routeConversationId,
      selectedConversationId,
      lastValidatedConversationId,
      isValidatingRoom,
    });
  });

  useEffect(() => {
    if (!shouldTraceRenderLoop) {
      return;
    }

    logMessageDebug("ChatPage", "route_param_changed", {
      routeConversationId,
      selectedConversationId,
      lastValidatedConversationId,
    });
  }, [
    lastValidatedConversationId,
    routeConversationId,
    selectedConversationId,
    shouldTraceRenderLoop,
  ]);

  useEffect(() => {
    const storeSelectedConversationId =
      useChatStore.getState().selectedConversationId;
    if (storeSelectedConversationId !== routeConversationId) {
      if (shouldTraceRenderLoop) {
        logMessageDebug("ChatPage", "selected_conversation_sync", {
          from: storeSelectedConversationId,
          to: routeConversationId,
        });
      }
      selectConversation(routeConversationId);
    }
  }, [routeConversationId, selectConversation, shouldTraceRenderLoop]);

  // Current user as UserSummary for components
  const currentUserSummary = useMemo<UserSummary | null>(
    () =>
      user
        ? {
          id: user.id,
          username: user.username,
          displayName:
            // Own profile: trust the self-authored name (see useMyProfile).
            resolveUserDisplayName(user, {
              allowLegacyFallback: true,
              trustDisplayName: true,
            }) || user.username,
          avatar: user.avatar,
          status: user.status as UserStatus,
          isBot: false,
        }
        : null,
    [user],
  );

  const isSelectedDirectConversation =
    isDirectConversation(selectedConversation);
  // Cloud của tôi mở ngay tại /chat/<id> như mọi hội thoại khác (giống My Documents
  // của Zalo). Thân hội thoại dùng PersonalCloudConversationSurface thay cho ChatWindow:
  // upload/xóa của Cloud phải đi qua cloudApi để trừ đúng quota — đường upload chat
  // thường không đụng bảng cloud_quotas.
  //
  // KHÔNG suy ra từ selectedConversation: backend chưa trả conversation Cloud trong
  // /conversations (inbox projection không có dòng nào cho nó), nên selectedConversation
  // rỗng và màn hình sẽ rơi vào trạng thái "chưa chọn hội thoại". Đối chiếu thẳng id
  // Cloud lấy từ /cloud/ensure.
  // Nhớ id qua localStorage: nếu chờ ensure() mới nhận ra đây là Cloud thì ChatPage
  // kịp render ChatWindow (UI nhóm) rồi ~2s sau mới đổi sang Cloud — đúng hiện tượng
  // "khựng một lúc xong mới nhảy qua". Đọc cache là đồng bộ nên lượt sau nhận ra ngay.
  const [cloudConversationId, setCloudConversationId] = useState<string | null>(
    () => readCachedCloudConversationId(),
  );
  useEffect(() => {
    let cancelled = false;
    // Nạp sẵn chunk của Cloud: nếu để tới lúc bấm mới tải, Suspense thay khung chat
    // bằng skeleton một nhịp — người dùng thấy như màn hình chớp.
    void importCloudSurface();
    void (async () => {
      try {
        // Có cache và conversation đã nằm trong store thì không cần gọi lại: ensure()
        // ở đây chạy mỗi lần mount ChatPage, kể cả khi đang mở hội thoại thường.
        const cached = readCachedCloudConversationId();
        if (cached && useChatStore.getState().conversationById[cached]) return;

        const space = await cloudApi.ensure();
        if (cancelled) return;
        setCloudConversationId(space.conversationId);
        cacheCloudConversationId(space.conversationId);
        // Ghim vào danh sách hội thoại: backend không trả nó trong /conversations
        // nên phải nạp bằng id rồi merge vào store, nếu không sidebar sẽ không có dòng nào.
        if (useChatStore.getState().conversationById[space.conversationId]) return;
        const detail = await conversationApi.getConversationById(space.conversationId);
        const payload = (detail as { data?: unknown })?.data ?? detail;
        if (!cancelled && isCompleteConversation(payload)) addConversation(payload);
      } catch {
        // Cloud không dùng được thì chat vẫn phải chạy bình thường.
      }
    })();
    return () => { cancelled = true; };
  }, [addConversation]);

  const isRoutePersonalCloud = Boolean(
    routeConversationId &&
      (routeConversationId === cloudConversationId ||
        (selectedConversation?.id === routeConversationId &&
          isPersonalCloudConversation(selectedConversation))),
  );

  // Get other user for direct chat
  const otherUser =
    selectedConversation && isSelectedDirectConversation && currentUserSummary
      ? getOtherParticipant(selectedConversation, currentUserSummary.id)
      : null;

  const {
    currentHasMore: sessionCurrentHasMore,
    currentIsLoading: sessionCurrentIsLoading,
    currentMessageError: sessionCurrentMessageError,
    currentHistoryStage: sessionCurrentHistoryStage,
    isHistoryPartial: sessionIsHistoryPartial,
    isConversationHistoryReady: sessionIsConversationHistoryReady,
    isConversationReady: sessionIsConversationReady,
    handleLoadOlderMessages: sessionHandleLoadOlderMessages,
    handleRetryMessages: sessionHandleRetryMessages,
    handleReachedLatestMessage: sessionHandleReachedLatestMessage,
    handleTyping: sessionHandleTyping,
  } = useConversationSession({
    routeConversationId,
    selectedConversationId,
    selectedConversation,
    isSelectedDirectConversation,
    otherUser: otherUser ?? null,
    connectionState,
    isValidatingRoom,
    lastValidatedConversationId,
    messageCount: 0,
    fetchMessages,
    markAsRead,
    joinConversation,
    leaveConversation,
    stopTyping,
    sendTyping,
    updateConversation,
  });
  // Load conversations on mount
  useEffect(() => {
    void (async () => {
      await fetchConversations();
      const initialCount = useChatStore.getState().conversations.length;
      setHasMoreConversations(initialCount >= CONVERSATIONS_PAGE_SIZE);
      conversationsPageRef.current = 1;
    })();
  }, [fetchConversations]);

  const handleLoadMoreConversations = useCallback(async () => {
    if (isLoadingMoreConversations || !hasMoreConversations) {
      return;
    }

    setIsLoadingMoreConversations(true);
    try {
      const nextPage = conversationsPageRef.current + 1;
      const response = await chatApi.conversation.getConversations(
        nextPage,
        CONVERSATIONS_PAGE_SIZE,
      );
      const fetched = unwrapApiSuccess(response);

      if (!Array.isArray(fetched) || fetched.length === 0) {
        setHasMoreConversations(false);
        return;
      }

      useChatStore.getState().mergeConversationPage(fetched);
      conversationsPageRef.current = nextPage;
      setHasMoreConversations(fetched.length >= CONVERSATIONS_PAGE_SIZE);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("error:chat.fetchConversationsFailed"));
    } finally {
      setIsLoadingMoreConversations(false);
    }
  }, [hasMoreConversations, isLoadingMoreConversations, t]);

  // Handle select conversation
  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === routeConversationId) {
        return;
      }
      navigate(`/chat/${id}`);
    },
    [navigate, routeConversationId],
  );

  const { sendMessage: handleSendMessage } = useSendMessage({
    selectedConversationId,
    isConversationReady: sessionIsConversationReady,
    source: "ChatPage",
  });
  const [editMessageMutation] = useEditMessageMutation();
  const [deleteMessageMutation] = useDeleteMessageMutation();
  const [addReactionMutation] = useAddReactionMutation();
  const [removeReactionMutation] = useRemoveReactionMutation();

  const handleReactMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!selectedConversationId || !currentUserSummary) return;

      const targetMessage = rtkChatApi.endpoints.getMessages
        .select({ conversationId: selectedConversationId })(store.getState())
        .data?.messages.find((message) =>
          [
            message.id,
            message.localId,
            message.stableId,
            message.clientMessageId,
          ].some((value) => value === messageId),
        );
      if (!targetMessage) return;

      const existingReaction = targetMessage.reactions?.find(
        (reaction) => reaction.emoji === emoji,
      );
      const hasReacted = Boolean(
        existingReaction?.userIds?.includes(currentUserSummary.id),
      );

      // RTKQ mutation owns the optimistic timeline patch and rollback.
      try {
        const mutationInput = {
          conversationId: selectedConversationId,
          messageId,
          emoji,
          userId: currentUserSummary.id,
        };
        await (hasReacted
          ? removeReactionMutation(mutationInput)
          : addReactionMutation(mutationInput)
        ).unwrap();
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("error:generic.requestFailed"));
      }
    },
    [
      addReactionMutation,
      currentUserSummary,
      removeReactionMutation,
      selectedConversationId,
      t,
    ],
  );

  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!selectedConversationId) return;

      try {
        const updatedMessage = await editMessageMutation({
          conversationId: selectedConversationId,
          messageId,
          content,
        }).unwrap();
        const conversation =
          useChatStore.getState().conversationById[selectedConversationId];
        if (conversation) {
          const previewPatch = buildEditedLastMessagePreviewPatch(
            conversation,
            updatedMessage,
          );
          if (previewPatch) {
            updateConversation(selectedConversationId, previewPatch);
          }
        }
        toast.success(t("chat:toast.messageEdited"));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("chat:toast.editFailed"));
      }
    },
    [editMessageMutation, selectedConversationId, t, updateConversation],
  );

  const handleDeleteMessage = useCallback(
    (
      messageId: string,
      mode: "FOR_ME" | "FOR_EVERYONE" = "FOR_ME",
      context?: "ADMIN_DELETE",
    ) => {
      if (!selectedConversationId) return;
      setPendingDeleteMessage({
        messageId,
        mode,
        isAdminDeletion: context === "ADMIN_DELETE",
      });
    },
    [selectedConversationId],
  );

  const closePendingDeleteMessage = useCallback(() => {
    if (isDeletingMessage) return;
    setPendingDeleteMessage(null);
  }, [isDeletingMessage]);

  const confirmDeleteMessage = useCallback(async () => {
    if (!selectedConversationId || !pendingDeleteMessage) return;
    setIsDeletingMessage(true);
    try {
      await deleteMessageMutation({
        conversationId: selectedConversationId,
        messageId: pendingDeleteMessage.messageId,
        mode: pendingDeleteMessage.mode,
        context: pendingDeleteMessage.isAdminDeletion ? "ADMIN_DELETE" : undefined,
      }).unwrap();
      toast.success(
        pendingDeleteMessage.mode === "FOR_EVERYONE"
          ? pendingDeleteMessage.isAdminDeletion
            ? t("chat:toast.messageDeletedGlobal", {
              defaultValue: "Đã xóa tin nhắn ở mọi người",
            })
            : t("chat:toast.messageRecalled", {
              defaultValue: "Đã thu hồi tin nhắn",
            })
          : t("chat:toast.messageDeleted"),
      );

      // Sync conversation lastMessage in sidebar after delete/recall
      const storeState = useChatStore.getState();
      const affectedConv = storeState.conversationById[selectedConversationId];
      if (affectedConv?.lastMessage?.id === pendingDeleteMessage.messageId) {
        if (pendingDeleteMessage.mode === "FOR_ME") {
          updateConversation(selectedConversationId, { lastMessage: undefined });
        } else {
          updateConversation(selectedConversationId, {
            lastMessage: {
              ...affectedConv.lastMessage,
              isDeleted: true,
              content: "",
            },
          });
        }
      }

      setPendingDeleteMessage(null);
    } catch (error) {
      const apiError = extractApiError(error);
      const isRecallExpired =
        typeof apiError.message === "string" &&
        apiError.message.includes("RECALL_WINDOW_EXPIRED");
      toast.error(
        isRecallExpired
          ? t("chat:toast.recallWindowExpired", {
            defaultValue: "Đã quá 24 giờ, không thể thu hồi tin nhắn này",
          })
          : apiError.message || t("chat:toast.deleteFailed"),
      );
    } finally {
      setIsDeletingMessage(false);
    }
  }, [
    deleteMessageMutation,
    pendingDeleteMessage,
    selectedConversationId,
    t,
    updateConversation,
  ]);

  const closeInfoPanel = useCallback(() => {
    setIsInfoPanelOpen(false);
  }, []);

  const openSelfProfile = useCallback(() => {
    setInfoPanelMode("self-profile");
    setIsInfoPanelOpen(true);
  }, []);

  const openConversationInfoPanel = useCallback(() => {
    setInfoPanelMode("conversation");
    setIsInfoPanelOpen(true);
  }, []);

  const openContactProfile = useCallback((userId: string) => {
    setContactProfileUserId(userId);
    setInfoPanelMode("contact-profile");
    setIsInfoPanelOpen(true);
  }, []);

  // Handle toggle info panel
  const handleToggleInfoPanel = useCallback(() => {
    if (isInfoPanelOpen && infoPanelMode === "conversation") {
      closeInfoPanel();
      return;
    }

    openConversationInfoPanel();
  }, [
    closeInfoPanel,
    infoPanelMode,
    isInfoPanelOpen,
    openConversationInfoPanel,
  ]);

  const [prevRouteConversationId, setPrevRouteConversationId] = useState(routeConversationId);

  if (routeConversationId !== prevRouteConversationId) {
    setPrevRouteConversationId(routeConversationId);
    // Đổi hội thoại thì panel "thông tin hội thoại" phải đóng, không chỉ khi rời
    // hẳn khỏi /chat/:id. Trước đây giữ nguyên panel cũ nên sang Cloud là hiện
    // CÙNG LÚC hai panel (GroupInfo cũ + panel Cloud), timeline bị bóp lệch, và
    // GroupInfo còn gọi API nhóm lên id Cloud -> 400 "Target conversation is not
    // a group" rồi văng ra màn lỗi 500.
    if (infoPanelMode === "conversation") {
      setIsInfoPanelOpen(false);
    }
  }

  // Handle back (mobile)
  const handleBack = useCallback(() => {
    navigate("/chat");
  }, [navigate]);

  /**
   * Merge a just-created conversation into the sidebar instead of refetching
   * the whole list. If the create response already carries a full shape we use
   * it directly (instant sidebar + makes the room "cached" so ChatWindow can
   * render immediately). If it doesn't, we deliberately do NOT fetch the detail
   * here: navigating to `/chat/:id` makes `useConversationValidation` fetch the
   * authoritative conversation via `getConversationById` exactly once and merge
   * it. Fetching here too would re-introduce a duplicate detail call — the very
   * thing this optimization removes.
   */
  const mergeCreatedConversation = useCallback(
    (conversationId: string, createdPayload: unknown, context: string) => {
      if (isCompleteConversation(createdPayload)) {
        addConversation(createdPayload);
        if (import.meta.env.DEV) {
          logger.debug("conversation", "created_conversation_merged", {
            conversationId,
            context,
            source: "create_response",
          });
        }
        return;
      }

      if (import.meta.env.DEV) {
        logger.debug("conversation", "created_conversation_deferred_to_validation", {
          conversationId,
          context,
          reason: "create_response_incomplete",
        });
      }
    },
    [addConversation],
  );

  // Handle new chat
  const handleStartChat = useCallback(
    async (userId: string) => {
      logger.debug("direct_dm", "source_trace", {
        source: "ChatPage.handleStartChat",
        userId,
      });

      if (!isUuid(typeof userId === "string" ? userId.trim() : "")) {
        toast.error(
          t("chat:contactShare.invalidProfile", {
            defaultValue: "This contact card cannot start a chat.",
          }),
        );
        return;
      }

      if (isCreatingRoom) {
        return;
      }

      if (roomCreationLockRef.current) {
        return;
      }
      roomCreationLockRef.current = true;
      setIsCreatingRoom(true);
      try {
        const { createPrivateConversationUseCase } =
          await loadConversationMutationUseCases();
        const response = await createPrivateConversationUseCase(userId);
        const payload = unwrapApiSuccess(response);
        const conversationId = resolveConversationId(payload, {
          source: "ChatPage.handleStartChat.createPrivateConversation",
          includeEntityId: true,
        });
        if (!conversationId) {
          throw new Error(t("error:chat.conversationIdMissing"));
        }

        // Merge the new room into the sidebar (no full-list refetch). The route
        // validation hook fetches the authoritative shape once after navigate.
        mergeCreatedConversation(conversationId, payload, "create_direct");
        selectConversation(conversationId);
        navigate(`/chat/${conversationId}`);
      } catch (error) {
        const apiError = extractApiError(error);
        const details =
          apiError.details && typeof apiError.details === "object"
            ? (apiError.details as Record<string, unknown>)
            : null;
        const existingConversationId = resolveConversationId(details, {
          source: "ChatPage.handleStartChat.errorDetails",
        });

        if (
          existingConversationId &&
          (apiError.code === ErrorCode.CONFLICT ||
            apiError.code === ErrorCode.ROOM_ALREADY_EXISTS)
        ) {
          // Existing room — no full conversation payload to merge here. The
          // route validation hook fetches + merges it via getConversationById
          // once after navigate, so we skip the full-list refetch.
          selectConversation(existingConversationId);
          navigate(`/chat/${existingConversationId}`);
          return;
        }

        logger.error("conversation", "create_direct_failed", apiError);
        if (apiError.code === ErrorCode.DIRECT_CHAT_TARGET_UNAVAILABLE) {
          void refreshFriendshipDirectory({
            reason: "explicit_refresh",
            includeFullSnapshot: true,
          });
        }
        toast.error(
          apiError.message || t("error:chat.startConversationFailed"),
        );
      } finally {
        roomCreationLockRef.current = false;
        setIsCreatingRoom(false);
      }
    },
    [
      isCreatingRoom,
      mergeCreatedConversation,
      navigate,
      refreshFriendshipDirectory,
      selectConversation,
      t,
    ],
  );

  const handleOpenCurrentUserProfile = useCallback(() => {
    if (!currentUserSummary) return;
    openSelfProfile();
  }, [currentUserSummary, openSelfProfile]);

  const handleCreateGroup = useCallback(
    async (payload: { name: string; memberIds: string[] }) => {
      if (isCreatingRoom) {
        return;
      }

      if (roomCreationLockRef.current) {
        return;
      }
      roomCreationLockRef.current = true;
      setIsCreatingRoom(true);
      try {
        const { createGroupConversationUseCase } =
          await loadConversationMutationUseCases();
        const response = await createGroupConversationUseCase({
          name: payload.name,
          memberIds: payload.memberIds,
        });
        const conversationPayload = unwrapApiSuccess(response);
        const conversationId = resolveConversationId(conversationPayload, {
          source: "ChatPage.handleCreateGroup.createGroupConversation",
          includeEntityId: true,
        });
        if (!conversationId) {
          throw new Error(t("error:chat.conversationIdMissing"));
        }

        // Merge the new group into the sidebar (no full-list refetch). The route
        // validation hook fetches the authoritative shape once after navigate.
        mergeCreatedConversation(
          conversationId,
          conversationPayload,
          "create_group",
        );
        selectConversation(conversationId);
        navigate(`/chat/${conversationId}`);
      } catch (error) {
        const apiError = extractApiError(error);
        logger.error("conversation", "create_group_failed", apiError);
        toast.error(apiError.message || t("error:chat.createGroupFailed"));
      } finally {
        roomCreationLockRef.current = false;
        setIsCreatingRoom(false);
      }
    },
    [
      isCreatingRoom,
      mergeCreatedConversation,
      navigate,
      selectConversation,
      t,
    ],
  );

  // Handle new chat modal
  const handleOpenNewChat = useCallback(() => {
    setIsNewChatModalOpen(true);
  }, []);

  const handleOpenAddFriendModal = useCallback(() => {
    setIsAddFriendModalOpen(true);
  }, []);

  useEffect(() => {
    if (consumeOpenNewChatIntent()) {
      setTimeout(() => setIsNewChatModalOpen(true), 0);
    }

    const openFromCommandPalette = () => {
      setIsNewChatModalOpen(true);
    };

    window.addEventListener(CHAT_OPEN_NEW_CHAT_EVENT, openFromCommandPalette);
    return () => {
      window.removeEventListener(
        CHAT_OPEN_NEW_CHAT_EVENT,
        openFromCommandPalette,
      );
    };
  }, []);

  const shouldRenderInfoContent =
    isInfoPanelOpen &&
    (infoPanelMode === "self-profile" ||
      infoPanelMode === "contact-profile" ||
      (infoPanelMode === "conversation" && Boolean(routeConversationId)));
  const isDockedInfoPanelViewport = chatLayoutBreakpoint === "wide";
  const chatLayoutState = useMemo<ChatLayoutState>(() => {
    if (chatLayoutBreakpoint === "compact") {
      return "mobile";
    }

    return shouldRenderInfoContent && isDockedInfoPanelViewport
      ? "with-panel"
      : "normal";
  }, [
    chatLayoutBreakpoint,
    isDockedInfoPanelViewport,
    shouldRenderInfoContent,
  ]);
  const chatWindowLayoutState = useMemo<ChatLayoutState>(() => {
    return chatLayoutBreakpoint === "compact" ? "mobile" : "normal";
  }, [chatLayoutBreakpoint]);
  const sidebarLayoutState = useMemo<ChatLayoutState>(() => {
    return chatLayoutBreakpoint === "compact" ? "mobile" : "normal";
  }, [chatLayoutBreakpoint]);

  const showConversationSkeleton =
    (!hasFetchedConversationsOnce && conversationCount === 0) ||
    (isLoadingConversations && conversationCount === 0);

  useEffect(() => {
    if (isInfoPanelOpen || infoPanelMode === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setInfoPanelMode(null);
    }, INFO_PANEL_EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [infoPanelMode, isInfoPanelOpen]);

  const handleOpenFilePreview = useCallback(
    (attachment: Attachment) => {
      if (!selectedConversation) {
        return;
      }

      const cachedMessages = rtkChatApi.endpoints.getMessages
        .select({ conversationId: selectedConversation.id })(store.getState())
        .data?.messages ?? [];

      const gallery: PreviewTarget[] = cachedMessages
        .flatMap((message) => {
          const { uploaderName, uploaderAvatarUrl } =
            getPreviewSender(message);
          const createdAt = message.createdAt || null;

          return (message.attachments ?? []).map((candidate) => ({
            attachment: candidate,
            conversationId: selectedConversation.id,
            messageId: message.id,
            previewType: getPreviewType(
              candidate.mimeType,
              candidate.fileName,
            ) as PreviewType,
            uploaderName,
            uploaderAvatarUrl,
            createdAt,
          }));
        })
        .filter((candidate) => candidate.previewType !== "unknown");

      const parentMessage = cachedMessages.find((m) =>
        (m.attachments ?? []).some(
          (a) =>
            (attachment.id && a.id === attachment.id) ||
            (attachment.objectKey && a.objectKey === attachment.objectKey) ||
            (attachment.url && a.url === attachment.url),
        ),
      );

      const targetSender = parentMessage
        ? getPreviewSender(parentMessage)
        : { uploaderName: null, uploaderAvatarUrl: null };
      const targetCreatedAt = parentMessage?.createdAt || null;

      const target: PreviewTarget = {
        attachment,
        conversationId: selectedConversation.id,
        messageId: parentMessage?.id,
        previewType: getPreviewType(
          attachment.mimeType,
          attachment.fileName,
        ) as PreviewType,
        uploaderName: targetSender.uploaderName,
        uploaderAvatarUrl: targetSender.uploaderAvatarUrl,
        createdAt: targetCreatedAt,
      };

      filePreview.open(target, gallery.length > 0 ? gallery : undefined);
    },
    [filePreview, selectedConversation],
  );

  const routeJumpMessageId =
    routeIntent?.type === "open-conversation"
      ? routeIntent.messageId || null
      : null;
  const routeJumpConversationId =
    routeIntent?.type === "open-conversation"
      ? routeIntent.conversationId
      : null;

  const handleExternalJumpHandled = useCallback(
    (messageId: string) => {
      setExternalJumpTarget((current) =>
        current?.messageId === messageId ? null : current,
      );
      if (routeJumpMessageId === messageId) {
        navigate(location.pathname, { replace: true, state: null });
      }
    },
    [location.pathname, navigate, routeJumpMessageId],
  );

  // Jump the open timeline to a message in the current conversation (e.g. tapping
  // a poll in the info-panel history list). Bump the version so re-tapping the
  // same message re-triggers the scroll. Close the info panel so the jump is
  // visible (on mobile it overlays the timeline).
  const handleJumpToMessageInConversation = useCallback(
    (messageId: string) => {
      if (!messageId) return;
      if (!selectedConversation) return;
      setExternalJumpTarget({
        conversationId: selectedConversation.id,
        messageId,
      });
      setExternalJumpRequestVersion((current) => current + 1);
      closeInfoPanel();
    },
    [closeInfoPanel, selectedConversation],
  );

  useEffect(() => {
    return listenForContactProfileView(({ userId }) => {
      if (!userId) return;
      openContactProfile(userId);
    });
  }, [openContactProfile]);

  useEffect(() => {
    return listenForMentionProfileView(({ userId, displayName, avatarUrl }) => {
      if (!userId) return;
      setMentionProfile({ userId, displayName, avatarUrl });
    });
  }, []);

  useEffect(() => {
    return listenForFileSourceInvalidated(({ conversationId }) => {
      if (previewConversationId === conversationId) {
        closeFilePreview();
      }
    });
  }, [closeFilePreview, previewConversationId]);

  const handledRouteIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routeIntent || handledRouteIntentRef.current === routeIntent.requestId) {
      return;
    }
    handledRouteIntentRef.current = routeIntent.requestId;

    if (routeIntent.type === "start-direct-message") {
      void handleStartChat(routeIntent.userId);
    }
  }, [handleStartChat, routeIntent]);

  const handleRetryBootstrap = useCallback(() => {
    void refreshUser().then(() => {
      if (useAuthStore.getState().user) {
        void fetchConversations();
      }
    });
  }, [fetchConversations, refreshUser]);

  if (!currentUserSummary) {
    if (!isAuthInitialized || isAuthLoading) {
      return <ChatWorkspaceSkeleton />;
    }

    return (
      <div className="flex h-full items-center justify-center bg-[hsl(var(--color-chat-canvas))] px-6">
        <ErrorState
          title={t("error:auth.profileMissing", {
            defaultValue: "Unable to load profile",
          })}
          message={t("error:auth.profileRetryHint", {
            defaultValue:
              "We could not load your session profile. Please retry.",
          })}
          onRetry={handleRetryBootstrap}
        />
      </div>
    );
  }

  return (
    <AppShell
      className="chat-page-shell"
      data-chat-layout-state={chatLayoutState}
      moduleSidebar={
        <ModuleSidebar
          className="chat-page-module-sidebar"
          contentClassName="min-h-0"
        >
          <div className="h-full min-h-0 w-full">
            <FeatureErrorBoundary name="Danh sách hội thoại">
              <Sidebar
                layoutState={sidebarLayoutState}
                currentUser={currentUserSummary}
                selectedId={routeConversationId}
                isLoadingMoreConversations={isLoadingMoreConversations}
                hasMoreConversations={hasMoreConversations}
                showConversationSkeleton={showConversationSkeleton}
                conversationsError={conversationsError}
                onSelectConversation={handleSelectConversation}
                onRetryConversations={fetchConversations}
                onLoadMoreConversations={handleLoadMoreConversations}
                onCurrentUserClick={handleOpenCurrentUserProfile}
                onAddFriendClick={handleOpenAddFriendModal}
              />
            </FeatureErrorBoundary>
          </div>
        </ModuleSidebar>
      }
    >

      {/* Chat window */}
      <div
        ref={chatPaneRef}
        tabIndex={-1}
        className={clsx(
          "relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--chat-panel-bg))]",
          !selectedConversation && "hidden md:flex",
        )}
      >
        {isRoutePersonalCloud ? (
          <React.Suspense fallback={<PersonalCloudSurfaceSkeleton />}>
            <PersonalCloudConversationSurface onBack={handleBack} conversationId={routeConversationId ?? undefined} />
          </React.Suspense>
        ) : selectedConversation ? (
          <ChatWindow
            layoutState={chatWindowLayoutState}
            conversation={selectedConversation}
            currentUser={currentUserSummary}
            typingStatus={typingStatus || undefined}
            typingStatuses={typingStatuses}
            onSendMessage={handleSendMessage}
            onReactMessage={handleReactMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onToggleInfoPanel={handleToggleInfoPanel}
            onCloseInfoPanel={closeInfoPanel}
            onBack={handleBack}
            onTyping={sessionHandleTyping}
            hasMoreMessages={sessionCurrentHasMore}
            isLoadingMessages={
              sessionCurrentIsLoading || !sessionIsConversationHistoryReady
            }
            historyLoadingState={
              sessionIsHistoryPartial
                ? {
                  stage: sessionCurrentHistoryStage,
                  isPartial: sessionIsHistoryPartial,
                }
                : null
            }
            onLoadOlderMessages={sessionHandleLoadOlderMessages}
            onImageClick={setImagePreview}
            onFilePreview={handleOpenFilePreview}
            messageError={sessionCurrentMessageError}
            onRetryMessages={sessionHandleRetryMessages}
            onReachedLatestMessage={sessionHandleReachedLatestMessage}
            connectionState={connectionState}
            isConversationReady={sessionIsConversationReady}
            externalJumpToMessageId={
              routeJumpConversationId === routeConversationId &&
              routeJumpConversationId === selectedConversation.id
                ? routeJumpMessageId
                : externalJumpTarget?.conversationId ===
                      routeConversationId &&
                    externalJumpTarget.conversationId ===
                      selectedConversation.id
                  ? externalJumpTarget.messageId
                  : null
            }
            externalJumpRequestVersion={
              routeJumpMessageId
                ? routeIntent?.requestId
                : externalJumpRequestVersion
            }
            onExternalJumpHandled={handleExternalJumpHandled}
          />
        ) : routeConversationId &&
          conversationValidationError?.conversationId ===
          routeConversationId ? (
          <div className="flex h-full items-center justify-center px-6">
            <ErrorState
              title={t("error:chat.conversationOpenFailed", {
                defaultValue: "Unable to open conversation",
              })}
              message={conversationValidationError.message}
              onRetry={handleRetryConversationValidation}
            />
          </div>
        ) : (
          <NoChatSelected onNewChat={handleOpenNewChat} />
        )}
      </div>

      {/* Info panel */}
      {/* Route Cloud có panel riêng (HacomCloudInfoSidebar) nên panel của ChatPage
          phải im lặng hoàn toàn — nhánh `Boolean(selectedConversation)` trước đây
          không chặn nên hai panel cùng hiện khi chuyển từ nhóm sang Cloud. */}
      {(infoPanelMode === "self-profile" ||
        (infoPanelMode === "conversation" && Boolean(routeConversationId) && !isRoutePersonalCloud) ||
        (Boolean(selectedConversation) && !isRoutePersonalCloud)) && (
          <div
            className={clsx(
              "fixed inset-y-0 right-0 z-40 w-full max-w-full transform-gpu border-l transition-[transform,border-color] duration-300 ease-out sm:max-w-[min(24rem,94vw)] xl:relative xl:z-0 xl:max-w-none xl:flex-shrink-0 xl:overflow-hidden xl:bg-transparent xl:transition-[width,border-color] xl:duration-300",
              isInfoPanelOpen
                ? "translate-x-0 border-border/70 xl:w-[var(--app-inspector-width)]"
                : "translate-x-full border-border/0 xl:w-0",
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
              {infoPanelMode !== null ? (
                <React.Suspense fallback={<DeferredPanelFallback />}>
                  {infoPanelMode === "self-profile" ? (
                    <UserProfile
                      key={`self-profile:${currentUserSummary.id}`}
                      userId={currentUserSummary.id}
                      currentUserId={currentUserSummary.id}
                      initialUser={{
                        id: currentUserSummary.id,
                        username: currentUserSummary.username,
                        displayName: currentUserSummary.displayName,
                        avatar: currentUserSummary.avatar,
                        status: currentUserSummary.status,
                      }}
                      onClose={closeInfoPanel}
                      onStartConversation={handleStartChat}
                    />
                  ) : infoPanelMode === "contact-profile" && contactProfileUserId ? (
                    <UserProfile
                      key={`contact-profile:${contactProfileUserId}`}
                      userId={contactProfileUserId}
                      currentUserId={currentUserSummary.id}
                      onClose={closeInfoPanel}
                      onStartConversation={handleStartChat}
                    />
                  ) : infoPanelMode === "conversation" && !selectedConversation ? (
                    <DeferredPanelFallback />
                  ) : isSelectedDirectConversation ? (
                    otherUser ? (
                      <UserProfile
                        key={`conversation-profile:${selectedConversation?.id ?? "unknown"}:${otherUser.id}`}
                        userId={otherUser.id}
                        currentUserId={currentUserSummary.id}
                        conversationId={selectedConversation?.id}
                        conversationContext="direct"
                        initialUser={{
                          id: otherUser.id,
                          username: otherUser.username,
                          displayName: otherUser.displayName,
                          avatar: otherUser.avatar,
                          status: otherUser.status,
                        }}
                        onClose={closeInfoPanel}
                        onStartConversation={handleStartChat}
                        onJumpToMessage={handleJumpToMessageInConversation}
                      />
                    ) : (
                      <ProfileSkeleton />
                    )
                  ) : selectedConversation && !isRoutePersonalCloud ? (
                    <GroupInfo
                      conversation={selectedConversation}
                      currentUserId={currentUserSummary.id}
                      onClose={closeInfoPanel}
                      onStartConversation={handleStartChat}
                      onJumpToMessage={handleJumpToMessageInConversation}
                    />
                  ) : null}
                </React.Suspense>
              ) : null}
            </div>
          </div>
        )}

      {/* Info panel overlay (mobile) */}
      {isInfoPanelOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-text-primary/50 xl:hidden"
          onClick={closeInfoPanel}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeInfoPanel();
          }}
          aria-label={t("common:actions.close")}
        />
      )}

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <React.Suspense fallback={<DeferredModalFallback />}>
          <NewChatModal
            isOpen={isNewChatModalOpen}
            onClose={() => setIsNewChatModalOpen(false)}
            onStartChat={handleStartChat}
            onCreateGroup={handleCreateGroup}
            isSubmitting={isCreatingRoom}
          />
        </React.Suspense>
      )}

      {/* Add Friend Modal */}
      {isAddFriendModalOpen && (
        <React.Suspense fallback={<DeferredModalFallback />}>
          <AddFriendModal
            isOpen={isAddFriendModalOpen}
            onClose={() => setIsAddFriendModalOpen(false)}
          />
        </React.Suspense>
      )}

      {/* Mention profile modal */}
      {mentionProfile && currentUserSummary && (
        <DraggableProfileModal onClose={() => setMentionProfile(null)}>
          <React.Suspense fallback={null}>
            <UserProfile
              userId={mentionProfile.userId}
              currentUserId={currentUserSummary.id}
              conversationContext="group"
              initialUser={(() => {
                const cached = getCachedUserProfile(mentionProfile.userId) as
                  | { avatar?: string | null; avatarUrl?: string | null; displayName?: string }
                  | undefined;
                // Avatar URLs are short-lived presigned S3 links (~15 min).
                // Prefer the mention's URL — it is captured at click time from
                // the freshly fetched message, so it is the least likely to be
                // expired. The cached profile copy can hold a stale (expired)
                // signature that would 403 and fall back to initials.
                const avatarUrl = resolvePublicResourceUrl(
                  mentionProfile.avatarUrl || cached?.avatar || cached?.avatarUrl || undefined,
                );
                return {
                  id: mentionProfile.userId,
                  displayName: cached?.displayName || mentionProfile.displayName,
                  avatar: avatarUrl,
                };
              })()}
              onClose={() => setMentionProfile(null)}
              onStartConversation={async (uid) => {
                setMentionProfile(null);
                await handleStartChat(uid);
              }}
            />
          </React.Suspense>
        </DraggableProfileModal>
      )}

      {/* Image Preview Modal */}
      {imagePreview && (
        <React.Suspense fallback={<DeferredModalFallback />}>
          <ImagePreviewModalGallery imagePreview={imagePreview} onClose={() => setImagePreview(null)} />
        </React.Suspense>
      )}

      {/* File Preview Modal */}
      {(filePreview.isOpen || filePreview.current) && (
        <React.Suspense fallback={<DeferredModalFallback />}>
          <FilePreviewModal
            isOpen={filePreview.isOpen}
            onClose={filePreview.close}
            current={filePreview.current}
            currentIndex={filePreview.currentIndex}
            totalItems={filePreview.totalItems}
            secureUrl={filePreview.secureUrl}
            isLoadingUrl={filePreview.isLoadingUrl}
            urlError={filePreview.urlError}
            hasPrev={filePreview.hasPrev}
            hasNext={filePreview.hasNext}
            onPrev={filePreview.prev}
            onNext={filePreview.next}
            onRefreshUrl={filePreview.refreshUrl}
          />
        </React.Suspense>
      )}

      <ConfirmDialog
        isOpen={pendingDeleteMessage !== null}
        onClose={closePendingDeleteMessage}
        onConfirm={() => {
          void confirmDeleteMessage();
        }}
        title={
          pendingDeleteMessage?.mode === "FOR_EVERYONE"
            ? pendingDeleteMessage.isAdminDeletion
              ? t("chat:confirm.deleteByAdminTitle", {
                defaultValue: "Xóa tin nhắn ở mọi người?",
              })
              : t("chat:confirm.deleteForEveryoneTitle", {
                defaultValue: "Thu hồi tin nhắn?",
              })
            : t("chat:confirm.deleteForMeTitle", {
              defaultValue: "Xóa tin nhắn ở phía bạn?",
            })
        }
        message={
          pendingDeleteMessage?.mode === "FOR_EVERYONE"
            ? pendingDeleteMessage.isAdminDeletion
              ? t("chat:confirm.deleteByAdmin", {
                defaultValue:
                  "Bạn đang xóa tin nhắn của thành viên khác với tư cách quản trị viên. Mọi người trong cuộc trò chuyện sẽ không còn thấy nội dung này.",
              })
              : t("chat:confirm.deleteForEveryone", {
                defaultValue:
                  "Tin nhắn này sẽ bị thu hồi với tất cả mọi người trong cuộc trò chuyện. Người khác sẽ không còn xem được nội dung tin nhắn.",
              })
            : t("chat:confirm.deleteForMe", {
              defaultValue:
                "Tin nhắn này chỉ bị xóa khỏi giao diện của bạn. Những người khác trong cuộc trò chuyện vẫn có thể xem tin nhắn.",
            })
        }
        confirmText={
          pendingDeleteMessage?.mode === "FOR_EVERYONE"
            ? pendingDeleteMessage.isAdminDeletion
              ? t("chat:confirm.deleteByAdminButton", {
                defaultValue: "Xóa ở mọi người",
              })
              : t("chat:confirm.recall", { defaultValue: "Thu hồi" })
            : t("common:actions.delete", { defaultValue: "Xóa" })
        }
        isLoading={isDeletingMessage}
        variant="danger"
      />
    </AppShell>
  );
};

export default ChatPage;
