/* eslint-disable react-refresh/only-export-components -- preview target builder is covered by the Cloud regression suite. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ConversationLane } from "../../../components/layout/ConversationLane";
import { ChatHeader } from "../../../components/chat/ChatHeader";
import { MessageInput, type MessageInputHandle } from "../../../components/input/MessageInput";
import { ForwardModal } from "../../../components/chat/ForwardModal";
import { PinnedMessageBar } from "../../../components/chat/PinnedMessageBar";
import { usePinnedMessages, useMobileViewportMetrics } from "../../../hooks";
import { resolveChatLayoutProfile } from "../../../utils/densityPolicy";
import type { ChatLayoutState } from "../../../utils/densityPolicy";
import { SimpleVirtualizedChatTimeline } from "../../chat/simple-virtual-timeline";
import { useGetMessagesQuery } from "../../api/chatApi";
// useChatStore: lấy conversation để dựng ChatHeader chuẩn (Cloud mở trong danh sách chat).
import { useAuthStore, useChatStore } from "../../../stores";
import { useUIStore } from "../../../stores/uiStore";
import { useGlobalWebSocket } from "../../realtime/GlobalWebSocketProvider";
import { cloudApi, deleteCloudAssetForMessage, type CloudAsset } from "../api/cloudApi";
import { messageApi } from "../../../services/api";
import { isCloudMediaMessage } from "../../../utils/messageActionPolicy";
import wsManager from "../../../lib/socket";
import { useCloudUploadQueue } from "../hooks/useCloudUploadQueue";
import { personalCloudPolicy, personalCloudPresentation, personalCloudTimelineType } from "../personalCloudPolicy";
import { PersonalCloudAvatar } from "./PersonalCloudAvatar";
import { HacomCloudInfoSidebar } from "./HacomCloudInfoSidebar";
import { FilePreviewModal } from "../../../components/modals/FilePreviewModal";
import { useFilePreview, type PreviewTarget } from "../../../hooks/useFilePreview";
import type { Attachment, Message } from "../../../types";
import { toast } from "../../../components/ui";
import { extractApiError } from "../../../lib/apiContract";
import { getMimePreviewType, type PreviewType } from "../../../utils/mimeRegistry";

type CloudSpace = Awaited<ReturnType<typeof cloudApi.ensure>>;

const SearchPanel = React.lazy(() => import("../../../components/chat/SearchPanel"));
const PinnedMessagesPanel = React.lazy(() => import("../../../components/chat/PinnedMessagesPanel"));

const isSameAttachment = (left: Attachment, right: Attachment): boolean =>
  Boolean(
    (left.id && left.id === right.id) ||
    (left.objectKey && left.objectKey === right.objectKey) ||
    (left.url && left.url === right.url),
  );

export const buildCloudPreviewTargets = (
  messages: readonly Message[],
  conversationId: string,
): PreviewTarget[] =>
  messages.flatMap((message) =>
    (message.attachments ?? []).map((attachment) => ({
      attachment,
      conversationId,
      messageId: message.id,
      previewType: getMimePreviewType(
        attachment.mimeType,
        attachment.fileName,
      ) as PreviewType,
      uploaderName: message.senderName || null,
      uploaderAvatarUrl: message.senderAvatar || null,
      createdAt: message.createdAt || null,
    })),
  ).filter((target) => target.previewType !== "unknown");

export const PersonalCloudConversationSurface: React.FC<{ onBack?: () => void; conversationId?: string }> = ({ onBack, conversationId: knownConversationId }) => {
  const user = useAuthStore((state) => state.user);
  const density = useUIStore((state) => state.chatDensity);
  const { joinConversation, leaveConversation } = useGlobalWebSocket();
  const [space, setSpace] = useState<CloudSpace | null>(null);
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [draft, setDraft] = useState("");
  // ponytail: mặc định đóng mỗi lần vào, không nhớ trạng thái (chốt với user 07-08-26)
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Ghim: Cloud có allowPin nhưng trước đây header không có nút, nên tin đã ghim
  // không có đường nào mở ra. Dùng đúng hook + panel của hội thoại thường.
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const filePreview = useFilePreview();
  const [error, setError] = useState<string | null>(null);
  const messageInputRef = useRef<MessageInputHandle>(null);

  // ensure() phải chạy ngay cả khi ChatPage đã giải id: quota CHỈ có trong ensure(),
  // và panel + upload queue (maxUploadBytes) đều cần nó. Hoãn tới lúc mở panel thì
  // panel kẹt ở skeleton vì skeleton dựa vào quota === null.
  // cloudApi.ensure() đã gộp các lời gọi trùng trong cùng một nhịp nên không tốn thêm.
  const refresh = useCallback(async () => {
    try {
      const [nextSpace, nextAssets] = await Promise.all([
        cloudApi.ensure(),
        cloudApi.list({ includeTrashed: true, limit: 100 }),
      ]);
      setSpace(nextSpace);
      setAssets(nextAssets.items);
      setError(null);
    } catch {
      setError("Không thể tải Hacom Cloud. Vui lòng thử lại.");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);
  useEffect(() => {
    const sync = () => { void refresh(); };
    wsManager.on("cloud:asset:created", sync);
    wsManager.on("cloud:asset:trashed", sync);
    wsManager.on("cloud:asset:restored", sync);
    wsManager.on("cloud:quota:changed", sync);
    return () => {
      wsManager.off("cloud:asset:created", sync);
      wsManager.off("cloud:asset:trashed", sync);
      wsManager.off("cloud:asset:restored", sync);
      wsManager.off("cloud:quota:changed", sync);
    };
  }, [refresh]);

  // Ưu tiên id ChatPage đã giải sẵn để composer không bị khóa trong lúc chờ ensure().
  const conversationId = space?.conversationId ?? knownConversationId ?? "";
  const conversation = useChatStore((state) => (conversationId ? state.conversationById[conversationId] : undefined));
  const { pinnedMessages, isLoading: pinnedLoading, error: pinnedError, togglePin } = usePinnedMessages(conversationId || null);
  const viewportMetrics = useMobileViewportMetrics();
  const sidePanelMode =
    searchOpen && conversationId
      ? "search"
      : pinnedOpen && conversationId && user
        ? "pinned"
        : infoOpen
          ? "info"
          : null;
  // Panel mở thì lane phải hẹp lại đúng như hội thoại thường (with-panel).
  const layoutState: ChatLayoutState = viewportMetrics.width < 768
    ? "mobile"
    : sidePanelMode ? "with-panel" : "normal";
  const layoutProfile = useMemo(
    () => resolveChatLayoutProfile(viewportMetrics.width, layoutState),
    [layoutState, viewportMetrics.width],
  );
  useEffect(() => {
    if (!conversationId) return;
    joinConversation(conversationId);
    return () => leaveConversation(conversationId);
  }, [conversationId, joinConversation, leaveConversation]);

  // Auto-focus ô nhập khi mở Cloud, giống mọi hội thoại khác (ChatWindow đã làm việc
  // này qua messageInputRef, nhưng Cloud dựng composer riêng nên chưa có ai gọi).
  // Cùng guard: chỉ desktop (tránh bật bàn phím ảo trên mobile) + đợi 1 frame.
  useEffect(() => {
    if (!conversationId) return;
    if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;
    const rafId = window.requestAnimationFrame(() => {
      messageInputRef.current?.focus({ scrollIntoView: false });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [conversationId]);

  const messagesQuery = useGetMessagesQuery({ conversationId, limit: 50 }, { skip: !conversationId, refetchOnReconnect: true });
  const applyQuota = useCallback((quota: NonNullable<CloudSpace>["quota"]) => {
    setSpace((current) => current ? { ...current, quota } : current);
  }, []);
  const uploadCompleted = useCallback(() => {
    void refresh();
    void messagesQuery.refetch();
  }, [messagesQuery, refresh]);
  const uploadQueue = useCloudUploadQueue(uploadCompleted, space?.maxUploadBytes, applyQuota);
  const hiddenCloudMessageIds = useMemo(() => new Set(assets.filter((asset) => asset.status !== "available").map((asset) => asset.messageId).filter((id): id is string => Boolean(id))), [assets]);
  const visibleMessages = useMemo(() => (messagesQuery.data?.messages ?? []).filter((message) => !hiddenCloudMessageIds.has(message.id)), [hiddenCloudMessageIds, messagesQuery.data?.messages]);
  const previewTargets = useMemo(
    () => buildCloudPreviewTargets(visibleMessages, conversationId),
    [conversationId, visibleMessages],
  );

  const handleOpenFilePreview = useCallback((attachment: Attachment) => {
    const target = previewTargets.find((candidate) =>
      isSameAttachment(candidate.attachment, attachment),
    ) ?? {
      attachment,
      conversationId,
      previewType: getMimePreviewType(
        attachment.mimeType,
        attachment.fileName,
      ) as PreviewType,
    };

    filePreview.open(
      target,
      previewTargets.length > 0 ? previewTargets : undefined,
    );
  }, [conversationId, filePreview, previewTargets]);

  const sendNote = useCallback(async (content?: string) => {
    const normalized = content?.trim() ?? "";
    if (!normalized) return;
    try {
      await cloudApi.note(normalized);
      setDraft("");
      await Promise.all([refresh(), messagesQuery.refetch()]);
    } catch {
      setError("Không thể lưu ghi chú vào Hacom Cloud.");
    }
  }, [messagesQuery, refresh]);

  // Timeline trả messageId, còn togglePin cần cả Message (nó đọc isPinned để biết
  // chiều toggle) nên phải tra ngược từ danh sách đang hiển thị.
  const handlePin = useCallback(async (messageId: string) => {
    const target = visibleMessages.find((message) => message.id === messageId);
    if (!target) return;
    await togglePin(target);
  }, [togglePin, visibleMessages]);

  // Chốt với user 08-08-26: media chiếm dung lượng → thùng rác + Hoàn tác như cũ;
  // ghi chú/link → xóa vĩnh viễn ngay trong 1 thao tác (tombstone, Cloud chỉ có
  // mình mình nên đồng nghĩa mất hẳn), không thùng rác vì chẳng có gì để trả quota.
  const handleDelete = useCallback(async (messageId: string) => {
    const target = visibleMessages.find((message) => message.id === messageId);
    if (!target) return;
    try {
      if (isCloudMediaMessage(target)) {
        const asset = await deleteCloudAssetForMessage(messageId, assets);
        await Promise.all([refresh(), messagesQuery.refetch()]);
        toast.action("Đã xóa nội dung khỏi Cloud", "Hoàn tác", () => {
          void cloudApi.restore(asset.id)
            .then(() => Promise.all([refresh(), messagesQuery.refetch()]))
            .catch((error) => toast.error(extractApiError(error).message));
        });
      } else {
        await messageApi.deleteMessage(messageId, { mode: "FOR_ME" });
        await messagesQuery.refetch();
        toast.success("Đã xóa ghi chú khỏi Cloud");
      }
    } catch (error) {
      setError("Không thể xóa nội dung Cloud. Vui lòng thử lại.");
      toast.error(extractApiError(error).message);
    }
  }, [assets, messagesQuery, refresh, visibleMessages]);


  return <section className="flex h-full min-h-0 overflow-hidden bg-surface text-text-primary">
    {/* `chat-shell` + hai data-attribute là nơi CSS đặt --chat-lane-padding và
        --chat-content-lane. Thiếu chúng, Cloud rơi về giá trị mặc định (54rem)
        nên ô nhập hẹp hơn hội thoại thường 263px và thụt vào 132px. */}
    <main
      className="chat-shell flex min-w-0 flex-1 flex-col overflow-hidden"
      data-chat-layout-profile={layoutProfile}
      data-chat-layout-state={layoutState}
    >
      {conversation && user
        ? <ChatHeader conversation={conversation} currentUserId={user.id} onInfoClick={() => { setSearchOpen(false); setPinnedOpen(false); setInfoOpen((open) => !open); }} onSearchClick={() => { setInfoOpen(false); setPinnedOpen(false); setSearchOpen((open) => !open); }} onPinnedClick={() => { setInfoOpen(false); setSearchOpen(false); setPinnedOpen((open) => !open); }} onBack={onBack} />
        : <header className="chat-header shrink-0 border-b border-border/70 bg-surface"><ConversationLane><div className="chat-header-row flex min-h-[var(--app-header-height)] items-center gap-3"><PersonalCloudAvatar /><div className="min-w-0 flex-1"><h1 className="truncate text-[15px] font-medium">{personalCloudPresentation.title}</h1><p className="truncate text-xs text-text-muted">{personalCloudPresentation.subtitle}</p></div></div></ConversationLane></header>}
      {/* Dải báo lỗi bám sát header và tràn hết bề ngang, giống PinnedMessageBar của
          hội thoại thường — để mép trên khung tin nhắn hai màn trùng nhau. Dùng
          `mx-4 mt-3` sẽ tạo khe 12px và thụt hai bên, nhìn lệch hẳn so với chat. */}
      {error && (
        <div role="alert" className="shrink-0 border-b border-border/70 bg-danger/10">
          <ConversationLane>
            <div className="flex min-h-[44px] items-center py-1.5 text-sm text-danger">{error}</div>
          </ConversationLane>
        </div>
      )}
      {pinnedMessages.length > 0 && user && (
        <PinnedMessageBar pinnedMessages={pinnedMessages} currentUserId={user.id} onOpenList={() => { setInfoOpen(false); setSearchOpen(false); setPinnedOpen(true); }} />
      )}
      <div className="min-h-0 flex-1">{conversationId && user ? <SimpleVirtualizedChatTimeline conversationId={conversationId} conversationType={personalCloudTimelineType} currentUserId={user.id} messages={visibleMessages} onReply={() => undefined} onReact={() => undefined} onForward={personalCloudPolicy.allowForward ? setForwardMessage : undefined} onPin={personalCloudPolicy.allowPin ? handlePin : undefined} onDelete={personalCloudPolicy.allowDelete ? handleDelete : undefined} onFilePreview={handleOpenFilePreview} isInitialLoading={messagesQuery.isLoading} layoutState="normal" density={density} /> : null}</div>
      {/* Không bọc thêm padding/max-width: MessageInput tự canh lane giống ChatWindow.
          Bọc thêm làm ô nhập lệch 32px và hụt 64px so với hội thoại thường. */}
      <div className="sticky bottom-0 z-sticky shrink-0"><MessageInput ref={messageInputRef} value={draft} onChange={setDraft} onSend={sendNote} mode="normal" conversationId={conversationId} conversationName="Cloud của tôi" placeholder="Nhập ghi chú hoặc gửi tài liệu lên Hacom Cloud" conversationType="direct" currentUserId={user?.id} sendOnEnter disabled={!conversationId} submitDisabled={uploadQueue.hasUploadingDrafts} attachmentsDisabled={!conversationId} uploadDrafts={uploadQueue.drafts} onAddFiles={uploadQueue.addFiles} onRemoveDraft={uploadQueue.removeDraft} onCancelUpload={uploadQueue.cancelUpload} onRetryUpload={uploadQueue.retryUpload} onClearAllDrafts={uploadQueue.clearAll} hasUploadingDrafts={uploadQueue.hasUploadingDrafts} hasFailedDrafts={uploadQueue.hasFailedDrafts} /></div>
    </main>
    {/* Panel tìm kiếm dùng đúng khung của panel thông tin: cùng bề rộng, cùng đường viền,
        cùng cách phủ toàn màn ở mobile — để Cloud không lệch so với hội thoại thường. */}
    <div
      className={clsx(
        "fixed inset-y-0 right-0 z-40 w-full max-w-full transform-gpu border-l bg-surface transition-[transform,border-color] duration-300 ease-out sm:max-w-[min(24rem,94vw)] lg:relative lg:z-0 lg:max-w-none lg:shrink-0 lg:overflow-hidden lg:shadow-none lg:transition-[width,border-color]",
        sidePanelMode
          ? "translate-x-0 border-border/70 shadow-xl lg:w-[var(--app-inspector-width)]"
          : "pointer-events-none translate-x-full border-border/0 lg:w-0",
      )}
      aria-hidden={!sidePanelMode}
    >
      <div
        className={clsx(
          "h-full w-full transform-gpu bg-surface transition-[transform,opacity] duration-300 ease-out lg:absolute lg:inset-y-0 lg:right-0 lg:w-[var(--app-inspector-width)]",
          sidePanelMode
            ? "translate-x-0 opacity-100"
            : "translate-x-4 opacity-0 lg:translate-x-6",
        )}
      >
        {sidePanelMode === "search" && conversationId ? (
          <React.Suspense fallback={null}>
            <SearchPanel
              conversationId={conversationId}
              onSelectMessage={() => setSearchOpen(false)}
              onNavigateToMessageId={() => setSearchOpen(false)}
              onClose={() => setSearchOpen(false)}
              className="h-full w-full"
            />
          </React.Suspense>
        ) : null}
        {sidePanelMode === "pinned" && conversationId && user ? (
          <React.Suspense fallback={null}>
            <PinnedMessagesPanel
              pinnedMessages={pinnedMessages}
              isLoading={pinnedLoading}
              error={pinnedError}
              currentUserId={user.id}
              onClose={() => setPinnedOpen(false)}
              onUnpin={togglePin}
              className="h-full w-full"
            />
          </React.Suspense>
        ) : null}
        {sidePanelMode === "info" ? (
          <HacomCloudInfoSidebar
            open
            onClose={() => setInfoOpen(false)}
            quota={space?.quota ?? null}
            assets={assets}
            conversationId={conversationId}
            loading={!space && !error}
            error={error}
            onChanged={refresh}
            onRetry={() => { void refresh(); }}
          />
        ) : null}
      </div>
    </div>
    {filePreview.isOpen && <FilePreviewModal isOpen current={filePreview.current} secureUrl={filePreview.secureUrl} isLoadingUrl={filePreview.isLoadingUrl} urlError={filePreview.urlError} currentIndex={filePreview.currentIndex} totalItems={filePreview.totalItems} hasPrev={filePreview.hasPrev} hasNext={filePreview.hasNext} onClose={filePreview.close} onPrev={filePreview.prev} onNext={filePreview.next} onRefreshUrl={filePreview.refreshUrl} />}
    {forwardMessage && user ? <ForwardModal messages={[forwardMessage]} currentUserId={user.id} onClose={() => setForwardMessage(null)} /> : null}
  </section>;
};

export default PersonalCloudConversationSurface;
