import React, { useState, useCallback } from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  CheckIcon,
  UserPlusIcon,
  ArrowRightOnRectangleIcon,
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
  BellIcon,
  BellSlashIcon,
  TrashIcon,
  ChartBarIcon,
  ClockIcon,
  LockClosedIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { SquarePen, Pin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "../common/Avatar";
import {
  ConfirmDialog,
  DirectorySkeleton,
  Input,
  toast,
} from "../ui";
import type { Conversation, Message } from "../../types";
import { MessageType, RoomMemberRole } from "../../types";
import type { PollInfo } from "@hacom/chat-shared-types/chat";
import { ReminderHistoryList } from "./ReminderHistoryList";
import { CollapsibleSection } from "./CollapsibleSection";
import { messageApi } from "../../services/api";
import {
  loadUserProfiles,
  invalidateUserProfileSummary,
} from "../../services/userBatchLoader";
import { resolvePublicResourceUrl } from "../../config";
import { useChatStore, useGroupStore } from "../../stores";
import { useUIStore } from "../../stores/uiStore";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import type { InviteLinkItem, JoinRequestItem } from "../../stores/groupStore";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { resolveConversationId } from "../../lib/conversationIdentity";
import { chatApi } from "../../features/chat/api/chatApi";
import { useGroupAvatarUpload } from "./useGroupAvatarUpload";
import { useGroupInviteLinks } from "./useGroupInviteLinks";
import { useGroupRename } from "./useGroupRename";
import { asStringValue as asString } from "../../utils/payloadGuards";
import {
  useGroupMembers,
  resolveMemberName,
  type GroupMember,
} from "./useGroupMembers";
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
import { UserProfile } from "./UserProfile";
import { DraggableProfileModal } from "./DraggableProfileModal";

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

  React.useEffect(() => {
    if (!conversation.id) return;
    setPollsShowAll(false);
    setPollsLoading(true);
    void messageApi
      .searchMessages({ conversationId: conversation.id, type: MessageType.POLL, q: "", limit: 30 })
      .then((res) => {
        const messages = unwrapApiSuccess(res)?.messages ?? [];
        setPolls(messages);
        // Batch-load all voter profiles across all polls
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

  const pinnedConversationIds = useUIStore((state) => state.pinnedConversationIds);
  const togglePinnedConversation = useUIStore((state) => state.togglePinnedConversation);
  const isPinned = pinnedConversationIds.includes(conversation.id);

  const updateConversation = useChatStore((state) => state.updateConversation);
  const removeConversation = useChatStore((state) => state.removeConversation);

  const handleTogglePin = useCallback(() => {
    togglePinnedConversation(conversation.id);
    toast.success(isPinned ? "Đã bỏ ghim hội thoại" : "Đã ghim hội thoại");
  }, [isPinned, conversation.id, togglePinnedConversation]);

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
  }, [conversation.id, conversation.name, resetGroupAvatar]);


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
        setShowAddMember(false);
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
        <div className="bg-surface px-4 pb-5">
          <div className="flex flex-wrap justify-center gap-2">
            {/* Mute / Unmute */}
            <button
              type="button"
              onClick={() => setIsMuted((p) => !p)}
              className="group flex w-20 flex-col items-center gap-1.5 rounded-2xl bg-surface-overlay px-1 py-3.5 transition-colors hover:bg-surface-hover"
              aria-label={isMuted ? "Bật thông báo nhóm" : "Tắt thông báo nhóm"}
            >
              <div className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                isMuted ? "bg-surface-active" : "bg-primary/10 group-hover:bg-primary/15",
              )}>
                {isMuted
                  ? <BellSlashIcon className="h-5 w-5 text-text-secondary" />
                  : <BellIcon className="h-5 w-5 text-primary" />
                }
              </div>
              <span className="text-center text-[11px] font-medium leading-tight text-text-secondary">
                {isMuted ? "Bật thông báo" : "Tắt thông báo"}
              </span>
            </button>

            {/* Pin / Unpin */}
            <button
              type="button"
              onClick={() => { void handleTogglePin(); }}
              className="group flex w-20 flex-col items-center gap-1.5 rounded-2xl bg-surface-overlay px-1 py-3.5 transition-colors hover:bg-surface-hover"
              aria-label={isPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}
            >
              <div className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                isPinned ? "bg-surface-active" : "bg-primary/10 group-hover:bg-primary/15",
              )}>
                <Pin size={20} color="currentColor" strokeWidth={1.5} className={isPinned ? "text-text-secondary" : "text-primary"} />
              </div>
              <span className="text-center text-[11px] font-medium leading-tight text-text-secondary">
                {isPinned ? "Bỏ ghim" : "Ghim nhóm"}
              </span>
            </button>

            {/* Add Member */}
            {canAddMembers && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowAddMember((p) => !p)}
                className="group flex w-20 flex-col items-center gap-1.5 rounded-2xl bg-surface-overlay px-1 py-3.5 transition-colors hover:bg-surface-hover"
                aria-label="Thêm thành viên vào nhóm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <UserPlusIcon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-center text-[11px] font-medium leading-tight text-text-secondary">
                  {t("profile:groupInfo.addMember")}
                </span>
              </button>
            )}

            {/* Join Requests (admin only, if pending) */}
            {isAdmin && pendingJoinRequestsCount > 0 && (
              <button
                type="button"
                onClick={() => setSecurityExpanded(true)}
                className="group relative flex w-20 flex-col items-center gap-1.5 rounded-2xl bg-surface-overlay px-1 py-3.5 transition-colors hover:bg-surface-hover"
                aria-label={`${pendingJoinRequestsCount} yêu cầu vào nhóm đang chờ`}
              >
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-warning/10 transition-colors group-hover:bg-warning/15">
                  <UsersIcon className="h-5 w-5 text-warning" />
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-0.5 text-[10px] font-bold text-white">
                    {pendingJoinRequestsCount}
                  </span>
                </div>
                <span className="text-center text-[11px] font-medium leading-tight text-text-secondary">
                  Yêu cầu vào
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ── Sections ── */}
        <div className="space-y-2 px-3 pb-6">

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
          <SharedResourcesPreview conversationId={conversation.id} />

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
                                · {new Date(msg.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
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

export default GroupInfo;

// Re-export for convenience
export type { GroupInfoProps };
