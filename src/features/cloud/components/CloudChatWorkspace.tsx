import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationLane } from "../../../components/layout/ConversationLane";
import { ChatHeader } from "../../../components/chat/ChatHeader";
import { MessageInput } from "../../../components/input/MessageInput";
import { ForwardModal } from "../../../components/chat/ForwardModal";
import { PinnedMessageBar } from "../../../components/chat/PinnedMessageBar";
import { usePinnedMessages } from "../../../hooks";
import { SimpleVirtualizedChatTimeline } from "../../chat/simple-virtual-timeline";
import { useGetMessagesQuery } from "../../api/chatApi";
// useChatStore: lấy conversation để dựng ChatHeader chuẩn (Cloud mở trong danh sách chat).
import { useAuthStore, useChatStore } from "../../../stores";
import { useUIStore } from "../../../stores/uiStore";
import { useGlobalWebSocket } from "../../realtime/GlobalWebSocketProvider";
import { cloudApi, deleteCloudAssetForMessage, type CloudAsset } from "../api/cloudApi";
import wsManager from "../../../lib/socket";
import { useCloudUploadQueue } from "../hooks/useCloudUploadQueue";
import { personalCloudPolicy, personalCloudPresentation, personalCloudTimelineType } from "../personalCloudPolicy";
import { PersonalCloudAvatar } from "./PersonalCloudAvatar";
import { HacomCloudInfoSidebar } from "./HacomCloudInfoSidebar";
import { FilePreviewModal } from "../../../components/modals/FilePreviewModal";
import { useFilePreview } from "../../../hooks/useFilePreview";
import { getMimePreviewType } from "../../../utils/mimeRegistry";
import { FileType, type Message } from "../../../types";

type CloudSpace = Awaited<ReturnType<typeof cloudApi.ensure>>;

