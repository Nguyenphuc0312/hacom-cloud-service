import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationLane } from "../../../components/layout/ConversationLane";
import { ChatHeader } from "../../../components/chat/ChatHeader";
import { MessageInput } from "../../../components/input/MessageInput";
import { ForwardModal } from "../../../components/chat/ForwardModal";
import { SimpleVirtualizedChatTimeline } from "../../chat/simple-virtual-timeline";
import { useDeleteMessageMutation, useGetMessagesQuery } from "../../api/chatApi";
import { useAuthStore, useChatStore } from "../../../stores";
import { useUIStore } from "../../../stores/uiStore";
import { useGlobalWebSocket } from "../../realtime/GlobalWebSocketProvider";
import { cloudApi, type CloudAsset } from "../api/cloudApi";
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

export const PersonalCloudConversationSurface: React.FC<{ onBack?: () => void; conversationId?: string }> = ({ onBack, conversationId: knownConversationId }) => {
  const user = useAuthStore((state) => state.user);
  const density = useUIStore((state) => state.chatDensity);
  const { joinConversation, leaveConversation } = useGlobalWebSocket();
  const [space, setSpace] = useState<CloudSpace | null>(null);
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [draft, setDraft] = useState("");
  // ponytail: mặc định đóng mỗi lần vào, không nhớ trạng thái (chốt với user 07-08-26)
  const [infoOpen, setInfoOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const filePreview = useFilePreview();
  const [error, setError] = useState<string | null>(null);

  // ChatPage đã gọi ensure() để giải id trước khi render surface này. Gọi lại là
  // thừa và làm nghẽn lượt mở đầu tiên — chỉ ensure() khi không được truyền id.
  const refresh = useCallback(async () => {
    try {
      const [nextSpace, nextAssets] = await Promise.all([
        knownConversationId ? Promise.resolve(null) : cloudApi.ensure(),
        cloudApi.list({ includeTrashed: true, limit: 100 }),
      ]);
      if (nextSpace) setSpace(nextSpace);
      setAssets(nextAssets.items);
      setError(null);
    } catch {
      setError("Không thể tải Hacom Cloud. Vui lòng thử lại.");
    }
  }, [knownConversationId]);

  // assets vẫn cần ngay (dùng lọc message của file đã xóa), nhưng không chặn render:
  // timeline và composer hiện trước, danh sách file điền vào sau.
  useEffect(() => { void refresh(); }, [refresh]);

  // quota chỉ hiện trong panel thông tin (mặc định đóng) → nạp khi thật sự mở.
  useEffect(() => {
    if (!knownConversationId || !infoOpen || space) return;
    void cloudApi.ensure().then(setSpace).catch(() => undefined);
  }, [infoOpen, knownConversationId, space]);
  useEffect(() => {
    const sync = () => { void refresh(); };
    wsManager.on("cloud:asset:created", sync);
    wsManager.on("cloud:asset:trashed", sync);
    wsManager.on("cloud:quota:changed", sync);
    return () => {
      wsManager.off("cloud:asset:created", sync);
      wsManager.off("cloud:asset:trashed", sync);
      wsManager.off("cloud:quota:changed", sync);
    };
  }, [refresh]);

  // Ưu tiên id ChatPage đã giải sẵn để composer không bị khóa trong lúc chờ ensure().
  const conversationId = space?.conversationId ?? knownConversationId ?? "";
  const conversation = useChatStore((state) => (conversationId ? state.conversationById[conversationId] : undefined));
  useEffect(() => {
    if (!conversationId) return;
    joinConversation(conversationId);
    return () => leaveConversation(conversationId);
  }, [conversationId, joinConversation, leaveConversation]);

  const messagesQuery = useGetMessagesQuery({ conversationId, limit: 50 }, { skip: !conversationId, refetchOnReconnect: true });
  const [deleteMessage] = useDeleteMessageMutation();
  const uploadQueue = useCloudUploadQueue(() => { void refresh(); void messagesQuery.refetch(); });
  const hiddenCloudMessageIds = useMemo(() => new Set(assets.filter((asset) => asset.status === "trashed").map((asset) => asset.messageId).filter((id): id is string => Boolean(id))), [assets]);
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

  const handleDelete = useCallback(async (messageId: string, mode: "FOR_ME" | "FOR_EVERYONE" = "FOR_EVERYONE") => {
    const asset = assets.find((candidate) => candidate.messageId === messageId && candidate.status === "available");
    try {
      if (asset) await cloudApi.trash(asset.id);
      else if (conversationId) await deleteMessage({ conversationId, messageId, mode }).unwrap();
      await Promise.all([refresh(), messagesQuery.refetch()]);
    } catch {
      setError("Không thể xóa nội dung Cloud. Vui lòng thử lại.");
    }
  }, [assets, conversationId, deleteMessage, messagesQuery, refresh]);

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
        ? <ChatHeader conversation={conversation} currentUserId={user.id} onInfoClick={() => setInfoOpen((open) => !open)} onBack={onBack} />
        : <header className="chat-header shrink-0 border-b border-border/70 bg-surface"><ConversationLane><div className="chat-header-row flex min-h-[var(--app-header-height)] items-center gap-3"><PersonalCloudAvatar /><div className="min-w-0 flex-1"><h1 className="truncate text-[15px] font-medium">{personalCloudPresentation.title}</h1><p className="truncate text-xs text-text-muted">{personalCloudPresentation.subtitle}</p></div></div></ConversationLane></header>}
      {error && <p role="alert" className="mx-4 mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="min-h-0 flex-1">{conversationId && user ? <SimpleVirtualizedChatTimeline conversationId={conversationId} conversationType={personalCloudTimelineType} currentUserId={user.id} messages={visibleMessages} onReply={() => undefined} onReact={() => undefined} onForward={personalCloudPolicy.allowForward ? setForwardMessage : undefined} onDelete={personalCloudPolicy.allowDelete ? handleDelete : undefined} isInitialLoading={messagesQuery.isLoading} layoutState="normal" density={density} /> : null}</div>
      <div className="shrink-0 border-t border-border/70 bg-surface px-[var(--chat-lane-padding)] py-2"><div className="mx-auto w-full max-w-[var(--chat-content-lane)]"><MessageInput value={draft} onChange={setDraft} onSend={sendNote} mode="normal" conversationId={conversationId} conversationName="Cloud của tôi" placeholder="Nhập ghi chú hoặc gửi tài liệu lên Hacom Cloud" conversationType="direct" currentUserId={user?.id} sendOnEnter disabled={!conversationId} submitDisabled={uploadQueue.hasUploadingDrafts} attachmentsDisabled={!conversationId} uploadDrafts={uploadQueue.drafts} onAddFiles={uploadQueue.addFiles} onRemoveDraft={uploadQueue.removeDraft} onCancelUpload={uploadQueue.cancelUpload} onRetryUpload={uploadQueue.retryUpload} onClearAllDrafts={uploadQueue.clearAll} hasUploadingDrafts={uploadQueue.hasUploadingDrafts} hasFailedDrafts={uploadQueue.hasFailedDrafts} /></div></div>
    </main>
    <HacomCloudInfoSidebar open={infoOpen} onClose={() => setInfoOpen(false)} quota={space?.quota ?? null} assets={assets} conversationId={conversationId} loading={!space && !error} onChanged={refresh} onPreview={previewAsset} onForward={forwardAsset} />
    {filePreview.isOpen && <FilePreviewModal isOpen current={filePreview.current} secureUrl={filePreview.secureUrl} isLoadingUrl={filePreview.isLoadingUrl} urlError={filePreview.urlError} currentIndex={filePreview.currentIndex} totalItems={filePreview.totalItems} hasPrev={filePreview.hasPrev} hasNext={filePreview.hasNext} onClose={filePreview.close} onPrev={filePreview.prev} onNext={filePreview.next} onRefreshUrl={filePreview.refreshUrl} />}
    {forwardMessage && user ? <ForwardModal messages={[forwardMessage]} currentUserId={user.id} onClose={() => setForwardMessage(null)} /> : null}
  </section>;
};

export default PersonalCloudConversationSurface;
