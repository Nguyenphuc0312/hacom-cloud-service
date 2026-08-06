import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CloudIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { PanelLeft } from "lucide-react";
import { ConversationLane } from "../../../components/layout/ConversationLane";
import { MessageInput } from "../../../components/input/MessageInput";
import { ForwardModal } from "../../../components/chat/ForwardModal";
import { SimpleVirtualizedChatTimeline } from "../../chat/simple-virtual-timeline";
import { useDeleteMessageMutation, useGetMessagesQuery } from "../../api/chatApi";
import { useAuthStore } from "../../../stores";
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
import type { Attachment, Message } from "../../../types";

type CloudSpace = Awaited<ReturnType<typeof cloudApi.ensure>>;

export const PersonalCloudConversationSurface: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const density = useUIStore((state) => state.chatDensity);
  const { joinConversation, leaveConversation } = useGlobalWebSocket();
  const [space, setSpace] = useState<CloudSpace | null>(null);
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(true);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const filePreview = useFilePreview();
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextSpace, nextAssets] = await Promise.all([
        cloudApi.ensure(),
        cloudApi.list({ q: query || undefined, includeTrashed: true, limit: 100 }),
      ]);
      setSpace(nextSpace);
      setAssets(nextAssets.items);
      setError(null);
    } catch {
      setError("Không thể tải Hacom Cloud. Vui lòng thử lại.");
    }
  }, [query]);

  useEffect(() => { void refresh(); }, [refresh]);
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

  const conversationId = space?.conversationId ?? "";
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
        fileName: candidate.originalFilename,
        fileSize: Number(candidate.sizeBytes),
        mimeType: candidate.mimeType,
      } as Attachment,
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
    <aside className="hidden w-[var(--app-sidebar-width)] shrink-0 border-r border-border/70 bg-surface md:flex md:flex-col" aria-label="Hacom Cloud">
      <div className="flex min-h-[var(--app-header-height)] items-center gap-2 border-b border-border/70 px-4 font-semibold"><CloudIcon className="h-5 w-5" />Hacom Cloud</div>
      <label className="m-3 flex items-center gap-2 rounded-lg bg-surface-hover px-3 py-2 text-text-muted"><MagnifyingGlassIcon className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm trong Hacom Cloud" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <button type="button" className="mx-2 flex items-center gap-3 rounded-lg bg-surface-active px-3 py-3 text-left" aria-current="page"><PersonalCloudAvatar size="sm" /><span className="min-w-0"><strong className="block truncate text-sm">Cloud của tôi</strong><small className="block truncate text-text-muted">{assets[0]?.originalFilename ?? "Lưu trữ riêng tư"}</small></span></button>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="chat-header shrink-0 border-b border-border/70 bg-surface"><ConversationLane><div className="chat-header-row flex min-h-[var(--app-header-height)] items-center gap-3"><PersonalCloudAvatar /><div className="min-w-0 flex-1"><h1 className="truncate text-[15px] font-medium">{personalCloudPresentation.title}</h1><p className="truncate text-xs text-text-muted">{personalCloudPresentation.subtitle}</p></div><button type="button" className="chat-header-action inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover" onClick={() => setInfoOpen((open) => !open)} aria-label="Bật hoặc tắt thông tin Hacom Cloud"><PanelLeft className="h-5 w-5" /></button></div></ConversationLane></header>
      {error && <p role="alert" className="mx-4 mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="min-h-0 flex-1">{conversationId && user ? <SimpleVirtualizedChatTimeline conversationId={conversationId} conversationType={personalCloudTimelineType} currentUserId={user.id} messages={visibleMessages} onReply={() => undefined} onReact={() => undefined} onForward={personalCloudPolicy.allowForward ? setForwardMessage : undefined} onDelete={personalCloudPolicy.allowDelete ? handleDelete : undefined} isInitialLoading={messagesQuery.isLoading} layoutState="normal" density={density} /> : null}</div>
      <div className="shrink-0 border-t border-border/70 bg-surface px-[var(--chat-lane-padding)] py-2"><div className="mx-auto w-full max-w-[var(--chat-content-lane)]"><MessageInput value={draft} onChange={setDraft} onSend={sendNote} mode="normal" conversationId={conversationId} conversationName="Cloud của tôi" placeholder="Nhập ghi chú hoặc gửi tài liệu lên Hacom Cloud" conversationType="direct" currentUserId={user?.id} sendOnEnter disabled={!conversationId} submitDisabled={uploadQueue.hasUploadingDrafts} attachmentsDisabled={!conversationId} uploadDrafts={uploadQueue.drafts} onAddFiles={uploadQueue.addFiles} onRemoveDraft={uploadQueue.removeDraft} onCancelUpload={uploadQueue.cancelUpload} onRetryUpload={uploadQueue.retryUpload} onClearAllDrafts={uploadQueue.clearAll} hasUploadingDrafts={uploadQueue.hasUploadingDrafts} hasFailedDrafts={uploadQueue.hasFailedDrafts} /></div></div>
    </main>
    <HacomCloudInfoSidebar open={infoOpen} onClose={() => setInfoOpen(false)} quota={space?.quota ?? null} assets={assets} conversationId={conversationId} loading={!space && !error} onChanged={refresh} onPreview={previewAsset} onForward={forwardAsset} />
    {filePreview.isOpen && <FilePreviewModal isOpen current={filePreview.current} secureUrl={filePreview.secureUrl} isLoadingUrl={filePreview.isLoadingUrl} urlError={filePreview.urlError} currentIndex={filePreview.currentIndex} totalItems={filePreview.totalItems} hasPrev={filePreview.hasPrev} hasNext={filePreview.hasNext} onClose={filePreview.close} onPrev={filePreview.prev} onNext={filePreview.next} onRefreshUrl={filePreview.refreshUrl} />}
    {forwardMessage && user ? <ForwardModal messages={[forwardMessage]} currentUserId={user.id} onClose={() => setForwardMessage(null)} /> : null}
  </section>;
};

export const CloudChatWorkspace: React.FC = () => <PersonalCloudConversationSurface />;
export default CloudChatWorkspace;
