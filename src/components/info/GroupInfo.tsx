import React, { useState, useCallback } from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  CheckIcon,
  UserPlusIcon,
  ArrowRightOnRectangleIcon,
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  NoSymbolIcon,
  CameraIcon,
  ExclamationTriangleIcon,
  UsersIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
  BellIcon,
  BellSlashIcon,
  TrashIcon,
  ChartBarIcon,
  ClockIcon,
  LockClosedIcon,
  TrophyIcon,
  Cog6ToothIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { SquarePen, Pin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "../common/Avatar";
import {
  ConfirmDialog,
  DirectorySkeleton,
  Input,
  Modal,
  toast,
} from "../ui";
import type { Conversation, Message } from "../../types";
import { MessageType, RoomMemberRole } from "../../types";
import type { PollInfo } from "@hacom/chat-shared-types/chat";
import { ReminderHistoryList } from "./ReminderHistoryList";
import { CollapsibleSection } from "./CollapsibleSection";
import { conversationApi, messageApi } from "../../services/api";
import {
  loadUserProfiles,
  invalidateUserProfileSummary,
} from "../../services/userBatchLoader";
import { resolvePublicResourceUrl } from "../../config";
import { useChatStore, useGroupStore } from "../../stores";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import type { InviteLinkItem, JoinRequestItem } from "../../stores/groupStore";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { resolveConversationId } from "../../lib/conversationIdentity";
import { formatCalendarDate } from "../../utils/formatTime";
import { chatApi } from "../../features/chat/api/chatApi";
import { useGroupAvatarUpload } from "./useGroupAvatarUpload";
import { useGroupInviteLinks } from "./useGroupInviteLinks";
import { useGroupRename } from "./useGroupRename";
import { asStringValue as asString } from "../../utils/payloadGuards";
import { getMessagePreview } from "../../utils/messageHelpers";
import {
  useGroupMembers,
  resolveMemberName,
  type GroupMember,
} from "./useGroupMembers";
import { usePinnedMessages } from "../../hooks/usePinnedMessages";
import { getConversationByIdUseCase } from "../../features/chat/usecases/getConversationById";
import {
  canAddGroupMembers,
  canLeaveGroup,
  canRemoveGroupMember,
  canRenameGroup,
  canToggleAdminRole,
} from "../../features/chat/permissions/groupPermissions";
import { resolveGroupJoinRequestUseCase } from "../../features/chat/usecases/resolveGroupJoinRequest";
import { transferOwnershipUseCase } from "../../features/chat/usecases/transferOwnership";
import { deleteGroupUseCase } from "../../features/chat/usecases/deleteGroup";
import { banMemberUseCase } from "../../features/chat/usecases/manageMemberRestrictions";
import { APP_BASE_PATH } from "../../config";

import {
  AddMemberModal,
  MembersList,
  RemoveMemberModal,
  BanMemberModal,
  TransferOwnershipModal,
  DeleteGroupModal,
} from "../../features/chat/components/group-members";
import { SharedResourcesPreview } from "./shared-resources/SharedResourcesPreview";
import {
  SharedContentPanel,
  type SharedContentTab,
} from "./shared-resources/SharedContentModal";
import { UserProfile } from "./UserProfile";
import { DraggableProfileModal } from "./DraggableProfileModal";
import {
  PollCreateDialog,
  type PollCreatePayload,
} from "../../features/chat/components/PollCreateDialog";
import {
  ReminderCreateDialog,
  type ReminderCreatePayload,
} from "../../features/chat/components/ReminderCreateDialog";
import {
  useSendMessageMutation,
} from "../../features/api/chatApi";
import { InfoQuickActionButton } from "./InfoQuickActionButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupInfoProps {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
  onStartConversation?: (userId: string) => void | Promise<void>;
  /** Jump the open timeline to a message (e.g. tapping a poll in the history list). */
  onJumpToMessage?: (messageId: string) => void;
  className?: string;
}

const EMPTY_INVITE_LINKS: InviteLinkItem[] = [];
const EMPTY_JOIN_REQUESTS: JoinRequestItem[] = [];

type ModalMemberTarget = { memberId: string; memberName: string } | null;

const MEMBER_PREVIEW_COUNT = 8;
const POLL_PREVIEW_COUNT = 3;

type GroupInfoPanel = "main" | "members" | "board" | "reminders" | "storage" | "manage";
type BoardTab = "all" | "pinned" | "notes" | "polls";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";


// ─── Sub-components ───────────────────────────────────────────────────────────



// ─── Main Component ───────────────────────────────────────────────────────────

