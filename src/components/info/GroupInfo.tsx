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
} from "@heroicons/react/24/outline";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit01Icon, Pin02Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "../common/Avatar";
import {
  ConfirmDialog,
  DirectorySkeleton,
  Input,
  toast,
} from "../ui";
import type { Conversation, UserSummary } from "../../types";
import { RoomMemberRole, UserStatus } from "../../types";
import { useChatStore, useGroupStore } from "../../stores";
import type { InviteLinkItem, JoinRequestItem } from "../../stores/groupStore";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { resolveConversationId } from "../../lib/conversationIdentity";
import { chatApi } from "../../features/chat/api/chatApi";
import uploadClient from "../../services/uploadClient";
import { getConversationByIdUseCase } from "../../features/chat/usecases/getConversationById";
import { updateConversationUseCase } from "../../features/chat/usecases/updateConversation";
import {
  canAddGroupMembers,
  canLeaveGroup,
  canRemoveGroupMember,
  canRenameGroup,
  canToggleAdminRole,
} from "../../features/chat/permissions/groupPermissions";
import { createGroupInviteLinkUseCase } from "../../features/chat/usecases/createGroupInviteLink";
import { revokeGroupInviteLinkUseCase } from "../../features/chat/usecases/revokeGroupInviteLink";
import { resolveGroupJoinRequestUseCase } from "../../features/chat/usecases/resolveGroupJoinRequest";
import { transferOwnershipUseCase } from "../../features/chat/usecases/transferOwnership";
import { deleteGroupUseCase } from "../../features/chat/usecases/deleteGroup";
import { banMemberUseCase } from "../../features/chat/usecases/manageMemberRestrictions";
import { getUserDisplayName } from "../../utils/messageHelpers";

import {
  AddMemberModal,
  MembersList,
  RemoveMemberModal,
  BanMemberModal,
  TransferOwnershipModal,
  DeleteGroupModal,
} from "../../features/chat/components/group-members";
import { SharedResourcesPreview } from "./shared-resources/SharedResourcesPreview";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupInfoProps {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
  className?: string;
}

type GroupMemberRole =
  | RoomMemberRole.OWNER
  | RoomMemberRole.ADMIN
  | RoomMemberRole.MEMBER;

const EMPTY_INVITE_LINKS: InviteLinkItem[] = [];
const EMPTY_JOIN_REQUESTS: JoinRequestItem[] = [];

interface GroupMember {
  id: string;
  username: string;
  displayName?: string;
  fullNameFromHR?: string;
  full_name_from_hr?: string;
  employeeCode?: string;
  employee_code?: string;
  avatar?: string;
  status?: UserSummary["status"];
  role: GroupMemberRole;
}

type PendingGroupConfirm =
  | { type: "remove-member"; member: GroupMember }
  | { type: "leave-group" }
  | { type: "transfer-ownership"; member: GroupMember }
  | { type: "delete-group" }
  | { type: "ban-member"; member: GroupMember }
  | null;

type GroupAvatarUploadStage =
  | "idle"
  | "validating"
  | "reserving"
  | "uploading"
  | "completing"
  | "attaching"
  | "success"
  | "error";

type ModalMemberTarget = { memberId: string; memberName: string } | null;

const ROLE_PRIORITY: Record<GroupMemberRole, number> = {
  [RoomMemberRole.OWNER]: 0,
  [RoomMemberRole.ADMIN]: 1,
  [RoomMemberRole.MEMBER]: 2,
};

const MEMBER_PREVIEW_COUNT = 8;

const VALID_ROLES = new Set<string>([
  RoomMemberRole.OWNER,
  RoomMemberRole.ADMIN,
  RoomMemberRole.MEMBER,
]);
const VALID_STATUSES = new Set<string>(Object.values(UserStatus));
const ALLOWED_GROUP_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const asStatus = (value: unknown): UserSummary["status"] | undefined => {
  const status = asString(value);
  if (!status) return undefined;
  return VALID_STATUSES.has(status)
    ? (status as UserSummary["status"])
    : undefined;
};

const revokeBlobUrl = (value: string | null) => {
  if (value?.startsWith("blob:")) URL.revokeObjectURL(value);
};