const SearchPanel = React.lazy(() => import("../../../components/chat/SearchPanel"));
const PinnedMessagesPanel = React.lazy(() => import("../../../components/chat/PinnedMessagesPanel"));

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

  useEffect(() => { void refresh(); }, [refresh]);
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
  useEffect(() => {
    if (!conversationId) return;
    joinConversation(conversationId);
    return () => leaveConversation(conversationId);
  }, [conversationId, joinConversation, leaveConversation]);

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

  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await deleteCloudAssetForMessage(messageId, assets);
      await Promise.all([refresh(), messagesQuery.refetch()]);
    } catch {
      setError("Không thể xóa nội dung Cloud. Vui lòng thử lại.");
    }
  }, [assets, messagesQuery, refresh]);

  const previewAsset = useCallback((asset: CloudAsset) => {
    if (!asset.attachmentId || !conversationId) return;
    const toTarget = (candidate: CloudAsset) => ({
      conversationId,
      attachment: {
        id: candidate.attachmentId ?? "",
        type: candidate.mediaType === "image" ? FileType.IMAGE : candidate.mediaType === "video" ? FileType.VIDEO : FileType.OTHER,
        fileName: candidate.originalFilename,
        fileSize: Number(candidate.sizeBytes),
        mimeType: candidate.mimeType,
      },
      previewType: getMimePreviewType(candidate.mimeType, candidate.originalFilename),
    });
    const gallery = assets.filter((candidate) => candidate.status === "available" && Boolean(candidate.attachmentId)).map(toTarget);
    filePreview.open(toTarget(asset), gallery);
  }, [assets, conversationId, filePreview]);

  const forwardAsset = useCallback((asset: CloudAsset) => {
    const message = (messagesQuery.data?.messages ?? []).find((candidate) => candidate.id === asset.messageId);
    if (message) setForwardMessage(message);
  }, [messagesQuery.data?.messages]);

  return <section className="flex h-full min-h-0 overflow-hidden bg-surface text-text-primary">
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {conversation && user
        ? <ChatHeader conversation={conversation} currentUserId={user.id} onInfoClick={() => { setSearchOpen(false); setPinnedOpen(false); setInfoOpen((open) => !open); }} onSearchClick={() => { setInfoOpen(false); setPinnedOpen(false); setSearchOpen((open) => !open); }} onPinnedClick={() => { setInfoOpen(false); setSearchOpen(false); setPinnedOpen((open) => !open); }} onBack={onBack} />
        : <header className="chat-header shrink-0 border-b border-border/70 bg-surface"><ConversationLane><div className="chat-header-row flex min-h-[var(--app-header-height)] items-center gap-3"><PersonalCloudAvatar /><div className="min-w-0 flex-1"><h1 className="truncate text-[15px] font-medium">{personalCloudPresentation.title}</h1><p className="truncate text-xs text-text-muted">{personalCloudPresentation.subtitle}</p></div></div></ConversationLane></header>}
      {error && <p role="alert" className="mx-4 mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {pinnedMessages.length > 0 && user && (
        <PinnedMessageBar pinnedMessages={pinnedMessages} currentUserId={user.id} onOpenList={() => { setInfoOpen(false); setSearchOpen(false); setPinnedOpen(true); }} />
      )}
      <div className="min-h-0 flex-1">{conversationId && user ? <SimpleVirtualizedChatTimeline conversationId={conversationId} conversationType={personalCloudTimelineType} currentUserId={user.id} messages={visibleMessages} onReply={() => undefined} onReact={() => undefined} onForward={personalCloudPolicy.allowForward ? setForwardMessage : undefined} onPin={personalCloudPolicy.allowPin ? handlePin : undefined} onDelete={personalCloudPolicy.allowDelete ? handleDelete : undefined} isInitialLoading={messagesQuery.isLoading} layoutState="normal" density={density} /> : null}</div>
      {/* Không bọc thêm padding/max-width: MessageInput tự canh lane giống ChatWindow.
          Bọc thêm làm ô nhập lệch 32px và hụt 64px so với hội thoại thường. */}
      <div className="sticky bottom-0 z-sticky shrink-0"><MessageInput value={draft} onChange={setDraft} onSend={sendNote} mode="normal" conversationId={conversationId} conversationName="Cloud của tôi" placeholder="Nhập ghi chú hoặc gửi tài liệu lên Hacom Cloud" conversationType="direct" currentUserId={user?.id} sendOnEnter disabled={!conversationId} submitDisabled={uploadQueue.hasUploadingDrafts} attachmentsDisabled={!conversationId} uploadDrafts={uploadQueue.drafts} onAddFiles={uploadQueue.addFiles} onRemoveDraft={uploadQueue.removeDraft} onCancelUpload={uploadQueue.cancelUpload} onRetryUpload={uploadQueue.retryUpload} onClearAllDrafts={uploadQueue.clearAll} hasUploadingDrafts={uploadQueue.hasUploadingDrafts} hasFailedDrafts={uploadQueue.hasFailedDrafts} /></div>
    </main>
    {/* Panel tìm kiếm dùng đúng khung của panel thông tin: cùng bề rộng, cùng đường viền,
        cùng cách phủ toàn màn ở mobile — để Cloud không lệch so với hội thoại thường. */}
    {searchOpen && conversationId ? (
      <React.Suspense fallback={null}>
        <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,400px)] shrink-0 border-l border-border/70 bg-surface shadow-xl lg:static lg:z-auto lg:w-[var(--app-inspector-width)] lg:shadow-none">
          <SearchPanel
            conversationId={conversationId}
            onSelectMessage={() => setSearchOpen(false)}
            onNavigateToMessageId={() => setSearchOpen(false)}
            onClose={() => setSearchOpen(false)}
            className="h-full w-full"
          />
        </aside>
      </React.Suspense>
    ) : null}
    {pinnedOpen && conversationId && user ? (
      <React.Suspense fallback={null}>
        <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,400px)] shrink-0 border-l border-border/70 bg-surface shadow-xl lg:static lg:z-auto lg:w-[var(--app-inspector-width)] lg:shadow-none">
          <PinnedMessagesPanel
            pinnedMessages={pinnedMessages}
            isLoading={pinnedLoading}
            error={pinnedError}
            currentUserId={user.id}
            onClose={() => setPinnedOpen(false)}
            onUnpin={togglePin}
            className="h-full w-full"
          />
        </aside>
      </React.Suspense>
    ) : null}
    <HacomCloudInfoSidebar open={infoOpen && !searchOpen && !pinnedOpen} onClose={() => setInfoOpen(false)} quota={space?.quota ?? null} assets={assets} conversationId={conversationId} loading={!space && !error} error={error} onChanged={refresh} onRetry={() => { void refresh(); }} onPreview={previewAsset} onForward={forwardAsset} />
    {filePreview.isOpen && <FilePreviewModal isOpen current={filePreview.current} secureUrl={filePreview.secureUrl} isLoadingUrl={filePreview.isLoadingUrl} urlError={filePreview.urlError} currentIndex={filePreview.currentIndex} totalItems={filePreview.totalItems} hasPrev={filePreview.hasPrev} hasNext={filePreview.hasNext} onClose={filePreview.close} onPrev={filePreview.prev} onNext={filePreview.next} onRefreshUrl={filePreview.refreshUrl} />}
    {forwardMessage && user ? <ForwardModal messages={[forwardMessage]} currentUserId={user.id} onClose={() => setForwardMessage(null)} /> : null}
  </section>;
};

export default PersonalCloudConversationSurface;