export const GroupInfo: React.FC<GroupInfoProps> = ({
  conversation,
  currentUserId,
  onClose,
  onStartConversation,
  onJumpToMessage,
  className,
}) => {
  const { t } = useTranslation(["profile", "common"]);

  const participants = React.useMemo(
    () => (Array.isArray(conversation.participants) ? conversation.participants : []),
    [conversation.participants],
  );

  const navigate = useNavigate();
  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actingMemberId, setActingMemberId] = useState<string | null>(null);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [isLeaveGroupConfirmOpen, setIsLeaveGroupConfirmOpen] = useState(false);
  const [isConfirmActionPending, setIsConfirmActionPending] = useState(false);
  const [activePanel, setActivePanel] = useState<GroupInfoPanel>("main");
  const [storageDefaultTab, setStorageDefaultTab] = useState<SharedContentTab>("media");
  const [boardTab, setBoardTab] = useState<BoardTab>("all");
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [isMuteConfirmOpen, setIsMuteConfirmOpen] = useState(false);
  const [muteDuration, setMuteDuration] = useState("1h");
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);

  // New modal states
  const [removeMemberTarget, setRemoveMemberTarget] = useState<ModalMemberTarget>(null);
  const [banMemberTarget, setBanMemberTarget] = useState<ModalMemberTarget>(null);
  const [transferOwnershipTarget, setTransferOwnershipTarget] = useState<ModalMemberTarget>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(false);

  // Member filter / search state
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilterRole, setMemberFilterRole] = useState<"all" | "leadership">("all");
  const [membersShowAll, setMembersShowAll] = useState(false);

  // Member profile preview
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);

  // UI quick-action toggles (local state)
  const [isMuted, setIsMuted] = useState(false);
  const [sendPanelMessage] = useSendMessageMutation();

  // "tên gợi nhớ" (alias) map — wins over a poll's stored senderName.
  const nameByUserId = useEnrichedProfileStore((s) => s.nameByUserId);

  // Polls section
  const [polls, setPolls] = React.useState<Message[]>([]);
  const [pollsLoading, setPollsLoading] = React.useState(false);
  const [pollsShowAll, setPollsShowAll] = React.useState(false);
  const [voterProfilesMap, setVoterProfilesMap] = React.useState<Record<string, { name: string; avatar: string | null }>>({});
  // Reminders section — in-chat reminder cards live as REMINDER messages, same as polls.
  const [reminders, setReminders] = React.useState<Message[]>([]);
  const [remindersLoading, setRemindersLoading] = React.useState(false);
  const pollsSectionRef = React.useRef<HTMLDivElement>(null);
  const remindersSectionRef = React.useRef<HTMLDivElement>(null);
  const {
    pinnedMessages,
    isLoading: pinnedMessagesLoading,
  } = usePinnedMessages(conversation.id);

  // Merge-load voter profiles (same robust path as PollMessage card) so a single
  // expired avatar can be re-signed via onImageError without dropping the rest.
  const loadVoterProfiles = React.useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    void loadUserProfiles(ids).then((results) => {
      setVoterProfilesMap((prev) => {
        const next = { ...prev };
        for (const [id, s] of Object.entries(results)) {
          next[id] = {
            name: s?.displayName ?? s?.username ?? id,
            avatar:
              resolvePublicResourceUrl(
                (s as { avatar?: string })?.avatar || s?.avatarUrl || undefined,
              ) ?? null,
          };
        }
        return next;
      });
    });
  }, []);

  // Presigned avatar URLs expire (~15min) — in poll history they're often stale,
  // so a 403 left a blank box. Drop the cached summary and re-resolve that voter.
  const handleVoterAvatarError = React.useCallback(
    (uid: string) => {
      invalidateUserProfileSummary(uid);
      loadVoterProfiles([uid]);
    },
    [loadVoterProfiles],
  );

  const reloadBoardItems = React.useCallback(() => {
    if (!conversation.id) return;
    setPollsShowAll(false);
    setPollsLoading(true);
    void messageApi
      .searchMessages({ conversationId: conversation.id, type: MessageType.POLL, q: "", limit: 30 })
      .then((res) => {
        const messages = unwrapApiSuccess(res)?.messages ?? [];
        setPolls(messages);
        const allIds = [
          ...new Set(
            messages.flatMap((msg) => {
              const poll = (msg.metadata as { poll?: PollInfo } | null | undefined)?.poll;
              return poll?.options.flatMap((o) => o.voterIds ?? []) ?? [];
            }),
          ),
        ];
        loadVoterProfiles(allIds);
      })
      .catch(() => setPolls([]))
      .finally(() => setPollsLoading(false));

    setRemindersLoading(true);
    void messageApi
      .searchMessages({ conversationId: conversation.id, type: MessageType.REMINDER, q: "", limit: 30 })
      .then((res) => {
        setReminders(unwrapApiSuccess(res)?.messages ?? []);
      })
      .catch(() => setReminders([]))
      .finally(() => setRemindersLoading(false));
  }, [conversation.id, loadVoterProfiles]);

  React.useEffect(() => {
    reloadBoardItems();
  }, [reloadBoardItems]);

  const isPinned = Boolean(conversation.pinnedAt);

  const updateConversation = useChatStore((state) => state.updateConversation);
  const removeConversation = useChatStore((state) => state.removeConversation);

  const handleTogglePin = useCallback(async () => {
    const previousPinnedAt = conversation.pinnedAt ?? null;
    const previousPinOrder = conversation.pinOrder ?? null;
    const nextPinned = !isPinned;

    updateConversation(conversation.id, {
      pinnedAt: nextPinned ? new Date().toISOString() : null,
      pinOrder: nextPinned ? 0 : null,
      isPinned: nextPinned,
    });

    try {
      const result = await conversationApi.setConversationPinned(
        conversation.id,
        nextPinned,
      );
      updateConversation(conversation.id, {
        pinnedAt: result.pinnedAt,
        pinOrder: result.pinOrder,
        isPinned: Boolean(result.pinnedAt),
      });
    } catch (error) {
      updateConversation(conversation.id, {
        pinnedAt: previousPinnedAt,
        pinOrder: previousPinOrder,
        isPinned,
      });
      toast.error(extractApiError(error).message);
    }
  }, [
    conversation.id,
    conversation.pinOrder,
    conversation.pinnedAt,
    isPinned,
    updateConversation,
  ]);

  const inviteLinks = useGroupStore(
    (state) => state.inviteLinksByConversation[conversation.id] ?? EMPTY_INVITE_LINKS,
  );
  const joinRequests = useGroupStore(
    (state) => state.joinRequestsByConversation[conversation.id] ?? EMPTY_JOIN_REQUESTS,
  );
  const memberListVersion = useGroupStore(
    (state) => state.memberListVersionByConversation[conversation.id] || 0,
  );
  const setInviteLinks = useGroupStore((state) => state.setInviteLinks);
  const setJoinRequests = useGroupStore((state) => state.setJoinRequests);
  const markJoinRequestResolved = useGroupStore((state) => state.markJoinRequestResolved);
  const removeJoinRequest = useGroupStore((state) => state.removeJoinRequest);

  const createdBy = React.useMemo(() => conversation.createdBy, [conversation]);

  const {
    members,
    byUserId: membersByUserId,
    isLoading: isLoadingMembers,
    refetch: fetchMembers,
  } = useGroupMembers(
    conversation.id,
    participants,
    createdBy,
    memberListVersion,
  );

  const filteredMembers = React.useMemo(() => {
    let result = members;
    if (memberFilterRole === "leadership") result = result.filter((m) => m.role === RoomMemberRole.OWNER || m.role === RoomMemberRole.ADMIN);
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      result = result.filter((m) =>
        (m.fullNameFromHR || m.displayName || m.username || "").toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q),
      );
    }
    return result;
  }, [members, memberFilterRole, memberSearch]);

  // Role counts for filter badges
  const roleCounts = React.useMemo(() => ({
    all: members.length,
    leadership: members.filter((m) => m.role === RoomMemberRole.OWNER || m.role === RoomMemberRole.ADMIN).length,
  }), [members]);

  const activeOwnerCount = React.useMemo(
    () => members.filter((m) => m.role === RoomMemberRole.OWNER).length || (createdBy ? 1 : 0),
    [createdBy, members],
  );

  const excludeMemberIds = React.useMemo(
    () => [currentUserId, ...members.map((m) => m.id), ...participants.map((p) => p.id)],
    [currentUserId, members, participants],
  );

  const currentUserRole =
    membersByUserId[currentUserId]?.role ||
    (currentUserId === createdBy ? RoomMemberRole.OWNER : RoomMemberRole.MEMBER);
  const groupCapabilities = conversation.permissions ?? null;
  const isAdmin = canRenameGroup(currentUserRole, groupCapabilities);
  const inviteLinksControl = useGroupInviteLinks(conversation.id, isAdmin);
  const canAddMembers = canAddGroupMembers(currentUserRole, groupCapabilities);
  const canLeaveCurrentGroup = canLeaveGroup(currentUserRole, activeOwnerCount, groupCapabilities);
  const participantCount =
    conversation.participantCount ??
    (members.length > 0 ? members.length : participants.length);

  const canRemoveMember = useCallback(
    (member: GroupMember) => canRemoveGroupMember({
      actorRole: currentUserRole,
      actorUserId: currentUserId,
      targetRole: member.role,
      targetUserId: member.id,
      capabilities: groupCapabilities,
    }),
    [currentUserId, currentUserRole, groupCapabilities],
  );

  const refreshConversation = useCallback(async () => {
    const response = await getConversationByIdUseCase(conversation.id);
    updateConversation(conversation.id, unwrapApiSuccess(response));
  }, [conversation.id, updateConversation]);

  const refreshGroupState = useCallback(async () => {
    await Promise.all([refreshConversation(), fetchMembers()]);
  }, [fetchMembers, refreshConversation]);

  const groupAvatar = useGroupAvatarUpload(conversation.id, refreshGroupState);
  const resetGroupAvatar = groupAvatar.reset;
  const groupRename = useGroupRename(
    conversation.id,
    conversation.name || "",
    refreshGroupState,
    setIsSubmitting,
  );

  // Đổi nhóm → trả panel về trạng thái sạch. Phần đổi tên và ảnh đại diện tự
  // reset bên trong hook của chúng.
  React.useEffect(() => {
    setShowAddMember(false);
    resetGroupAvatar();
    setMemberSearch("");
    setMemberFilterRole("all");
    setMembersShowAll(false);
    setActivePanel("main");
    setBoardTab("all");
  }, [conversation.id, conversation.name, resetGroupAvatar]);

  const openStoragePanel = useCallback((tab: SharedContentTab) => {
    setStorageDefaultTab(tab);
    setActivePanel("storage");
  }, []);

  const makeClientMessageId = useCallback((prefix: string) => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  const handleCreatePanelPoll = useCallback(
    (payload: PollCreatePayload, options: { pinToTop: boolean }) => {
      const clientMessageId = makeClientMessageId("poll");
      sendPanelMessage({
        conversationId: conversation.id,
        clientMessageId,
        localId: `temp-${clientMessageId}`,
        content: payload.question,
        type: MessageType.POLL,
        poll: payload,
        senderId: currentUserId,
      })
        .unwrap()
        .then((created) => {
          toast.success("Đã tạo bình chọn");
          reloadBoardItems();
          if (options.pinToTop && created?.id) {
            messageApi.pinMessage(created.id).catch(() => {
              toast.error("Không thể ghim bình chọn");
            });
          }
        })
        .catch(() => {
          toast.error("Không thể tạo bình chọn");
        });
    },
    [conversation.id, currentUserId, makeClientMessageId, reloadBoardItems, sendPanelMessage],
  );

  const handleCreatePanelReminder = useCallback(
    (payload: ReminderCreatePayload) => {
      const clientMessageId = makeClientMessageId("reminder");
      sendPanelMessage({
        conversationId: conversation.id,
        clientMessageId,
        localId: `temp-${clientMessageId}`,
        content: payload.content,
        type: MessageType.REMINDER,
        reminder: {
          content: payload.content,
          remindAt: payload.reminderDate.toISOString(),
          repeat: payload.repeatType,
        },
        senderId: currentUserId,
      })
        .unwrap()
        .then(() => {
          toast.success("Đã tạo nhắc hẹn");
          reloadBoardItems();
        })
        .catch(() => {
          toast.error("Không thể tạo nhắc hẹn");
        });
    },
    [conversation.id, currentUserId, makeClientMessageId, reloadBoardItems, sendPanelMessage],
  );

  const handleCreatePanelNote = useCallback(
    (payload: { content: string; pinToTop: boolean }) => {
      const clientMessageId = makeClientMessageId("note");
      sendPanelMessage({
        conversationId: conversation.id,
        clientMessageId,
        localId: `temp-${clientMessageId}`,
        content: payload.content,
        type: MessageType.TEXT,
        senderId: currentUserId,
      })
        .unwrap()
        .then((created) => {
          toast.success("Đã tạo ghi chú");
          if (payload.pinToTop && created?.id) {
            messageApi.pinMessage(created.id).catch(() => {
              toast.error("Không thể ghim ghi chú");
            });
          }
        })
        .catch(() => {
          toast.error("Không thể tạo ghi chú");
        });
    },
    [conversation.id, currentUserId, makeClientMessageId, sendPanelMessage],
  );


  React.useEffect(() => {
    let cancelled = false;
    if (!isAdmin) { setInviteLinks(conversation.id, []); setJoinRequests(conversation.id, []); return () => { cancelled = true; }; }
    const hydrateRealtimeState = async () => {
      try {
        const [inviteLinksResponse, joinRequestsResponse] = await Promise.all([
          chatApi.group.getInviteLinks(conversation.id),
          chatApi.group.getJoinRequests(conversation.id),
        ]);
        if (cancelled) return;
        const inviteLinksPayload = unwrapApiSuccess(inviteLinksResponse);
        const joinRequestsPayload = unwrapApiSuccess(joinRequestsResponse);
        const normalizedInviteLinks: InviteLinkItem[] = Array.isArray(inviteLinksPayload)
          ? inviteLinksPayload.reduce<InviteLinkItem[]>((items, item) => {
              if (!isRecord(item) || typeof item.id !== "string") return items;
              if (asString(item.revokedAt)) return items;
              const linkToken = asString(item.token);
              const linkInviteUrl = asString(item.inviteUrl)
                ?? (linkToken ? `${window.location.origin}${APP_BASE_PATH}/join/${linkToken}` : undefined);
              items.push({
                id: item.id,
                conversationId: resolveConversationId(item, { source: "GroupInfo.inviteLinks" }) ?? conversation.id,
                name: asString(item.name),
                inviteUrl: linkInviteUrl,
                token: linkToken,
                tokenPreview: asString(item.tokenPreview),
                usageCount: typeof item.usageCount === "number" ? item.usageCount : 0,
                usageLimit: typeof item.usageLimit === "number" ? item.usageLimit : null,
                expireAt: asString(item.expireAt) ?? null,
                revokedAt: null,
                createdAt: asString(item.createdAt) ?? new Date().toISOString(),
              });
              return items;
            }, [])
          : [];
        const normalizedJoinRequests: JoinRequestItem[] = Array.isArray(joinRequestsPayload)
          ? joinRequestsPayload.reduce<JoinRequestItem[]>((items, item) => {
              if (!isRecord(item) || typeof item.id !== "string") return items;
              const status = asString(item.status);
              if (status !== "pending" && status !== "approved" && status !== "rejected") return items;
              items.push({
                id: item.id,
                conversationId: resolveConversationId(item, { source: "GroupInfo.joinRequests" }) ?? conversation.id,
                userId: asString(item.userId) ?? "",
                status,
                note: asString(item.note),
                createdAt: asString(item.requestedAt) ?? asString(item.createdAt) ?? new Date().toISOString(),
                resolvedAt: asString(item.resolvedAt),
              });
              return items;
            }, [])
          : [];
        setInviteLinks(conversation.id, normalizedInviteLinks);
        setJoinRequests(conversation.id, normalizedJoinRequests);
      } catch { /* keep local state */ }
    };
    void hydrateRealtimeState();
    return () => { cancelled = true; };
  }, [conversation.id, isAdmin, setInviteLinks, setJoinRequests]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleAddMember = useCallback(
    async (userId: string) => {
      setIsSubmitting(true);
      try {
        await chatApi.group.addMember(conversation.id, userId);
        await refreshGroupState();
        toast.success(t("profile:toast.memberAdded"));
      } catch (error) {
        toast.error(extractApiError(error).message || t("profile:toast.memberAddFailed"));
      } finally {
        setIsSubmitting(false);
      }
    },
    [conversation.id, refreshGroupState, t],
  );

  const handleToggleMemberRole = useCallback(
    async (member: GroupMember) => {
      if (!canToggleAdminRole({ actorRole: currentUserRole, actorUserId: currentUserId, targetRole: member.role, targetUserId: member.id, capabilities: groupCapabilities })) return;
      const nextRole = member.role === RoomMemberRole.ADMIN ? RoomMemberRole.MEMBER : RoomMemberRole.ADMIN;
      setActingMemberId(member.id);
      try {
        await chatApi.group.updateMemberRole(conversation.id, member.id, nextRole);
        await refreshGroupState();
        toast.success(nextRole === RoomMemberRole.ADMIN ? t("profile:toast.memberPromoted") : t("profile:toast.memberDemoted"));
      } catch (error) {
        toast.error(extractApiError(error).message || t("profile:toast.roleUpdateFailed"));
      } finally {
        setActingMemberId(null);
      }
    },
    [conversation.id, currentUserId, currentUserRole, groupCapabilities, refreshGroupState, t],
  );

  const handleRemoveMember = useCallback(
    (member: GroupMember) => {
      if (!canRemoveMember(member)) return;
      setRemoveMemberTarget({ memberId: member.id, memberName: resolveMemberName(member) || member.id });
    },
    [canRemoveMember],
  );

  const confirmRemoveMember = useCallback(
    async (member: GroupMember) => {
      setActingMemberId(member.id);
      setIsConfirmActionPending(true);
      try {
        await chatApi.group.removeMember(conversation.id, member.id);
        await refreshGroupState();
        setRemoveMemberTarget(null);
        toast.success(t("profile:toast.memberRemoved"));
      } catch (error) {
        toast.error(extractApiError(error).message || t("profile:toast.memberRemoveFailed"));
      } finally {
        setActingMemberId(null);
        setIsConfirmActionPending(false);
      }
    },
    [conversation.id, refreshGroupState, t],
  );

  const handleLeaveGroup = useCallback(() => {
    if (!canLeaveCurrentGroup) {
      toast.error(t("profile:groupInfo.leaveBlockedOwner", { defaultValue: "Hãy chuyển quyền trưởng nhóm trước khi rời nhóm." }));
      return;
    }
    setIsLeaveGroupConfirmOpen(true);
  }, [canLeaveCurrentGroup, t]);

  const confirmLeaveGroup = useCallback(async () => {
    setIsSubmitting(true);
    setIsConfirmActionPending(true);
    try {
      await chatApi.group.leaveGroup(conversation.id);
      removeConversation(conversation.id);
      setIsLeaveGroupConfirmOpen(false);
      toast.success(t("profile:toast.leftGroup"));
      onClose();
      navigate("/chat");
    } catch (error) {
      toast.error(extractApiError(error).message || t("profile:toast.leaveGroupFailed"));
    } finally {
      setIsSubmitting(false);
      setIsConfirmActionPending(false);
    }
  }, [conversation.id, navigate, onClose, removeConversation, t]);

  const handleTransferOwnership = useCallback(
    (member: GroupMember) => {
      if (currentUserRole !== RoomMemberRole.OWNER || member.role === RoomMemberRole.OWNER) return;
      setTransferOwnershipTarget({ memberId: member.id, memberName: resolveMemberName(member) || member.id });
    },
    [currentUserRole],
  );

  const confirmTransferOwnership = useCallback(
    async (member: GroupMember) => {
      setActingMemberId(member.id);
      setIsConfirmActionPending(true);
      try {
        await transferOwnershipUseCase(conversation.id, member.id);
        await refreshGroupState();
        setTransferOwnershipTarget(null);
        toast.success(t("profile:toast.ownershipTransferred", { name: resolveMemberName({ id: member.id, username: member.username, displayName: member.displayName }) }));
      } catch (error) {
        toast.error(extractApiError(error).message || t("profile:toast.ownershipTransferFailed"));
      } finally {
        setActingMemberId(null);
        setIsConfirmActionPending(false);
      }
    },
    [conversation.id, refreshGroupState, t],
  );

  const handleDeleteGroup = useCallback(() => {
    if (currentUserRole !== RoomMemberRole.OWNER) return;
    setDeleteGroupTarget(true);
  }, [currentUserRole]);

  const confirmDeleteGroup = useCallback(async () => {
    setIsSubmitting(true);
    setIsConfirmActionPending(true);
    try {
      await deleteGroupUseCase(conversation.id);
      removeConversation(conversation.id);
      setDeleteGroupTarget(false);
      toast.success(t("profile:toast.groupDeleted"));
      onClose();
      navigate("/chat");
    } catch (error) {
      toast.error(extractApiError(error).message || t("profile:toast.groupDeleteFailed"));
    } finally {
      setIsSubmitting(false);
      setIsConfirmActionPending(false);
    }
  }, [conversation.id, navigate, onClose, removeConversation, t]);

  const handleBanMember = useCallback(
    (member: GroupMember) => {
      if (currentUserRole !== RoomMemberRole.OWNER && currentUserRole !== RoomMemberRole.ADMIN) return;
      if (member.role === RoomMemberRole.OWNER) return;
      setBanMemberTarget({ memberId: member.id, memberName: resolveMemberName(member) || member.id });
    },
    [currentUserRole],
  );

  const confirmBanMember = useCallback(
    async (member: GroupMember) => {
      setActingMemberId(member.id);
      setIsConfirmActionPending(true);
      try {
        await banMemberUseCase(conversation.id, member.id);
        await refreshGroupState();
        setBanMemberTarget(null);
        toast.success(t("profile:toast.memberBanned", { name: resolveMemberName({ id: member.id, username: member.username, displayName: member.displayName }) }));
      } catch (error) {
        toast.error(extractApiError(error).message || t("profile:toast.banMemberFailed"));
      } finally {
        setActingMemberId(null);
        setIsConfirmActionPending(false);
      }
    },
    [conversation.id, refreshGroupState, t],
  );

  const handleResolveJoinRequest = useCallback(
    async (requestId: string, status: "approved" | "rejected") => {
      if (!isAdmin || !requestId) return;
      setResolvingRequestId(requestId);
      try {
        await resolveGroupJoinRequestUseCase(conversation.id, requestId, status);
        markJoinRequestResolved(conversation.id, requestId, status);
        removeJoinRequest(conversation.id, requestId);
        if (status === "approved") void fetchMembers();
        toast.success(status === "approved" ? t("profile:groupInfo.joinRequests.approved") : t("profile:groupInfo.joinRequests.rejected"));
      } catch (error) {
        toast.error(extractApiError(error).message || t("profile:groupInfo.joinRequests.resolveFailed"));
      } finally {
        setResolvingRequestId(null);
      }
    },
    [conversation.id, fetchMembers, isAdmin, markJoinRequestResolved, removeJoinRequest, t],
  );

  // ─── Derived values ───────────────────────────────────────────────────────────

  const pendingJoinRequestsCount = joinRequests.filter((r) => r.status === "pending").length;

  // ─── Render ───────────────────────────────────────────────────────────────────

  const memberFilterTabs: { key: "all" | "leadership"; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "leadership", label: "Trưởng nhóm" },
  ];

  return (
    <div className={clsx("flex h-full flex-col bg-surface", className)}>
      {activePanel === "storage" ? (
        <SharedContentPanel
          conversationId={conversation.id}
          defaultTab={storageDefaultTab}
          onBack={() => setActivePanel("main")}
        />
      ) : activePanel === "members" ? (
        <GroupMembersPanel
          title="Thành viên"
          members={filteredMembers}
          allMembers={members}
          isLoading={isLoadingMembers}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          capabilities={groupCapabilities}
          actingMemberId={actingMemberId}
          canAddMembers={canAddMembers}
          isSubmitting={isSubmitting}
          onBack={() => setActivePanel("main")}
          onAddMember={() => setShowAddMember(true)}
          onMemberClick={(memberId) => setViewingMemberId(memberId)}
          onMakeAdmin={(memberId) => {
            const member = members.find((m) => m.id === memberId);
            if (member) void handleToggleMemberRole(member);
          }}
          onRemoveAdmin={(memberId) => {
            const member = members.find((m) => m.id === memberId);
            if (member) void handleToggleMemberRole(member);
          }}
          onTransferOwnership={(memberId) => {
            const member = members.find((m) => m.id === memberId);
            if (member) handleTransferOwnership(member);
          }}
          onBanMember={(memberId) => {
            const member = members.find((m) => m.id === memberId);
            if (member) handleBanMember(member);
          }}
          onRemoveMember={(memberId) => {
            const member = members.find((m) => m.id === memberId);
            if (member) handleRemoveMember(member);
          }}
        />
      ) : activePanel === "reminders" ? (
        <ReminderPanel
          reminders={reminders}
          loading={remindersLoading}
          onBack={() => setActivePanel("main")}
          onCreate={() => setIsReminderDialogOpen(true)}
          onJumpToMessage={onJumpToMessage}
          onOpenCalendar={() => navigate("/calendar")}
        />
      ) : activePanel === "board" ? (
        <GroupBoardPanel
          boardTab={boardTab}
          onBoardTabChange={setBoardTab}
          menuOpen={boardMenuOpen}
          onMenuOpenChange={setBoardMenuOpen}
          pinnedMessages={pinnedMessages}
          pinnedMessagesLoading={pinnedMessagesLoading}
          currentUserId={currentUserId}
          polls={polls}
          pollsLoading={pollsLoading}
          pollsShowAll={pollsShowAll}
          onPollsShowAllChange={setPollsShowAll}
          reminders={reminders}
          remindersLoading={remindersLoading}
          voterProfilesMap={voterProfilesMap}
          nameByUserId={nameByUserId}
          onBack={() => setActivePanel("main")}
          onCreatePoll={() => {
            setBoardMenuOpen(false);
            setIsPollDialogOpen(true);
          }}
          onCreateReminder={() => {
            setBoardMenuOpen(false);
            setActivePanel("reminders");
            setIsReminderDialogOpen(true);
          }}
          onCreateNote={() => {
            setBoardMenuOpen(false);
            setIsNoteDialogOpen(true);
          }}
          onJumpToMessage={onJumpToMessage}
          onOpenCalendar={() => navigate("/calendar")}
          onVoterAvatarError={handleVoterAvatarError}
        />
      ) : activePanel === "manage" ? (
        <GroupManagePanel
          inviteLinks={inviteLinks}
          pendingJoinRequestsCount={pendingJoinRequestsCount}
          onBack={() => setActivePanel("main")}
          onCopyInvite={(value) => void inviteLinksControl.copyLink(value)}
          onCreateInvite={inviteLinksControl.openForm}
          onBlockList={() => {
            setSecurityExpanded(true);
            setActivePanel("main");
          }}
        />
      ) : (
        <>

      {/* ── Sticky Header ── (matches UserProfile so the divider lines up with the chat header) */}
      <div className="app-page-header sticky top-0 z-10 flex shrink-0 items-center justify-between px-4 py-2.5">
        <h3 className="text-title-sm text-text-primary">
          {t("profile:groupInfo.title")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="icon-button-surface h-9 w-9"
          aria-label={t("common:actions.close")}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Hero Section ── */}
        <div className="flex flex-col items-center bg-surface px-5 pb-5 pt-6 text-center">
          {/* Avatar */}
          <div className="relative mb-4">
            <div className="overflow-hidden rounded-full">
              {groupAvatar.previewUrl || conversation.avatar ? (
                <Avatar
                  src={groupAvatar.previewUrl || conversation.avatar}
                  alt={conversation.name}
                  size="xl"
                />
              ) : (
                <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#1565C0] text-2xl font-bold text-white">
                  {(conversation.name || "G").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            {isAdmin && !groupRename.isEditing && (
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isSubmitting || groupAvatar.isUploading}
                className="absolute bottom-0.5 right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-overlay shadow-xs transition-colors hover:bg-surface-hover disabled:opacity-50"
                aria-label={t("profile:groupInfo.changeAvatar", { defaultValue: "Đổi ảnh nhóm" })}
              >
                <CameraIcon className="h-3 w-3 text-text-secondary" />
              </button>
            )}
          </div>

          {/* Group Name */}
          {groupRename.isEditing ? (
            <div className="w-full max-w-[240px] space-y-2">
              <Input
                type="text"
                value={groupRename.draft}
                onChange={(e) => groupRename.setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void groupRename.submit(); }
                  if (e.key === "Escape") groupRename.cancel();
                }}
                placeholder={t("profile:groupInfo.renamePlaceholder")}
                disabled={isSubmitting}
              />
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={groupRename.cancel}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover"
                >
                  {t("common:actions.cancel")}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void groupRename.submit()}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#1565C0] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  {t("common:actions.save")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h2 className="line-clamp-2 max-w-[200px] text-base font-bold text-text-primary">
                {conversation.name || t("common:labels.group")}
              </h2>
              {isAdmin && (
                <button
                  type="button"
                  onClick={groupRename.start}
                  disabled={isSubmitting}
                  className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={t("profile:groupInfo.renameGroup")}
                >
                  <SquarePen className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
          )}

          {/* Subtitle */}
          <p className="mt-1 text-xs text-text-muted">
            {participantCount} thành viên · Nhóm nội bộ
          </p>

          {/* Avatar upload status */}
          {groupAvatar.stageLabel && (
            <p className="mt-1 text-[11px] text-text-muted">
              {groupAvatar.stageLabel}
            </p>
          )}
        </div>

        {/* ── Quick Actions Row ── */}
        <div className="bg-surface px-5 pb-5">
          <div className="grid grid-cols-4 gap-2">
            {/* Mute / Unmute */}
            <InfoQuickActionButton
              onClick={() => {
                if (isMuted) {
                  setIsMuted(false);
                  return;
                }
                setIsMuteConfirmOpen(true);
              }}
              ariaLabel={isMuted ? "Bật thông báo nhóm" : "Tắt thông báo nhóm"}
              icon={isMuted ? <BellSlashIcon className="h-5 w-5" /> : <BellIcon className="h-5 w-5" />}
              label={isMuted ? "Bật thông báo" : "Tắt thông báo"}
              active={isMuted}
            />

            {/* Pin / Unpin */}
            <InfoQuickActionButton
              onClick={() => { void handleTogglePin(); }}
              ariaLabel={isPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}
              icon={<Pin size={20} color="currentColor" strokeWidth={1.5} />}
              label={isPinned ? "Bỏ ghim" : "Ghim nhóm"}
              active={isPinned}
            />

            {/* Add Member */}
            {canAddMembers && (
              <InfoQuickActionButton
                disabled={isSubmitting}
                onClick={() => setShowAddMember((p) => !p)}
                ariaLabel="Thêm thành viên vào nhóm"
                icon={<UserPlusIcon className="h-5 w-5" />}
                label={t("profile:groupInfo.addMember")}
              />
            )}

            <InfoQuickActionButton
              onClick={() => setActivePanel("manage")}
              ariaLabel="Quản lý nhóm"
              icon={<Cog6ToothIcon className="h-5 w-5" />}
              label="Quản lý nhóm"
            />

            {/* Join Requests (admin only, if pending) */}
            {isAdmin && pendingJoinRequestsCount > 0 && (
              <InfoQuickActionButton
                onClick={() => setSecurityExpanded(true)}
                ariaLabel={`${pendingJoinRequestsCount} yêu cầu vào nhóm đang chờ`}
                icon={<UsersIcon className="h-5 w-5" />}
                label="Yêu cầu vào"
                warning
                badge={
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-0.5 text-[10px] font-bold text-white">
                    {pendingJoinRequestsCount}
                  </span>
                }
              />
            )}
          </div>
        </div>

        <div className="border-t-8 border-[#eef0f4] bg-surface">
          <InfoNavRow
            title={t("profile:groupInfo.sections.members")}
            icon={<UsersIcon className="h-6 w-6" />}
            meta={`${participantCount} thành viên`}
            onClick={() => setActivePanel("members")}
          />
        </div>

        <div className="border-t-8 border-[#eef0f4] bg-surface">
          <InfoNavRow
            title="Bảng tin nhóm"
            icon={<ClipboardDocumentListIcon className="h-6 w-6" />}
            onClick={() => setActivePanel("board")}
          />
          <InfoNavRow
            title="Danh sách nhắc hẹn"
            icon={<ClockIcon className="h-6 w-6" />}
            onClick={() => setActivePanel("reminders")}
          />
        </div>

        <SharedResourcesPreview
          conversationId={conversation.id}
          variant="zalo"
          onOpenAll={openStoragePanel}
          onJumpToMessage={onJumpToMessage}
        />

        <div className="border-t-8 border-[#eef0f4] bg-surface">
          <InfoNavRow
            title="Thiết lập bảo mật"
            icon={<ShieldCheckIcon className="h-6 w-6" />}
            expanded={securityExpanded}
            onClick={() => setSecurityExpanded((p) => !p)}
          />
          {securityExpanded && (
            <div className="border-t border-border/60 px-5 py-3">
              <div className="flex items-center gap-3 py-2">
                <NoSymbolIcon className="h-6 w-6 text-text-primary" />
                <span className="flex-1 text-[15px] text-text-primary">Ẩn trò chuyện</span>
                <button
                  type="button"
                  className="relative h-6 w-11 rounded-full bg-[#b8b8b8]"
                  aria-label="Ẩn trò chuyện"
                >
                  <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t-8 border-[#eef0f4] bg-surface py-3">
          <DangerActionRow
            icon={<TrashIcon className="h-6 w-6" />}
            label="Xóa lịch sử trò chuyện"
            danger
          />
          {canLeaveCurrentGroup && (
            <DangerActionRow
              icon={<ArrowRightOnRectangleIcon className="h-6 w-6" />}
              label={t("profile:groupInfo.leaveGroup")}
              danger
              onClick={() => void handleLeaveGroup()}
            />
          )}
        </div>

        {/* ── Sections ── */}
        <div className="hidden">

          {/* Members Section */}
          <CollapsibleSection
            title={t("profile:groupInfo.sections.members")}
            icon={<UsersIcon className="h-4 w-4" />}
            badge={
              <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] font-medium text-text-muted tabular-nums">
                {participantCount}
              </span>
            }
          >

            {/* Member search */}
            <div className="px-3 pt-2.5 pb-2">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Tìm thành viên…"
                  className="h-9 w-full rounded-xl bg-surface-overlay pl-8 pr-3 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-[#1976D2]/25"
                />
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
              {memberFilterTabs.map((tab) => {
                const count = tab.key === "all" ? roleCounts.all : roleCounts.leadership;
                if (count === 0 && tab.key !== "all") return null;
                const isActive = memberFilterRole === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setMemberFilterRole(tab.key)}
                    className={clsx(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                      isActive
                        ? "bg-[#1976D2] text-white"
                        : "bg-surface-overlay text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                    )}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={clsx(
                        "min-w-[16px] rounded-full text-center text-[10px] font-semibold tabular-nums",
                        isActive ? "text-white/80" : "text-text-muted",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Member list */}
            {isLoadingMembers ? (
              <div className="py-1">
                <DirectorySkeleton count={4} />
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-center">
                <UsersIcon className="h-8 w-8 text-text-muted/40" />
                <p className="text-sm text-text-muted">
                  {memberSearch.trim()
                    ? "Không tìm thấy thành viên phù hợp"
                    : t("profile:groupInfo.noMembers")}
                </p>
              </div>
            ) : (
              <>
                <MembersList
                  members={membersShowAll ? filteredMembers : filteredMembers.slice(0, MEMBER_PREVIEW_COUNT)}
                  isLoading={false}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  capabilities={groupCapabilities}
                  actingMemberId={actingMemberId}
                  onMemberClick={(memberId) => setViewingMemberId(memberId)}
                  onMakeAdmin={(memberId) => {
                    const member = members.find((m) => m.id === memberId);
                    if (member) void handleToggleMemberRole(member);
                  }}
                  onRemoveAdmin={(memberId) => {
                    const member = members.find((m) => m.id === memberId);
                    if (member) void handleToggleMemberRole(member);
                  }}
                  onTransferOwnership={(memberId) => {
                    const member = members.find((m) => m.id === memberId);
                    if (member) handleTransferOwnership(member);
                  }}
                  onBanMember={(memberId) => {
                    const member = members.find((m) => m.id === memberId);
                    if (member) handleBanMember(member);
                  }}
                  onRemoveMember={(memberId) => {
                    const member = members.find((m) => m.id === memberId);
                    if (member) handleRemoveMember(member);
                  }}
                />
                {filteredMembers.length > MEMBER_PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={() => setMembersShowAll((p) => !p)}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-border/60 py-2.5 text-xs font-medium text-[#1565C0] transition-colors hover:bg-surface-hover"
                  >
                    {membersShowAll ? (
                      <>Thu gọn <ChevronDownIcon className="h-3.5 w-3.5" /></>
                    ) : (
                      <>Xem tất cả {filteredMembers.length} thành viên <ChevronRightIcon className="h-3.5 w-3.5" /></>
                    )}
                  </button>
                )}
              </>
            )}
          </CollapsibleSection>

          {/* Shared Resources */}
          <SharedResourcesPreview
            conversationId={conversation.id}
            onJumpToMessage={onJumpToMessage}
          />

          {/* ── Polls Section ── */}
          <div ref={pollsSectionRef}>
            <CollapsibleSection
              title="Bình chọn"
              icon={<ChartBarIcon className="h-4 w-4" />}
              defaultOpen={false}
              badge={
                polls.length > 0 ? (
                  <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] font-medium text-text-muted tabular-nums">
                    {polls.length}
                  </span>
                ) : undefined
              }
            >
              {pollsLoading ? (
                <div className="space-y-2 p-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse rounded-xl bg-surface-overlay p-3">
                      <div className="mb-2 h-3 w-3/4 rounded bg-surface-active" />
                      <div className="h-2 w-1/3 rounded bg-surface-active/70" />
                    </div>
                  ))}
                </div>
              ) : polls.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <ChartBarIcon className="h-8 w-8 text-text-muted/40" />
                  <p className="text-[12px] text-text-muted">Chưa có bình chọn nào</p>
                </div>
              ) : (
                <div className="space-y-2 p-3">
                  {(pollsShowAll ? polls : polls.slice(0, POLL_PREVIEW_COUNT)).map((msg) => {
                    const poll = (msg.metadata as { poll?: PollInfo } | null | undefined)?.poll;
                    if (!poll) return null;
                    const activePoll = !poll.isClosed;
                    const winner = poll.options.reduce(
                      (a, b) => (b.votes > a.votes ? b : a),
                      poll.options[0],
                    );
                    return (
                      <div
                        key={msg.id}
                        role={onJumpToMessage ? "button" : undefined}
                        tabIndex={onJumpToMessage ? 0 : undefined}
                        onClick={
                          onJumpToMessage
                            ? () => onJumpToMessage(msg.id)
                            : undefined
                        }
                        onKeyDown={
                          onJumpToMessage
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onJumpToMessage(msg.id);
                                }
                              }
                            : undefined
                        }
                        className={clsx(
                          "overflow-hidden rounded-xl border border-border bg-surface-overlay transition-colors hover:border-[#1565C0]/30",
                          onJumpToMessage &&
                            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/30",
                        )}
                      >
                        {/* Question row */}
                        <div className="flex items-start gap-2 px-3 pt-3 pb-2">
                          <div className="flex-1 min-w-0">
                            <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-text-primary">
                              {poll.question}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              {activePoll ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#1565C0]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#1565C0]">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#1565C0] animate-pulse" />
                                  Đang mở
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-active px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                                  <LockClosedIcon className="h-2.5 w-2.5" />
                                  Đã kết thúc
                                </span>
                              )}
                              <span className="text-[11px] text-text-muted tabular-nums">
                                {poll.totalVotes} lượt
                              </span>
                              {poll.allowMultiple && (
                                <span className="text-[10px] text-text-muted">· Chọn nhiều</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Options preview — top 3 */}
                        <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                          {poll.options.slice(0, 3).map((opt) => {
                            const pct = poll.totalVotes > 0
                              ? Math.round((opt.votes / poll.totalVotes) * 100)
                              : 0;
                            const isWinner = !activePoll && opt.id === winner?.id && poll.totalVotes > 0;
                            return (
                              <div key={opt.id} className="relative overflow-hidden rounded-lg">
                                {/* Bar background */}
                                <div
                                  className={clsx(
                                    "absolute inset-y-0 left-0 rounded-lg transition-all duration-500",
                                    isWinner ? "bg-[#1565C0]/15" : "bg-[#1565C0]/[0.08]",
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                                <div className="relative flex items-center gap-1.5 px-2 py-1.5">
                                  {isWinner && (
                                    <TrophyIcon className="h-3 w-3 shrink-0 text-[#F59E0B]" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <span className={clsx(
                                      "block truncate text-[11.5px]",
                                      isWinner ? "font-semibold text-text-primary" : "text-text-secondary",
                                    )}>
                                      {opt.text}
                                    </span>
                                    {/* Voter avatar stack */}
                                    {!poll.anonymous && (opt.voterIds ?? []).length > 0 && (
                                      <div className="mt-1 flex items-center gap-1">
                                        <div className="flex items-center">
                                          {(opt.voterIds ?? []).slice(0, 3).map((uid, i) => {
                                            const vp = voterProfilesMap[uid];
                                            return (
                                              <div
                                                key={uid}
                                                title={vp?.name ?? uid}
                                                className="rounded-full"
                                                style={{ marginLeft: i === 0 ? 0 : -5, position: "relative", zIndex: 3 - i }}
                                              >
                                                <Avatar
                                                  src={vp?.avatar ?? null}
                                                  alt={vp?.name ?? uid}
                                                  size="xs"
                                                  onImageError={() =>
                                                    handleVoterAvatarError(uid)
                                                  }
                                                />
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {(opt.voterIds ?? []).length > 3 && (
                                          <span className="text-[10px] text-text-muted">
                                            +{(opt.voterIds ?? []).length - 3}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <span className={clsx(
                                    "shrink-0 text-[11px] tabular-nums",
                                    isWinner ? "font-semibold text-[#1565C0]" : "text-text-muted",
                                  )}>
                                    {pct}%
                                    {opt.votes > 0 && (
                                      <span className="ml-1 text-[10px] font-normal text-text-muted">· {opt.votes}</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {poll.options.length > 3 && (
                            <p className="text-[10.5px] text-text-muted px-1">
                              +{poll.options.length - 3} lựa chọn khác
                            </p>
                          )}
                        </div>

                        {/* Footer — sender + time */}
                        {(nameByUserId[msg.senderId] || msg.senderName) && (
                          <div className="border-t border-border/50 px-3 py-1.5 flex items-center gap-1 text-[10.5px] text-text-muted">
                            <span className="truncate">{nameByUserId[msg.senderId] || msg.senderName}</span>
                            {msg.createdAt && (
                              <span className="shrink-0">
                                · {formatCalendarDate(new Date(msg.createdAt))}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {polls.length > POLL_PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => setPollsShowAll((p) => !p)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-[#1565C0] transition-colors hover:bg-[#1565C0]/08"
                    >
                      {pollsShowAll ? (
                        <>Thu gọn <ChevronDownIcon className="h-3.5 w-3.5" /></>
                      ) : (
                        <>Xem tất cả {polls.length} bình chọn <ChevronRightIcon className="h-3.5 w-3.5" /></>
                      )}
                    </button>
                  )}
                </div>
              )}
            </CollapsibleSection>
          </div>

          {/* ── Reminders Section ── */}
          <div ref={remindersSectionRef}>
            <CollapsibleSection
              title="Nhắc hẹn"
              icon={<ClockIcon className="h-4 w-4" />}
              defaultOpen={false}
              badge={
                reminders.length > 0 ? (
                  <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] font-medium text-text-muted tabular-nums">
                    {reminders.length}
                  </span>
                ) : undefined
              }
            >
              <ReminderHistoryList
                reminders={reminders}
                loading={remindersLoading}
                onJumpToMessage={onJumpToMessage}
                onOpenCalendar={() => navigate("/calendar")}
              />
            </CollapsibleSection>
          </div>

          {/* Security Section — admin only */}
          {isAdmin && (
            <div
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <button
                type="button"
                onClick={() => setSecurityExpanded((p) => !p)}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                aria-expanded={securityExpanded}
              >
                <ShieldCheckIcon className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="flex-1 text-sm font-medium text-text-primary">
                  {t("profile:groupInfo.sections.security")}
                </span>
                {pendingJoinRequestsCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                    {pendingJoinRequestsCount}
                  </span>
                )}
                <ChevronDownIcon
                  className={clsx(
                    "h-4 w-4 shrink-0 text-text-muted transition-transform duration-200",
                    securityExpanded && "rotate-180",
                  )}
                />
              </button>

              {securityExpanded && (
                <div className="border-t border-border">
                  {/* Invite Links */}
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {t("profile:groupInfo.tabs.inviteLinks")}
                      </p>
                      {!inviteLinksControl.isFormOpen && (
                        <button
                          type="button"
                          onClick={inviteLinksControl.openForm}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                        >
                          <LinkIcon className="h-3 w-3" />
                          {t("profile:groupInfo.invite.create")}
                        </button>
                      )}
                    </div>

                    {inviteLinksControl.isFormOpen && (
                      <div className="space-y-2 rounded-xl border border-border p-3">
                        <Input
                          type="text"
                          value={inviteLinksControl.nameDraft}
                          onChange={(e) => inviteLinksControl.setNameDraft(e.target.value)}
                          placeholder={t("profile:groupInfo.invite.namePlaceholder")}
                          disabled={inviteLinksControl.isCreating}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={inviteLinksControl.isCreating}
                            onClick={inviteLinksControl.reset}
                            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
                          >
                            {t("common:actions.cancel")}
                          </button>
                          <button
                            type="button"
                            disabled={inviteLinksControl.isCreating}
                            onClick={() => void inviteLinksControl.createLink()}
                            className="rounded-md bg-[#1565C0] px-3 py-1.5 text-sm text-white hover:brightness-105 disabled:opacity-60"
                          >
                            {inviteLinksControl.isCreating ? t("common:loading.processing") : t("profile:groupInfo.invite.create")}
                          </button>
                        </div>
                      </div>
                    )}

                    {inviteLinks.length === 0 ? (
                      <div className="flex flex-col items-center py-4 text-center">
                        <LinkIcon className="mb-2 h-7 w-7 text-text-muted/50" />
                        <p className="text-sm text-text-muted">{t("profile:groupInfo.invite.empty")}</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                        {inviteLinks.map((link) => {
                          const shareValue = link.inviteUrl || link.token || "";
                          const isRevoked = Boolean(link.revokedAt);
                          return (
                            <div key={link.id} className="flex flex-col gap-2 px-3 py-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-text-primary">
                                    {link.name || t("profile:groupInfo.invite.unnamed")}
                                  </p>
                                  {isRevoked && (
                                    <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                                      {t("profile:groupInfo.invite.revokedLabel")}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 break-all text-xs text-text-muted">
                                  {link.inviteUrl || link.tokenPreview || link.id}
                                </p>
                                <p className="mt-1 text-xs text-text-muted">
                                  {t("profile:groupInfo.invite.usage", { count: link.usageCount || 0, limit: typeof link.usageLimit === "number" ? link.usageLimit : "unlimited" })}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!shareValue}
                                  onClick={() => void inviteLinksControl.copyLink(shareValue)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                                >
                                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                  {t("common:actions.copy")}
                                </button>
                                {!isRevoked && (
                                  <button
                                    type="button"
                                    disabled={inviteLinksControl.revokingId === link.id}
                                    onClick={() => void inviteLinksControl.revokeLink(link.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                                  >
                                    <NoSymbolIcon className="h-3.5 w-3.5" />
                                    {inviteLinksControl.revokingId === link.id ? t("common:loading.processing") : t("profile:groupInfo.invite.revoke")}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void inviteLinksControl.deleteLink(link.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10"
                                  aria-label="Xóa link mời"
                                >
                                  <TrashIcon className="h-3.5 w-3.5" />
                                  Xóa
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Join Requests */}
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {t("profile:groupInfo.tabs.joinRequests")}
                      {pendingJoinRequestsCount > 0 && (
                        <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger/15 px-1 text-[10px] font-bold text-danger">
                          {pendingJoinRequestsCount}
                        </span>
                      )}
                    </p>
                    {joinRequests.length === 0 ? (
                      <div className="flex flex-col items-center py-4 text-center">
                        <CheckIcon className="mb-2 h-7 w-7 text-text-muted/50" />
                        <p className="text-sm text-text-muted">{t("profile:groupInfo.joinRequests.empty")}</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                        {joinRequests.map((request) => {
                          const user = membersByUserId[request.userId] || members.find((m) => m.id === request.userId);
                          const displayName = resolveMemberName(user) || request.userId;
                          return (
                            <div key={request.id} className="flex items-start justify-between gap-3 px-3 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar src={user?.avatar} alt={displayName} size="md" status={user?.status} showStatus />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-text-primary">{displayName}</p>
                                  <p className="truncate text-xs text-text-muted">@{user?.username || request.userId}</p>
                                  {request.note && <p className="mt-1 truncate text-xs text-text-secondary">{request.note}</p>}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  disabled={resolvingRequestId === request.id}
                                  onClick={() => void handleResolveJoinRequest(request.id, "approved")}
                                  className="rounded-md bg-[#1565C0] px-3 py-1.5 text-xs text-white hover:brightness-105 disabled:opacity-60"
                                >
                                  {t("common:actions.approve")}
                                </button>
                                <button
                                  type="button"
                                  disabled={resolvingRequestId === request.id}
                                  onClick={() => void handleResolveJoinRequest(request.id, "rejected")}
                                  className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-60"
                                >
                                  {t("common:actions.reject")}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Danger Zone */}
          {(canLeaveCurrentGroup || currentUserRole === RoomMemberRole.OWNER) && (
            <CollapsibleSection
              title="Tuỳ chọn khác"
              icon={<ExclamationTriangleIcon className="h-4 w-4" />}
              defaultOpen={false}
              danger
            >
              <div className="space-y-0.5 px-4 py-3">
                {/* Leave */}
                {canLeaveCurrentGroup && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void handleLeaveGroup()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50/60 disabled:opacity-60"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-50">
                      <ArrowRightOnRectangleIcon className="h-4 w-4" />
                    </div>
                    <span>{t("profile:groupInfo.leaveGroup")}</span>
                  </button>
                )}

                {/* Delete (owner only) */}
                {currentUserRole === RoomMemberRole.OWNER && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void handleDeleteGroup()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50/60 disabled:opacity-60"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-50">
                      <TrashIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p>{t("profile:groupInfo.deleteGroup")}</p>
                      <p className="text-[11px] text-red-400">Chỉ trưởng nhóm — không thể hoàn tác</p>
                    </div>
                  </button>
                )}
              </div>
            </CollapsibleSection>
          )}
        </div>
      </div>
        </>
      )}

      {/* Hidden file input */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { void groupAvatar.handleFileChange(e); }}
      />

      {/* Confirmation modals */}
      {/* Rời nhóm là luồng duy nhất chưa có modal chuyên dụng — 4 luồng còn lại
          (xoá/cấm thành viên, chuyển quyền, xoá nhóm) dùng *Modal bên dưới. */}
      <ConfirmDialog
        isOpen={isLeaveGroupConfirmOpen}
        onClose={() => { if (!isConfirmActionPending) setIsLeaveGroupConfirmOpen(false); }}
        onConfirm={() => void confirmLeaveGroup()}
        title={t("profile:groupInfo.leaveGroup")}
        message={t("profile:groupInfo.leaveConfirm")}
        confirmText={t("profile:groupInfo.leaveGroup")}
        isLoading={isConfirmActionPending}
        variant="danger"
      />

      <AddMemberModal
        isOpen={showAddMember}
        onClose={() => setShowAddMember(false)}
        onAddMember={handleAddMember}
        excludeUserIds={excludeMemberIds}
        isSubmitting={isSubmitting}
      />

      <RemoveMemberModal
        isOpen={removeMemberTarget !== null}
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={() => {
          if (removeMemberTarget) {
            const member = members.find((m) => m.id === removeMemberTarget.memberId);
            if (member) void confirmRemoveMember(member);
            else setRemoveMemberTarget(null);
          }
        }}
        memberName={removeMemberTarget?.memberName || ""}
        isLoading={isConfirmActionPending}
      />

      <BanMemberModal
        isOpen={banMemberTarget !== null}
        onClose={() => setBanMemberTarget(null)}
        onConfirm={() => {
          if (banMemberTarget) {
            const member = members.find((m) => m.id === banMemberTarget.memberId);
            if (member) void confirmBanMember(member);
            else setBanMemberTarget(null);
          }
        }}
        memberName={banMemberTarget?.memberName || ""}
        isLoading={isConfirmActionPending}
      />

      <TransferOwnershipModal
        isOpen={transferOwnershipTarget !== null}
        onClose={() => setTransferOwnershipTarget(null)}
        onConfirm={() => {
          if (transferOwnershipTarget) {
            const member = members.find((m) => m.id === transferOwnershipTarget.memberId);
            if (member) void confirmTransferOwnership(member);
            else setTransferOwnershipTarget(null);
          }
        }}
        memberName={transferOwnershipTarget?.memberName || ""}
        isLoading={isConfirmActionPending}
      />

      <DeleteGroupModal
        isOpen={deleteGroupTarget}
        onClose={() => setDeleteGroupTarget(false)}
        onConfirm={() => void confirmDeleteGroup()}
        groupName={conversation.name || ""}
        isLoading={isConfirmActionPending}
      />

      <PollCreateDialog
        isOpen={isPollDialogOpen}
        onClose={() => setIsPollDialogOpen(false)}
        onSubmit={handleCreatePanelPoll}
      />

      <ReminderCreateDialog
        isOpen={isReminderDialogOpen}
        onClose={() => setIsReminderDialogOpen(false)}
        onSubmit={handleCreatePanelReminder}
      />

      <NoteCreateDialog
        isOpen={isNoteDialogOpen}
        onClose={() => setIsNoteDialogOpen(false)}
        onSubmit={handleCreatePanelNote}
      />

      <MuteConversationDialog
        isOpen={isMuteConfirmOpen}
        value={muteDuration}
        onChange={setMuteDuration}
        onClose={() => setIsMuteConfirmOpen(false)}
        onConfirm={() => {
          setIsMuted(true);
          setIsMuteConfirmOpen(false);
        }}
      />

      {/* Member profile modal */}
      {viewingMemberId && (
        <DraggableProfileModal onClose={() => setViewingMemberId(null)}>
          <UserProfile
            userId={viewingMemberId}
            currentUserId={currentUserId}
            conversationContext="group"
            initialUser={(() => {
              const m = members.find((mem) => mem.id === viewingMemberId);
              return m ? { id: m.id, username: m.username, displayName: m.displayName, avatar: m.avatar, status: m.status } : null;
            })()}
            onClose={() => setViewingMemberId(null)}
            onStartConversation={onStartConversation}
          />
        </DraggableProfileModal>
      )}
    </div>
  );
};

const InfoNavRow: React.FC<{
  title: string;
  icon?: React.ReactNode;
  meta?: string;
  expanded?: boolean;
  onClick: () => void;
}> = ({ title, icon, meta, expanded, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-[60px] w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
  >
    {icon && <span className="shrink-0 text-text-primary">{icon}</span>}
    <div className="min-w-0 flex-1">
      <p className="truncate text-[16px] font-semibold text-text-primary">{title}</p>
      {meta && <p className="mt-1 text-[15px] text-text-secondary">{meta}</p>}
    </div>
    {expanded === undefined ? (
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-muted" />
    ) : expanded ? (
      <ChevronDownIcon className="h-4 w-4 shrink-0 text-text-muted" />
    ) : (
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-muted" />
    )}
  </button>
);

const DangerActionRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}> = ({ icon, label, danger = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      "flex min-h-[56px] w-full items-center gap-4 px-7 py-3 text-left text-[15px] transition-colors hover:bg-surface-hover",
      danger ? "text-red-600" : "text-text-primary",
    )}
  >
    <span className="shrink-0">{icon}</span>
    <span>{label}</span>
  </button>
);

const NoteCreateDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { content: string; pinToTop: boolean }) => void;
}> = ({ isOpen, onClose, onSubmit }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [content, setContent] = React.useState("");
  const [pinToTop, setPinToTop] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setContent("");
    setPinToTop(false);
  }, [isOpen]);

  const canSubmit = content.trim().length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      showCloseButton={false}
      contentClassName="max-w-[552px] rounded"
      bodyClassName="p-0"
      initialFocusRef={textareaRef}
      footer={
        <div className="flex items-center justify-end gap-4 px-5 pb-4 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded bg-[#e5e7eb] px-6 text-[17px] font-semibold text-text-primary hover:bg-[#dfe2e7]"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onSubmit({ content: content.trim(), pinToTop });
              onClose();
            }}
            className={clsx(
              "h-12 rounded px-6 text-[17px] font-semibold transition-colors",
              canSubmit
                ? "bg-[#8ec1ff] text-white hover:bg-[#69aaff]"
                : "cursor-not-allowed bg-[#a8cdfb] text-white/80",
            )}
          >
            Tạo ghi chú
          </button>
        </div>
      }
    >
      <div className="flex h-[60px] items-center justify-between border-b border-border px-5">
        <h2 className="text-[20px] font-semibold text-text-primary">
          Tạo ghi chú
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded text-text-primary hover:bg-surface-hover"
          aria-label="Đóng"
        >
          <XMarkIcon className="h-7 w-7" />
        </button>
      </div>

      <div className="px-5 py-5">
        <label className="mb-2 block text-[17px] font-medium text-text-primary">
          Nội dung
        </label>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder="Nhập nội dung mới hoặc dán link"
          className="h-[226px] w-full resize-none rounded border border-[#0068ff] bg-surface px-3 py-3 text-[17px] leading-6 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#0068ff]/15"
        />

        <button
          type="button"
          onClick={() => setPinToTop((value) => !value)}
          className="mt-5 flex items-center gap-4 text-left text-[17px] text-text-primary"
        >
          <span
            className={clsx(
              "flex h-6 w-6 items-center justify-center rounded border",
              pinToTop
                ? "border-[#0068ff] bg-[#0068ff] text-white"
                : "border-border bg-surface text-transparent",
            )}
          >
            <CheckIcon className="h-4 w-4 stroke-[3]" />
          </span>
          <span>Ghim lên đầu trò chuyện</span>
        </button>
      </div>
    </Modal>
  );
};

const MUTE_OPTIONS = [
  { value: "1h", label: "Trong 1 giờ" },
  { value: "4h", label: "Trong 4 giờ" },
  { value: "8am", label: "Cho đến 8:00 AM" },
  { value: "until-open", label: "Cho đến khi được mở lại" },
];

const MuteConversationDialog: React.FC<{
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ isOpen, value, onChange, onClose, onConfirm }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    size="md"
    showCloseButton={false}
    contentClassName="max-w-[502px] rounded"
    bodyClassName="p-0"
    footer={
      <div className="flex items-center justify-end gap-5 px-5 pb-5 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="h-12 rounded bg-[#e5e7eb] px-6 text-[18px] font-semibold text-text-primary hover:bg-[#dfe2e7]"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-12 rounded bg-[#0068ff] px-6 text-[18px] font-semibold text-white hover:bg-[#005ae0]"
        >
          Đồng ý
        </button>
      </div>
    }
  >
    <div className="flex h-[60px] items-center justify-between border-b border-border px-5">
      <h2 className="text-[20px] font-semibold text-text-primary">Xác nhận</h2>
      <button
        type="button"
        onClick={onClose}
        className="flex h-10 w-10 items-center justify-center rounded text-text-primary hover:bg-surface-hover"
        aria-label="Đóng"
      >
        <XMarkIcon className="h-7 w-7" />
      </button>
    </div>

    <div className="px-5 py-5">
      <p className="mb-5 text-[17px] text-text-primary">
        Bạn có chắc muốn tắt thông báo hội thoại này:
      </p>
      <div className="space-y-4">
        {MUTE_OPTIONS.map((option) => {
          const checked = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className="flex w-full items-center gap-2 text-left text-[17px] text-text-primary"
            >
              <span
                className={clsx(
                  "flex h-5 w-5 items-center justify-center rounded-full border",
                  checked ? "border-[#0068ff]" : "border-[#cfd3d9]",
                )}
              >
                {checked && <span className="h-3 w-3 rounded-full bg-[#0068ff]" />}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  </Modal>
);

const PanelHeader: React.FC<{
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, right }) => (
  <div className="app-page-header sticky top-0 z-10 flex shrink-0 items-center justify-between px-4 py-2.5">
    <button
      type="button"
      onClick={onBack}
      className="icon-button-surface h-9 w-9"
      aria-label="Quay lại"
    >
      <ArrowLeftIcon className="h-5 w-5" />
    </button>
    <h3 className="text-title-sm text-text-primary">{title}</h3>
    <div className="flex h-9 min-w-9 items-center justify-end">{right}</div>
  </div>
);

const GroupMembersPanel: React.FC<{
  title: string;
  members: GroupMember[];
  allMembers: GroupMember[];
  isLoading: boolean;
  currentUserId: string;
  currentUserRole: RoomMemberRole;
  capabilities: React.ComponentProps<typeof MembersList>["capabilities"];
  actingMemberId: string | null;
  canAddMembers: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onAddMember: () => void;
  onMakeAdmin: (memberId: string) => void;
  onRemoveAdmin: (memberId: string) => void;
  onTransferOwnership: (memberId: string) => void;
  onBanMember: (memberId: string) => void;
  onRemoveMember: (memberId: string) => void;
  onMemberClick: (memberId: string) => void;
}> = ({
  title,
  members,
  allMembers,
  isLoading,
  currentUserId,
  currentUserRole,
  capabilities,
  actingMemberId,
  canAddMembers,
  isSubmitting,
  onBack,
  onAddMember,
  onMakeAdmin,
  onRemoveAdmin,
  onTransferOwnership,
  onBanMember,
  onRemoveMember,
  onMemberClick,
}) => (
  <div className="flex h-full flex-col bg-surface">
    <PanelHeader title={title} onBack={onBack} />
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-5 py-5">
        {canAddMembers && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onAddMember}
            className="flex h-10 w-full items-center justify-center gap-2 rounded bg-[#e4e7ec] text-[16px] font-semibold text-text-primary transition-colors hover:bg-[#dde1e7] disabled:opacity-60"
          >
            <UserPlusIcon className="h-5 w-5" />
            Thêm thành viên
          </button>
        )}
      </div>
      <div className="flex items-center justify-between px-5 pb-3">
        <span className="text-[15px] font-semibold text-text-primary">
          Danh sách thành viên ({allMembers.length})
        </span>
        <EllipsisHorizontalIcon className="h-6 w-6 text-text-primary" />
      </div>
      <MembersList
        members={members}
        isLoading={isLoading}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        capabilities={capabilities}
        actingMemberId={actingMemberId}
        onMakeAdmin={onMakeAdmin}
        onRemoveAdmin={onRemoveAdmin}
        onTransferOwnership={onTransferOwnership}
        onBanMember={onBanMember}
        onRemoveMember={onRemoveMember}
        onMemberClick={onMemberClick}
        className="border-t border-border/50"
      />
    </div>
  </div>
);

const ReminderPanel: React.FC<{
  reminders: Message[];
  loading: boolean;
  onBack: () => void;
  onCreate: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onOpenCalendar: () => void;
}> = ({ reminders, loading, onBack, onCreate, onJumpToMessage, onOpenCalendar }) => (
  <div className="flex h-full flex-col bg-surface">
    <PanelHeader
      title="Danh sách nhắc hẹn"
      onBack={onBack}
      right={
        <button
          type="button"
          onClick={onCreate}
          className="icon-button-surface h-9 w-9 text-[#0068ff]"
          aria-label="Tạo nhắc hẹn"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      }
    />
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
      {loading || reminders.length > 0 ? (
        <ReminderHistoryList
          reminders={reminders}
          loading={loading}
          onJumpToMessage={onJumpToMessage}
          onOpenCalendar={onOpenCalendar}
        />
      ) : (
        <div className="flex flex-col items-center pt-8 text-center">
          <CalendarDaysIcon className="h-28 w-28 text-[#dfeaff]" strokeWidth={1.4} />
          <p className="mt-7 max-w-[260px] text-[15px] leading-6 text-text-secondary">
            Chưa có nhắc hẹn nào được chia sẻ trong hội thoại này
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded bg-[#e5f1ff] text-[16px] font-semibold text-[#005ae0] hover:bg-[#d9ebff]"
          >
            <ClockIcon className="h-5 w-5" />
            Tạo nhắc hẹn
          </button>
        </div>
      )}
    </div>
  </div>
);

const GroupManagePanel: React.FC<{
  inviteLinks: InviteLinkItem[];
  pendingJoinRequestsCount: number;
  onBack: () => void;
  onCopyInvite: (value: string) => void;
  onCreateInvite: () => void;
  onBlockList: () => void;
}> = ({
  inviteLinks,
  pendingJoinRequestsCount,
  onBack,
  onCopyInvite,
  onCreateInvite,
  onBlockList,
}) => {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [permissions, setPermissions] = React.useState({
    rename: false,
    pin: true,
    createNoteReminder: false,
    createPoll: true,
    sendMessage: false,
  });
  const [approvalMode, setApprovalMode] = React.useState(false);
  const [markOwnerMessages, setMarkOwnerMessages] = React.useState(true);
  const [readRecent, setReadRecent] = React.useState(true);
  const [allowJoinLink, setAllowJoinLink] = React.useState(true);

  const invite = inviteLinks.find((link) => !link.revokedAt);
  const inviteValue = invite?.inviteUrl || invite?.token || invite?.tokenPreview || "";

  const updatePermission = (key: keyof typeof permissions) => {
    setPermissions((current) => ({ ...current, [key]: !current[key] }));
  };

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="flex h-full flex-col bg-surface">
      <PanelHeader title="Quản lý nhóm" onBack={onBack} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-6 py-4">
          <h4 className="mb-4 text-[15px] font-semibold leading-5 text-text-primary">
            Cho phép các thành viên trong nhóm:
          </h4>
          <div className="space-y-4">
            <PermissionRow
              label="Thay đổi tên & ảnh đại diện của nhóm"
              checked={permissions.rename}
              onChange={() => updatePermission("rename")}
            />
            <PermissionRow
              label="Ghim tin nhắn, ghi chú, bình chọn lên đầu hội thoại"
              checked={permissions.pin}
              onChange={() => updatePermission("pin")}
            />
            <PermissionRow
              label="Tạo mới ghi chú, nhắc hẹn"
              checked={permissions.createNoteReminder}
              onChange={() => updatePermission("createNoteReminder")}
            />
            <PermissionRow
              label="Tạo mới bình chọn"
              checked={permissions.createPoll}
              onChange={() => updatePermission("createPoll")}
            />
            <PermissionRow
              label="Gửi tin nhắn"
              checked={permissions.sendMessage}
              onChange={() => updatePermission("sendMessage")}
            />
          </div>
        </section>

        <div className="h-2 bg-[#eef0f4]" />

        <section className="divide-y divide-[#e1e4ea] px-6">
          <ManageToggleRow
            label="Chế độ phê duyệt thành viên mới"
            checked={approvalMode}
            onChange={setApprovalMode}
            hint
            badge={pendingJoinRequestsCount > 0 ? pendingJoinRequestsCount : undefined}
          />
          <ManageToggleRow
            label="Đánh dấu tin nhắn từ trưởng/phó nhóm"
            checked={markOwnerMessages}
            onChange={setMarkOwnerMessages}
            hint
          />
          <ManageToggleRow
            label="Cho phép thành viên mới đọc tin nhắn gần nhất"
            checked={readRecent}
            onChange={setReadRecent}
            hint
          />
          <div className="py-4">
            <ManageToggleRow
              label="Cho phép dùng link tham gia nhóm"
              checked={allowJoinLink}
              onChange={setAllowJoinLink}
              hint
              compact
            />
            {allowJoinLink && (
              <div className="mt-3 flex h-10 items-center gap-3 rounded bg-[#eef6ff] px-4">
                {inviteValue ? (
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#005ae0]">
                    {invite?.inviteUrl || inviteValue}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onCreateInvite}
                    className="min-w-0 flex-1 text-left text-[14px] font-semibold text-[#005ae0]"
                  >
                    Tạo link tham gia nhóm
                  </button>
                )}
                {inviteValue && (
                  <button
                    type="button"
                    onClick={() => onCopyInvite(inviteValue)}
                    className="text-[#0068ff] hover:text-[#005ae0]"
                    aria-label="Sao chép link"
                  >
                    <ClipboardDocumentIcon className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  className="text-[#0068ff] hover:text-[#005ae0]"
                  aria-label="Chia sẻ link"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5 rotate-180" />
                </button>
              </div>
            )}
          </div>
        </section>

        <div className="h-2 bg-[#eef0f4]" />

        <button
          type="button"
          onClick={onBlockList}
          className="flex min-h-[58px] w-full items-center gap-3 px-6 text-left text-[15px] text-text-primary hover:bg-surface-hover"
        >
          <UsersIcon className="h-6 w-6" />
          <span>Chặn khỏi nhóm</span>
        </button>
      </div>
    </div>
  );
};

const PermissionRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: () => void;
}> = ({ label, checked, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    className="flex w-full items-center gap-3 text-left"
  >
    <span className="min-w-0 flex-1 text-[15px] leading-5 text-text-primary">
      {label}
    </span>
    <span
      className={clsx(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
        checked
          ? "border-[#0068ff] bg-[#0068ff] text-white"
          : "border-[#d8dbe0] bg-surface text-transparent",
      )}
    >
      <CheckIcon className="h-3.5 w-3.5 stroke-[3]" />
    </span>
  </button>
);

const ManageToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: boolean;
  badge?: number;
  compact?: boolean;
}> = ({ label, checked, onChange, hint = false, badge, compact = false }) => (
  <div className={clsx("flex items-center gap-4", compact ? "py-0" : "py-4")}>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 text-[15px] font-semibold leading-5 text-text-primary">
        <span className="min-w-0">{label}</span>
        {hint && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-text-muted text-[10px] font-semibold text-text-muted">
            ?
          </span>
        )}
        {badge && (
          <span className="rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">
            {badge}
          </span>
        )}
      </div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors",
        checked ? "bg-[#0068ff]" : "bg-[#b8b8b8]",
      )}
    >
      <span
        className={clsx(
          "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  </div>
);

const GroupBoardPanel: React.FC<{
  boardTab: BoardTab;
  onBoardTabChange: (tab: BoardTab) => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  pinnedMessages: Message[];
  pinnedMessagesLoading: boolean;
  currentUserId: string;
  polls: Message[];
  pollsLoading: boolean;
  pollsShowAll: boolean;
  onPollsShowAllChange: (value: boolean | ((prev: boolean) => boolean)) => void;
  reminders: Message[];
  remindersLoading: boolean;
  voterProfilesMap: Record<string, { name: string; avatar: string | null }>;
  nameByUserId: Record<string, string>;
  onBack: () => void;
  onCreatePoll: () => void;
  onCreateReminder: () => void;
  onCreateNote: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onOpenCalendar: () => void;
  onVoterAvatarError: (userId: string) => void;
}> = ({
  boardTab,
  onBoardTabChange,
  menuOpen,
  onMenuOpenChange,
  pinnedMessages,
  pinnedMessagesLoading,
  currentUserId,
  polls,
  pollsLoading,
  pollsShowAll,
  onPollsShowAllChange,
  reminders,
  remindersLoading,
  voterProfilesMap,
  nameByUserId,
  onBack,
  onCreatePoll,
  onCreateReminder,
  onCreateNote,
  onJumpToMessage,
  onOpenCalendar,
  onVoterAvatarError,
}) => {
  const tabs: { key: BoardTab; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "pinned", label: "Tin ghim" },
    { key: "notes", label: "Ghi chú" },
    { key: "polls", label: "Bình chọn" },
  ];
  const showPinned = boardTab === "all" || boardTab === "pinned";
  const showPolls = boardTab === "all" || boardTab === "polls";
  const showReminders = boardTab === "all";
  const hasContent =
    (showPinned && pinnedMessages.length > 0) ||
    (showPolls && polls.length > 0) ||
    (showReminders && reminders.length > 0);
  const isLoadingBoard =
    (showPinned && pinnedMessagesLoading) ||
    (showPolls && pollsLoading) ||
    (showReminders && remindersLoading);

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--chat-panel-bg))]">
      <PanelHeader
        title="Bảng tin nhóm"
        onBack={onBack}
        right={
          <div className="relative">
            <button
              type="button"
              onClick={() => onMenuOpenChange(!menuOpen)}
              className="icon-button-surface h-9 w-9 text-[#0068ff]"
              aria-label="Thêm bảng tin"
            >
              <PlusIcon className="h-7 w-7" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-lg border border-border bg-surface py-2 shadow-elev3">
                <MenuAction onClick={onCreatePoll}>Tạo bình chọn</MenuAction>
                <MenuAction onClick={onCreateNote}>Tạo ghi chú</MenuAction>
                <MenuAction onClick={onCreateReminder}>Tạo nhắc hẹn</MenuAction>
              </div>
            )}
          </div>
        }
      />
      <div className="flex h-[58px] shrink-0 border-b border-border bg-surface px-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onBoardTabChange(tab.key)}
            className={clsx(
              "relative flex h-full flex-1 items-center justify-center text-[16px] font-semibold transition-colors",
              boardTab === tab.key
                ? "text-[#005ae0]"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {tab.label}
            {boardTab === tab.key && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#0068ff]" />
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {!hasContent && !isLoadingBoard ? (
          <BoardEmptyState
            onCreatePoll={onCreatePoll}
            onCreateNote={onCreateNote}
            showPollButton={boardTab === "all" || boardTab === "polls"}
          />
        ) : (
          <div className="space-y-5">
            {boardTab === "all" ? (
              <>
                <PollPreviewList
                  polls={polls}
                  loading={pollsLoading}
                  showAll={false}
                  startIndex={0}
                  limit={1}
                  showMoreButton={false}
                  onShowAllChange={onPollsShowAllChange}
                  voterProfilesMap={voterProfilesMap}
                  currentUserId={currentUserId}
                  onJumpToMessage={onJumpToMessage}
                  onVoterAvatarError={onVoterAvatarError}
                />
                <PinnedBoardList
                  messages={pinnedMessages}
                  loading={pinnedMessagesLoading}
                  nameByUserId={nameByUserId}
                  currentUserId={currentUserId}
                  onJumpToMessage={onJumpToMessage}
                />
                <PollPreviewList
                  polls={polls}
                  loading={false}
                  showAll={pollsShowAll}
                  startIndex={1}
                  limit={2}
                  showMoreButton
                  onShowAllChange={onPollsShowAllChange}
                  voterProfilesMap={voterProfilesMap}
                  currentUserId={currentUserId}
                  onJumpToMessage={onJumpToMessage}
                  onVoterAvatarError={onVoterAvatarError}
                />
              </>
            ) : (
              <>
                {showPolls && (
                  <PollPreviewList
                    polls={polls}
                    loading={pollsLoading}
                    showAll
                    showMoreButton={false}
                    onShowAllChange={onPollsShowAllChange}
                    voterProfilesMap={voterProfilesMap}
                    currentUserId={currentUserId}
                    onJumpToMessage={onJumpToMessage}
                    onVoterAvatarError={onVoterAvatarError}
                  />
                )}
                {showPinned && (
                  <PinnedBoardList
                    messages={pinnedMessages}
                    loading={pinnedMessagesLoading}
                    nameByUserId={nameByUserId}
                    currentUserId={currentUserId}
                    onJumpToMessage={onJumpToMessage}
                  />
                )}
              </>
            )}
            {showReminders && (
              <ReminderHistoryList
                reminders={reminders}
                loading={remindersLoading}
                onJumpToMessage={onJumpToMessage}
                onOpenCalendar={onOpenCalendar}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MenuAction: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
}> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="block w-full px-5 py-2.5 text-left text-[15px] text-text-primary hover:bg-surface-hover"
  >
    {children}
  </button>
);

const PinnedBoardList: React.FC<{
  messages: Message[];
  loading: boolean;
  nameByUserId: Record<string, string>;
  currentUserId: string;
  onJumpToMessage?: (messageId: string) => void;
}> = ({ messages, loading, nameByUserId, currentUserId, onJumpToMessage }) => {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded border border-border bg-surface p-4">
            <div className="mb-3 h-4 w-2/3 rounded bg-surface-active" />
            <div className="h-3 w-full rounded bg-surface-active/70" />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) return null;

  return (
    <div className="space-y-4">
      {messages.slice(0, 4).map((message) => {
        const senderName =
          nameByUserId[message.senderId] || message.senderName || "Người gửi";
        const preview = getMessagePreview(message, currentUserId, 110);
        const senderAvatar =
          (message as { senderAvatar?: string; senderAvatarUrl?: string }).senderAvatar ||
          (message as { senderAvatar?: string; senderAvatarUrl?: string }).senderAvatarUrl;
        return (
          <button
            key={message.id}
            type="button"
            onClick={() => onJumpToMessage?.(message.id)}
            className="w-full rounded border border-[#d8dbe0] bg-surface p-4 text-left transition-colors hover:bg-surface-hover/60"
          >
            <div className="flex items-start gap-3">
              <Avatar
                src={senderAvatar}
                alt={senderName}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold leading-5 text-text-primary">
                  {senderName}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[14px] text-text-secondary">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-[#0068ff]" />
                  <span>Tin ghim</span>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <p className="truncate text-[15px] font-semibold text-text-primary">
                {senderName}
              </p>
              <p className="mt-2 line-clamp-2 text-[14px] leading-5 text-text-primary">
                {preview}
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[14px] text-text-secondary">
              {message.createdAt ? (
                <span>{formatCalendarDate(new Date(message.createdAt))}</span>
              ) : null}
              <span className="text-border">|</span>
              <span className="font-semibold text-[#0068ff]">
                Xem tin nhắn gốc
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

const BoardEmptyState: React.FC<{
  onCreatePoll: () => void;
  onCreateNote: () => void;
  showPollButton: boolean;
}> = ({ onCreatePoll, onCreateNote, showPollButton }) => (
  <div className="flex flex-col items-center pt-2 text-center">
    <ClipboardDocumentListIcon className="h-32 w-32 text-[#dff3ff]" strokeWidth={1.25} />
    <p className="mt-6 max-w-[260px] text-[15px] leading-6 text-text-primary">
      Các thông báo và bình chọn mới sẽ xuất hiện tại đây
    </p>
    {showPollButton && (
      <button
        type="button"
        onClick={onCreatePoll}
        className="mt-8 flex h-10 w-full items-center justify-center gap-2 rounded bg-[#e5f1ff] text-[16px] font-semibold text-[#005ae0] hover:bg-[#d9ebff]"
      >
        <ChartBarIcon className="h-5 w-5" />
        Tạo bình chọn
      </button>
    )}
    <button
      type="button"
      onClick={onCreateNote}
      className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded bg-[#e5f1ff] text-[16px] font-semibold text-[#005ae0] hover:bg-[#d9ebff]"
    >
      <ClockIcon className="h-5 w-5" />
      Tạo ghi chú
    </button>
  </div>
);

const PollPreviewList: React.FC<{
  polls: Message[];
  loading: boolean;
  showAll: boolean;
  startIndex?: number;
  limit?: number;
  showMoreButton?: boolean;
  onShowAllChange: (value: boolean | ((prev: boolean) => boolean)) => void;
  voterProfilesMap: Record<string, { name: string; avatar: string | null }>;
  currentUserId: string;
  onJumpToMessage?: (messageId: string) => void;
  onVoterAvatarError: (userId: string) => void;
}> = ({
  polls,
  loading,
  showAll,
  startIndex = 0,
  limit,
  showMoreButton = true,
  onShowAllChange,
  currentUserId,
  onJumpToMessage,
}) => {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded border border-border bg-surface p-4">
            <div className="mb-4 h-5 w-4/5 rounded bg-surface-active" />
            <div className="mb-2 h-11 w-full rounded bg-surface-active/70" />
            <div className="h-11 w-full rounded bg-surface-active/70" />
          </div>
        ))}
      </div>
    );
  }

  if (polls.length === 0) return null;
  if (startIndex >= polls.length) return null;

  const collapsedLimit = limit ?? POLL_PREVIEW_COUNT;
  const visiblePolls = showAll
    ? polls.slice(startIndex)
    : polls.slice(startIndex, startIndex + collapsedLimit);
  const hasHiddenPolls = polls.length > startIndex + collapsedLimit;

  return (
    <div className="space-y-4">
      {visiblePolls.map((msg) => {
        const poll = (msg.metadata as { poll?: PollInfo } | null | undefined)?.poll;
        if (!poll) return null;
        const endsAt = (poll as unknown as { endsAt?: string | Date | null }).endsAt;
        const endLabel = endsAt
          ? `Kết thúc lúc ${formatCalendarDate(new Date(endsAt))}`
          : poll.isClosed
            ? `Kết thúc lúc ${formatCalendarDate(new Date(msg.createdAt ?? Date.now()))}`
            : "Đang mở";
        const visibleOptions = poll.options.slice(0, 3);

        return (
          <div
            key={msg.id}
            role={onJumpToMessage ? "button" : undefined}
            tabIndex={onJumpToMessage ? 0 : undefined}
            onClick={onJumpToMessage ? () => onJumpToMessage(msg.id) : undefined}
            onKeyDown={
              onJumpToMessage
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onJumpToMessage(msg.id);
                    }
                  }
                : undefined
            }
            className={clsx(
              "rounded border border-[#d8dbe0] bg-surface p-4 transition-colors hover:border-[#b9c1cf]",
              onJumpToMessage &&
                "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/30",
            )}
          >
            <p className="line-clamp-2 text-[20px] font-semibold leading-7 text-text-primary">
              {poll.question}
            </p>
            <p className="mt-3 text-[15px] leading-5 text-text-secondary">
              {endLabel}
            </p>
            <p className="mt-3 text-[15px] leading-5 text-text-secondary">
              {poll.allowMultiple ? "Chọn nhiều phương án" : "Chọn một phương án"}
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onJumpToMessage?.(msg.id);
              }}
              className="mt-5 inline-flex items-center gap-2 text-[15px] font-medium text-[#0068ff] hover:underline"
            >
              {poll.totalVotes} người bình chọn
              <ChevronRightIcon className="h-4 w-4 stroke-[3]" />
            </button>

            <div className="mt-4 space-y-3">
              {visibleOptions.map((opt) => {
                const pct = poll.totalVotes > 0
                  ? Math.round((opt.votes / poll.totalVotes) * 100)
                  : 0;
                const isSelected = (opt.voterIds ?? []).includes(currentUserId);
                return (
                  <div key={opt.id} className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-3">
                    <div className="relative h-11 overflow-hidden rounded bg-[#e6e8ed]">
                      <div
                        className="absolute inset-y-0 left-0 bg-[#c7e1ff] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex h-full items-center gap-2 px-3">
                        <span className="min-w-0 flex-1 truncate text-[16px] text-text-primary">
                          {opt.text}
                        </span>
                        {isSelected && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0068ff] text-white">
                            <CheckIcon className="h-3.5 w-3.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-right text-[16px] text-text-primary tabular-nums">
                      {opt.votes}
                    </span>
                  </div>
                );
              })}
              {poll.options.length > visibleOptions.length && (
                <p className="text-[16px] text-text-muted">
                  * Còn {poll.options.length - visibleOptions.length} lựa chọn khác
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onJumpToMessage?.(msg.id);
              }}
              className="mt-4 flex h-10 w-full items-center justify-center rounded border border-[#0068ff] text-[18px] font-semibold text-[#005ae0] hover:bg-[#eef6ff]"
            >
              Đổi lựa chọn
            </button>
          </div>
        );
      })}
      {showMoreButton && hasHiddenPolls && (
        <button
          type="button"
          onClick={() => onShowAllChange((p) => !p)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-[#1565C0] transition-colors hover:bg-[#1565C0]/[0.08]"
        >
          {showAll ? (
            <>Thu gọn <ChevronDownIcon className="h-3.5 w-3.5" /></>
          ) : (
            <>Xem tất cả {polls.length} bình chọn <ChevronRightIcon className="h-3.5 w-3.5" /></>
          )}
        </button>
      )}
    </div>
  );
};

export default GroupInfo;

// Re-export for convenience
export type { GroupInfoProps };