const resolveGroupAvatarStageLabel = (
  stage: GroupAvatarUploadStage,
  progress: number,
) => {
  switch (stage) {
    case "validating": return "Đang kiểm tra ảnh";
    case "reserving": return "Đang chuẩn bị tải lên";
    case "uploading": return progress > 0 ? `Đang tải lên ${progress}%` : "Đang tải lên";
    case "completing": return "Đang xác minh ảnh";
    case "attaching": return "Đang áp dụng ảnh";
    case "success": return "Cập nhật ảnh đại diện thành công";
    case "error": return "Không thể cập nhật ảnh đại diện";
    default: return null;
  }
};

const extractMemberRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload)) {
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.members)) return payload.members;
    if (isRecord(payload.data)) {
      const nested = payload.data;
      if (Array.isArray(nested.data)) return nested.data;
      if (Array.isArray(nested.members)) return nested.members;
    }
  }
  return [];
};

const normalizeMember = (raw: unknown): GroupMember | null => {
  if (!isRecord(raw)) return null;
  const user = isRecord(raw.user) ? raw.user : null;
  const id =
    asString(raw.userId) ??
    asString(raw.user_id) ??
    asString(user?.id) ??
    asString(raw.id);
  if (!id) return null;
  const roleRaw = asString(raw.role);
  const role = VALID_ROLES.has(roleRaw ?? "")
    ? (roleRaw as GroupMemberRole)
    : RoomMemberRole.MEMBER;
  const username =
    asString(raw.username) ??
    asString(user?.username) ??
    asString(raw.nickname) ??
    id;
  return {
    id,
    username,
    displayName: asString(raw.displayName) ?? asString(user?.displayName) ?? asString(raw.nickname),
    fullNameFromHR: asString(raw.fullNameFromHR) ?? asString(raw.full_name_from_hr) ?? asString(user?.fullNameFromHR) ?? asString(user?.full_name_from_hr),
    full_name_from_hr: asString(raw.full_name_from_hr) ?? asString(user?.full_name_from_hr) ?? asString(raw.fullNameFromHR) ?? asString(user?.fullNameFromHR),
    employeeCode: asString(raw.employeeCode) ?? asString(raw.employee_code) ?? asString(user?.employeeCode) ?? asString(user?.employee_code),
    employee_code: asString(raw.employee_code) ?? asString(user?.employee_code) ?? asString(raw.employeeCode) ?? asString(user?.employeeCode),
    avatar: asString(raw.avatar) ?? asString(user?.avatar),
    status: asStatus(raw.status) ?? asStatus(user?.status),
    role,
  };
};

const resolveMemberName = (member: Partial<UserSummary> | null | undefined): string =>
  getUserDisplayName(member, { allowTechnicalFallback: true }) || "";

const areMemberMapsEqual = (
  previous: Record<string, GroupMember>,
  next: Record<string, GroupMember>,
): boolean => {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return false;
  for (const key of previousKeys) {
    const prev = previous[key];
    const nextMember = next[key];
    if (!nextMember) return false;
    if (prev.id !== nextMember.id || prev.username !== nextMember.username ||
        prev.displayName !== nextMember.displayName || prev.avatar !== nextMember.avatar ||
        prev.status !== nextMember.status || prev.role !== nextMember.role) return false;
  }
  return true;
};

// ─── Sub-components ───────────────────────────────────────────────────────────



interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  badge,
  defaultOpen = true,
  danger = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = React.useId();

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-2xl border bg-surface",
        danger ? "border-red-200 bg-red-50/30" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={clsx(
          "flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors",
          danger ? "hover:bg-red-50/60" : "hover:bg-surface-hover",
        )}
        aria-expanded={open}
        aria-controls={sectionId}
      >
        <span className={clsx("shrink-0", danger ? "text-red-600" : "text-text-muted")}>
          {icon}
        </span>
        <span
          className={clsx(
            "flex-1 text-sm font-medium",
            danger ? "text-red-600" : "text-text-primary",
          )}
        >
          {title}
        </span>
        {badge}
        <ChevronDownIcon
          className={clsx(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            danger ? "text-red-600" : "text-text-muted",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={sectionId}
          className={clsx(
            "border-t",
            danger ? "border-red-200" : "border-border",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const GroupInfo: React.FC<GroupInfoProps> = ({
  conversation,
  currentUserId,
  onClose,
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
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersByUserId, setMembersByUserId] = useState<Record<string, GroupMember>>({});
  const [actingMemberId, setActingMemberId] = useState<string | null>(null);
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(conversation.name || "");
  const [showCreateInviteForm, setShowCreateInviteForm] = useState(false);
  const [inviteNameDraft, setInviteNameDraft] = useState("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingGroupConfirm>(null);
  const [isConfirmActionPending, setIsConfirmActionPending] = useState(false);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(null);
  const [groupAvatarStage, setGroupAvatarStage] = useState<GroupAvatarUploadStage>("idle");
  const [groupAvatarProgress, setGroupAvatarProgress] = useState(0);
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

  // UI quick-action toggles (local state)
  const [isMuted, setIsMuted] = useState(false);
  const [isPinned, setIsPinned] = useState(() => Boolean(conversation.isPinned));

  // Security settings local state

  const updateConversation = useChatStore((state) => state.updateConversation);
  const removeConversation = useChatStore((state) => state.removeConversation);
  const loadMembersFailedMessage = t("profile:toast.loadMembersFailed");

  const handleTogglePin = useCallback(async () => {
    const next = !isPinned;
    setIsPinned(next);
    updateConversation(conversation.id, { isPinned: next });
    try {
      await updateConversationUseCase(conversation.id, { isPinned: next });
    } catch {
      setIsPinned(!next);
      updateConversation(conversation.id, { isPinned: !next });
      toast.error(next ? "Ghim hội thoại thất bại" : "Bỏ ghim hội thoại thất bại");
    }
  }, [isPinned, conversation.id, updateConversation]);

  const inviteLinks = useGroupStore(
    (state) => state.inviteLinksByConversation[conversation.id] ?? EMPTY_INVITE_LINKS,
  );
  const joinRequests = useGroupStore(
    (state) => state.joinRequestsByConversation[conversation.id] ?? EMPTY_JOIN_REQUESTS,
  );
  const memberListVersion = useGroupStore(
    (state) => state.memberListVersionByConversation[conversation.id] || 0,
  );
  const upsertInviteLink = useGroupStore((state) => state.upsertInviteLink);
  const setInviteLinks = useGroupStore((state) => state.setInviteLinks);
  const removeInviteLink = useGroupStore((state) => state.removeInviteLink);
  const setJoinRequests = useGroupStore((state) => state.setJoinRequests);
  const markJoinRequestResolved = useGroupStore((state) => state.markJoinRequestResolved);
  const removeJoinRequest = useGroupStore((state) => state.removeJoinRequest);

  const createdBy = React.useMemo(() => conversation.createdBy, [conversation]);

  const members = React.useMemo<GroupMember[]>(() => {
    const merged = new Map<string, GroupMember>();
    participants.forEach((participant) => {
      const existingMember = membersByUserId[participant.id];
      merged.set(participant.id, {
        id: participant.id,
        username: participant.username,
        displayName: participant.displayName,
        avatar: participant.avatar,
        status: participant.status,
        role: existingMember?.role || (participant.id === createdBy ? RoomMemberRole.OWNER : RoomMemberRole.MEMBER),
      });
    });
    Object.values(membersByUserId).forEach((member) => {
      if (!merged.has(member.id)) merged.set(member.id, member);
    });
    return Array.from(merged.values()).sort((a, b) => {
      const roleDiff = ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
      if (roleDiff !== 0) return roleDiff;
      return resolveMemberName(a).toLowerCase().localeCompare(resolveMemberName(b).toLowerCase());
    });
  }, [createdBy, membersByUserId, participants]);

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

  const fetchMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const response = await chatApi.group.getMembers(conversation.id, 1, 200);
      const payload = unwrapApiSuccess(response);
      const rows = extractMemberRows(payload);
      const nextMembers = rows.map((row) => normalizeMember(row)).filter((m): m is GroupMember => m !== null);
      const nextById: Record<string, GroupMember> = {};
      nextMembers.forEach((m) => { nextById[m.id] = m; });
      setMembersByUserId((prev) => areMemberMapsEqual(prev, nextById) ? prev : nextById);
    } catch (error) {
      toast.error(extractApiError(error).message || loadMembersFailedMessage);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [conversation.id, loadMembersFailedMessage]);

  const refreshConversation = useCallback(async () => {
    const response = await getConversationByIdUseCase(conversation.id);
    updateConversation(conversation.id, unwrapApiSuccess(response));
  }, [conversation.id, updateConversation]);

  const refreshGroupState = useCallback(async () => {
    await Promise.all([refreshConversation(), fetchMembers()]);
  }, [fetchMembers, refreshConversation]);

  const handleGroupAvatarChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = "";
      if (!file) { setGroupAvatarStage("idle"); return; }
      const mimeType = file.type.trim().toLowerCase();
      setGroupAvatarStage("validating");
      if (!mimeType || !ALLOWED_GROUP_AVATAR_TYPES.has(mimeType)) {
        setGroupAvatarStage("error");
        toast.error(t("profile:settings.upload.unsupportedType", { defaultValue: "Loại ảnh không được hỗ trợ" }));
        return;
      }
      setGroupAvatarProgress(0);
      setGroupAvatarPreview((current) => { revokeBlobUrl(current); return URL.createObjectURL(file); });
      try {
        uploadClient.validateUpload(file, "group_avatar");
        setGroupAvatarStage("reserving");
        const reserved = await uploadClient.reserveUpload({ purpose: "group_avatar", groupId: conversation.id, filename: file.name, mimeType, sizeBytes: file.size });
        setGroupAvatarStage("uploading");
        await uploadClient.uploadToSignedUrl({ signedUrl: reserved.uploadUrl, method: reserved.uploadMethod || "PUT", headers: { ...(reserved.uploadHeaders || {}), "Content-Type": mimeType }, file, onProgress: (p) => setGroupAvatarProgress(p) });
        setGroupAvatarStage("completing");
        const completed = await uploadClient.completeUpload({ uploadId: reserved.uploadId, conversationId: conversation.id, objectKey: reserved.objectKey });
        const fileId = completed.attachment?.id;
        if (!fileId) throw new Error("Group avatar upload completed without fileId");
        setGroupAvatarStage("attaching");
        await uploadClient.attachToGroupAvatar({ groupId: conversation.id, fileId, uploadId: completed.uploadId });
        await refreshGroupState();
        setGroupAvatarStage("success");
        setGroupAvatarProgress(100);
        setGroupAvatarPreview((current) => { revokeBlobUrl(current); return null; });
        toast.success(t("profile:groupInfo.avatarUpdated", { defaultValue: "Cập nhật ảnh đại diện thành công" }));
      } catch (error) {
        setGroupAvatarStage("error");
        setGroupAvatarPreview((current) => { revokeBlobUrl(current); return null; });
        toast.error(extractApiError(error).message || t("profile:groupInfo.avatarUpdateFailed", { defaultValue: "Không thể cập nhật ảnh đại diện" }));
      }
    },
    [conversation.id, refreshGroupState, t],
  );


  React.useEffect(() => {
    setGroupNameDraft(conversation.name || "");
    setIsRenamingGroup(false);
    setShowAddMember(false);
    setGroupAvatarStage("idle");
    setGroupAvatarProgress(0);
    setGroupAvatarPreview((current) => { revokeBlobUrl(current); return null; });
    setMemberSearch("");
    setMemberFilterRole("all");
    setMembersShowAll(false);
  }, [conversation.id, conversation.name]);

  React.useEffect(() => () => { revokeBlobUrl(groupAvatarPreview); }, [groupAvatarPreview]);

  React.useEffect(() => { void fetchMembers(); }, [fetchMembers, memberListVersion]);

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
              items.push({
                id: item.id,
                conversationId: resolveConversationId(item, { source: "GroupInfo.inviteLinks" }) ?? conversation.id,
                name: asString(item.name),
                inviteUrl: asString(item.inviteUrl),
                token: asString(item.token),
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

  const handleRenameGroup = useCallback(async () => {
    const nextName = groupNameDraft.trim();
    if (!nextName) { toast.error(t("profile:toast.groupNameRequired")); return; }
    if (nextName === (conversation.name || "").trim()) { setIsRenamingGroup(false); return; }
    setIsSubmitting(true);
    try {
      await chatApi.group.updateSettings(conversation.id, { title: nextName });
      await refreshGroupState();
      setIsRenamingGroup(false);
      toast.success(t("profile:toast.groupRenamed"));
    } catch (error) {
      toast.error(extractApiError(error).message || t("profile:toast.groupRenameFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [conversation.id, conversation.name, groupNameDraft, refreshGroupState, t]);

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
      setPendingConfirm({ type: "remove-member", member });
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
        setPendingConfirm(null);
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
    setPendingConfirm({ type: "leave-group" });
  }, [canLeaveCurrentGroup, t]);

  const confirmLeaveGroup = useCallback(async () => {
    setIsSubmitting(true);
    setIsConfirmActionPending(true);
    try {
      await chatApi.group.leaveGroup(conversation.id);
      removeConversation(conversation.id);
      setPendingConfirm(null);
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
      setPendingConfirm({ type: "transfer-ownership", member });
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
        setPendingConfirm(null);
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
      setPendingConfirm(null);
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
      setPendingConfirm({ type: "ban-member", member });
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
        setPendingConfirm(null);
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

  const handleCreateInviteLink = useCallback(async () => {
    if (!isAdmin || isCreatingInvite) return;
    setIsCreatingInvite(true);
    try {
      const response = await createGroupInviteLinkUseCase({ conversationId: conversation.id, name: inviteNameDraft.trim() || undefined });
      const payload = unwrapApiSuccess(response) as Record<string, unknown>;
      const id = typeof payload.id === "string" ? payload.id : "";
      if (!id) throw new Error("Invite link id missing");
      upsertInviteLink(conversation.id, {
        id,
        conversationId: conversation.id,
        name: typeof payload.name === "string" ? payload.name : undefined,
        inviteUrl: typeof payload.inviteUrl === "string" ? payload.inviteUrl : undefined,
        token: typeof payload.token === "string" ? payload.token : undefined,
        tokenPreview: typeof payload.tokenPreview === "string" ? payload.tokenPreview : undefined,
        usageCount: typeof payload.usageCount === "number" ? payload.usageCount : 0,
        usageLimit: typeof payload.usageLimit === "number" ? payload.usageLimit : null,
        expireAt: typeof payload.expireAt === "string" ? payload.expireAt : null,
        revokedAt: typeof payload.revokedAt === "string" ? payload.revokedAt : null,
        createdAt: typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString(),
      });
      const copyValue = (typeof payload.inviteUrl === "string" && payload.inviteUrl) || (typeof payload.token === "string" && payload.token) || "";
      if (copyValue && typeof navigator !== "undefined") void navigator.clipboard.writeText(copyValue);
      setShowCreateInviteForm(false);
      setInviteNameDraft("");
      toast.success(t("profile:groupInfo.invite.created"));
    } catch (error) {
      toast.error(extractApiError(error).message || t("profile:groupInfo.invite.createFailed"));
    } finally {
      setIsCreatingInvite(false);
    }
  }, [conversation.id, inviteNameDraft, isAdmin, isCreatingInvite, t, upsertInviteLink]);

  const handleCopyInviteLink = useCallback(async (value?: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("profile:groupInfo.invite.copied"));
    } catch {
      toast.error(t("profile:groupInfo.invite.copyFailed"));
    }
  }, [t]);

  const handleRevokeInvite = useCallback(
    async (linkId: string) => {
      if (!isAdmin || !linkId) return;
      setRevokingInviteId(linkId);
      try {
        await revokeGroupInviteLinkUseCase(conversation.id, linkId);
        removeInviteLink(conversation.id, linkId);
        toast.success(t("profile:groupInfo.invite.revoked"));
      } catch (error) {
        toast.error(extractApiError(error).message || t("profile:groupInfo.invite.revokeFailed"));
      } finally {
        setRevokingInviteId(null);
      }
    },
    [conversation.id, isAdmin, removeInviteLink, t],
  );

  const handleDeleteInviteLink = useCallback(
    async (linkId: string) => {
      if (!isAdmin || !linkId) return;
      try {
        await revokeGroupInviteLinkUseCase(conversation.id, linkId);
      } catch { /* already removed or unauthorized — remove locally anyway */ }
      removeInviteLink(conversation.id, linkId);
    },
    [conversation.id, isAdmin, removeInviteLink],
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

  const pendingConfirmMember =
    pendingConfirm?.type === "remove-member" || pendingConfirm?.type === "transfer-ownership"
      ? pendingConfirm.member : null;
  const pendingConfirmMemberName = pendingConfirmMember
    ? resolveMemberName(pendingConfirmMember) || pendingConfirmMember.id : "";
  const pendingJoinRequestsCount = joinRequests.filter((r) => r.status === "pending").length;

  const confirmTitle =
    pendingConfirm?.type === "leave-group" ? t("profile:groupInfo.leaveGroup")
    : pendingConfirm?.type === "transfer-ownership" ? t("profile:groupInfo.transferOwnership")
    : pendingConfirm?.type === "delete-group" ? t("profile:groupInfo.deleteGroup")
    : pendingConfirm?.type === "ban-member" ? t("profile:groupInfo.banMember")
    : t("profile:groupInfo.actions.removeMember", { defaultValue: "Xoá thành viên" });

  const confirmMessage =
    pendingConfirm?.type === "leave-group" ? t("profile:groupInfo.leaveConfirm")
    : pendingConfirm?.type === "transfer-ownership" ? t("profile:groupInfo.transferOwnershipConfirm", { name: pendingConfirmMemberName })
    : pendingConfirm?.type === "delete-group" ? t("profile:groupInfo.deleteGroupConfirm")
    : pendingConfirm?.type === "ban-member" ? t("profile:groupInfo.banMemberConfirm", { name: pendingConfirmMemberName })
    : t("profile:groupInfo.removeMemberConfirm", { name: pendingConfirmMemberName });

  const confirmText =
    pendingConfirm?.type === "leave-group" ? t("profile:groupInfo.leaveGroup")
    : pendingConfirm?.type === "delete-group" ? t("profile:groupInfo.deleteGroup")
    : t("common:actions.remove", { defaultValue: "Xoá" });

  // ─── Render ───────────────────────────────────────────────────────────────────

  const memberFilterTabs: { key: "all" | "leadership"; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "leadership", label: "Trưởng nhóm" },
  ];

  return (
    <div className={clsx("flex h-full flex-col bg-surface", className)}>

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur-sm">
        <h3 className="text-sm font-bold text-text-primary">
          {t("profile:groupInfo.title")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={t("common:actions.close")}
        >
          <XMarkIcon className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Hero Section ── */}
        <div className="flex flex-col items-center bg-surface px-5 pb-5 pt-6 text-center">
          {/* Avatar */}
          <div className="relative mb-4">
            <div className="overflow-hidden rounded-full">
              {groupAvatarPreview || conversation.avatar ? (
                <Avatar
                  src={groupAvatarPreview || conversation.avatar}
                  alt={conversation.name}
                  size="xl"
                />
              ) : (
                <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-[#1976D2] to-[#3B82F6] text-2xl font-bold text-white">
                  {(conversation.name || "G").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            {isAdmin && !isRenamingGroup && (
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isSubmitting || groupAvatarStage === "uploading"}
                className="absolute bottom-0.5 right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-overlay shadow-xs transition-colors hover:bg-surface-hover disabled:opacity-50"
                aria-label={t("profile:groupInfo.changeAvatar", { defaultValue: "Đổi ảnh nhóm" })}
              >
                <CameraIcon className="h-3 w-3 text-text-secondary" />
              </button>
            )}
          </div>

          {/* Group Name */}
          {isRenamingGroup ? (
            <div className="w-full max-w-[240px] space-y-2">
              <Input
                type="text"
                value={groupNameDraft}
                onChange={(e) => setGroupNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void handleRenameGroup(); }
                  if (e.key === "Escape") { setIsRenamingGroup(false); setGroupNameDraft(conversation.name || ""); }
                }}
                placeholder={t("profile:groupInfo.renamePlaceholder")}
                disabled={isSubmitting}
              />
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => { setIsRenamingGroup(false); setGroupNameDraft(conversation.name || ""); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover"
                >
                  {t("common:actions.cancel")}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleRenameGroup()}
                  className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#1976D2] to-[#1565C0] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
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
                  onClick={() => setIsRenamingGroup(true)}
                  disabled={isSubmitting}
                  className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={t("profile:groupInfo.renameGroup")}
                >
                  <HugeiconsIcon icon={PencilEdit01Icon} className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
          )}

          {/* Subtitle */}
          <p className="mt-1 text-xs text-text-muted">
            {participantCount} thành viên · Nhóm nội bộ
          </p>

          {/* Avatar upload status */}
          {groupAvatarStage !== "idle" && (
            <p className="mt-1 text-[11px] text-text-muted">
              {resolveGroupAvatarStageLabel(groupAvatarStage, groupAvatarProgress)}
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
                <HugeiconsIcon icon={Pin02Icon} size={20} color="currentColor" strokeWidth={1.5} className={isPinned ? "text-text-secondary" : "text-primary"} />
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
                      {!showCreateInviteForm && (
                        <button
                          type="button"
                          onClick={() => setShowCreateInviteForm(true)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                        >
                          <LinkIcon className="h-3 w-3" />
                          {t("profile:groupInfo.invite.create")}
                        </button>
                      )}
                    </div>

                    {showCreateInviteForm && (
                      <div className="space-y-2 rounded-xl border border-border p-3">
                        <Input
                          type="text"
                          value={inviteNameDraft}
                          onChange={(e) => setInviteNameDraft(e.target.value)}
                          placeholder={t("profile:groupInfo.invite.namePlaceholder")}
                          disabled={isCreatingInvite}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isCreatingInvite}
                            onClick={() => { setShowCreateInviteForm(false); setInviteNameDraft(""); }}
                            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
                          >
                            {t("common:actions.cancel")}
                          </button>
                          <button
                            type="button"
                            disabled={isCreatingInvite}
                            onClick={() => void handleCreateInviteLink()}
                            className="rounded-md bg-gradient-to-r from-[#1976D2] to-[#1565C0] px-3 py-1.5 text-sm text-white hover:brightness-105 disabled:opacity-60"
                          >
                            {isCreatingInvite ? t("common:loading.processing") : t("profile:groupInfo.invite.create")}
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
                          const shareValue = link.inviteUrl || link.token || link.tokenPreview || "";
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
                                  onClick={() => void handleCopyInviteLink(shareValue)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                                >
                                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                  {t("common:actions.copy")}
                                </button>
                                {!isRevoked && (
                                  <button
                                    type="button"
                                    disabled={revokingInviteId === link.id}
                                    onClick={() => void handleRevokeInvite(link.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                                  >
                                    <NoSymbolIcon className="h-3.5 w-3.5" />
                                    {revokingInviteId === link.id ? t("common:loading.processing") : t("profile:groupInfo.invite.revoke")}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteInviteLink(link.id)}
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
                                  className="rounded-md bg-gradient-to-r from-[#1976D2] to-[#1565C0] px-3 py-1.5 text-xs text-white hover:brightness-105 disabled:opacity-60"
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
        onChange={(e) => { void handleGroupAvatarChange(e); }}
      />

      {/* Confirmation modals */}
      <ConfirmDialog
        isOpen={pendingConfirm !== null}
        onClose={() => { if (!isConfirmActionPending) setPendingConfirm(null); }}
        onConfirm={() => {
          if (pendingConfirm?.type === "remove-member") { void confirmRemoveMember(pendingConfirm.member); return; }
          if (pendingConfirm?.type === "leave-group") { void confirmLeaveGroup(); return; }
          if (pendingConfirm?.type === "transfer-ownership") { void confirmTransferOwnership(pendingConfirm.member); return; }
          if (pendingConfirm?.type === "delete-group") { void confirmDeleteGroup(); return; }
          if (pendingConfirm?.type === "ban-member") { void confirmBanMember(pendingConfirm.member); }
        }}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmText}
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
    </div>
  );
};

export default GroupInfo;

// Re-export for convenience
export type { GroupInfoProps };
