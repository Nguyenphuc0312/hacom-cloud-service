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
} from "@heroicons/react/24/outline";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "../common/Avatar";
import { UserSearchResultItem } from "../common/UserSearchResultItem";
import {
  ConfirmDialog,
  DirectorySkeleton,
  Input,
  toast,
} from "../ui";
import { InfoMenuRow } from "./InfoMenuRow";
import type { Conversation, UserSummary } from "../../types";
import { RoomMemberRole, UserStatus } from "../../types";
import { useChatStore, useGroupStore } from "../../stores";
import type { InviteLinkItem, JoinRequestItem } from "../../stores/groupStore";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { resolveConversationId } from "../../lib/conversationIdentity";
import { chatApi } from "../../features/chat/api/chatApi";
import uploadClient from "../../services/uploadClient";
import { getConversationByIdUseCase } from "../../features/chat/usecases/getConversationById";
import {
  buildUserSearchSecondaryText,
  isGroupMemberEligible,
  useChatUserSearch,
} from "../../features/chat/hooks/useChatUserSearch";
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

// New group members components
import {
  MembersList,
  RemoveMemberModal,
  BanMemberModal,
  TransferOwnershipModal,
  DeleteGroupModal,
} from "../../features/chat/components/group-members";
import { SharedResourcesPreview } from "./shared-resources/SharedResourcesPreview";

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

// Modal states for new confirmation modals
type ModalMemberTarget = { memberId: string; memberName: string } | null;

const ROLE_PRIORITY: Record<GroupMemberRole, number> = {
  [RoomMemberRole.OWNER]: 0,
  [RoomMemberRole.ADMIN]: 1,
  [RoomMemberRole.MEMBER]: 2,
};

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
  if (value?.startsWith("blob:")) {
    URL.revokeObjectURL(value);
  }
};

const resolveGroupAvatarStageLabel = (
  stage: GroupAvatarUploadStage,
  progress: number,
) => {
  switch (stage) {
    case "validating":
      return "Validating group avatar";
    case "reserving":
      return "Preparing secure avatar upload";
    case "uploading":
      return progress > 0
        ? `Uploading group avatar ${progress}%`
        : "Uploading group avatar";
    case "completing":
      return "Verifying group avatar";
    case "attaching":
      return "Applying group avatar";
    case "success":
      return "Group avatar updated";
    case "error":
      return "Group avatar update failed";
    default:
      return null;
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
    displayName:
      asString(raw.displayName) ??
      asString(user?.displayName) ??
      asString(raw.nickname),
    fullNameFromHR:
      asString(raw.fullNameFromHR) ??
      asString(raw.full_name_from_hr) ??
      asString(user?.fullNameFromHR) ??
      asString(user?.full_name_from_hr),
    full_name_from_hr:
      asString(raw.full_name_from_hr) ??
      asString(user?.full_name_from_hr) ??
      asString(raw.fullNameFromHR) ??
      asString(user?.fullNameFromHR),
    employeeCode:
      asString(raw.employeeCode) ??
      asString(raw.employee_code) ??
      asString(user?.employeeCode) ??
      asString(user?.employee_code),
    employee_code:
      asString(raw.employee_code) ??
      asString(user?.employee_code) ??
      asString(raw.employeeCode) ??
      asString(user?.employeeCode),
    avatar: asString(raw.avatar) ?? asString(user?.avatar),
    status: asStatus(raw.status) ?? asStatus(user?.status),
    role,
  };
};

const resolveMemberName = (
  member: Partial<UserSummary> | null | undefined,
): string => {
  return (
    getUserDisplayName(member, {
      allowTechnicalFallback: true,
    }) || ""
  );
};

const areMemberMapsEqual = (
  previous: Record<string, GroupMember>,
  next: Record<string, GroupMember>,
): boolean => {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    const previousMember = previous[key];
    const nextMember = next[key];
    if (!nextMember) return false;
    if (
      previousMember.id !== nextMember.id ||
      previousMember.username !== nextMember.username ||
      previousMember.displayName !== nextMember.displayName ||
      previousMember.avatar !== nextMember.avatar ||
      previousMember.status !== nextMember.status ||
      previousMember.role !== nextMember.role
    ) {
      return false;
    }
  }

  return true;
};

export const GroupInfo: React.FC<GroupInfoProps> = ({
  conversation,
  currentUserId,
  onClose,
  className,
}) => {
  const { t } = useTranslation(["profile", "common"]);
  const blockedOwnerLeaveTitle = t("profile:groupInfo.leaveBlockedOwner", {
    defaultValue: "Transfer ownership before leaving this group.",
  });

  const participants = React.useMemo(
    () =>
      Array.isArray(conversation.participants) ? conversation.participants : [],
    [conversation.participants],
  );

  const navigate = useNavigate();
  const [membersExpanded, setMembersExpanded] = useState(true);
  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersByUserId, setMembersByUserId] = useState<
    Record<string, GroupMember>
  >({});
  const [actingMemberId, setActingMemberId] = useState<string | null>(null);
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(conversation.name || "");
  const [showCreateInviteForm, setShowCreateInviteForm] = useState(false);
  const [inviteNameDraft, setInviteNameDraft] = useState("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(
    null,
  );
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingGroupConfirm>(null);
  const [isConfirmActionPending, setIsConfirmActionPending] = useState(false);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(
    null,
  );
  const [groupAvatarStage, setGroupAvatarStage] =
    useState<GroupAvatarUploadStage>("idle");
  const [groupAvatarProgress, setGroupAvatarProgress] = useState(0);
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);

  // New modal states for refined confirmation experience
  const [removeMemberTarget, setRemoveMemberTarget] = useState<ModalMemberTarget>(null);
  const [banMemberTarget, setBanMemberTarget] = useState<ModalMemberTarget>(null);
  const [transferOwnershipTarget, setTransferOwnershipTarget] = useState<ModalMemberTarget>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(false);

  const updateConversation = useChatStore((state) => state.updateConversation);
  const removeConversation = useChatStore((state) => state.removeConversation);
  const loadMembersFailedMessage = t("profile:toast.loadMembersFailed");
  const inviteLinks = useGroupStore(
    (state) =>
      state.inviteLinksByConversation[conversation.id] ?? EMPTY_INVITE_LINKS,
  );
  const joinRequests = useGroupStore(
    (state) =>
      state.joinRequestsByConversation[conversation.id] ?? EMPTY_JOIN_REQUESTS,
  );
  const memberListVersion = useGroupStore(
    (state) => state.memberListVersionByConversation[conversation.id] || 0,
  );
  const upsertInviteLink = useGroupStore((state) => state.upsertInviteLink);
  const setInviteLinks = useGroupStore((state) => state.setInviteLinks);
  const markInviteLinkRevoked = useGroupStore(
    (state) => state.markInviteLinkRevoked,
  );
  const setJoinRequests = useGroupStore((state) => state.setJoinRequests);
  const markJoinRequestResolved = useGroupStore(
    (state) => state.markJoinRequestResolved,
  );
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
        role:
          existingMember?.role ||
          (participant.id === createdBy
            ? RoomMemberRole.OWNER
            : RoomMemberRole.MEMBER),
      });
    });

    Object.values(membersByUserId).forEach((member) => {
      if (!merged.has(member.id)) {
        merged.set(member.id, member);
      }
    });

    return Array.from(merged.values()).sort((a, b) => {
      const roleDiff = ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
      if (roleDiff !== 0) return roleDiff;

      const aName = resolveMemberName(a).toLowerCase();
      const bName = resolveMemberName(b).toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [createdBy, membersByUserId, participants]);

  const activeOwnerCount = React.useMemo(
    () =>
      members.filter((member) => member.role === RoomMemberRole.OWNER).length ||
      (createdBy ? 1 : 0),
    [createdBy, members],
  );
  const {
    results: searchResults,
    isLoading: isSearching,
    errorMessage: searchErrorMessage,
    debouncedQuery,
  } = useChatUserSearch(searchQuery, {
    enabled: showAddMember,
    limit: 10,
    excludeUserIds: [
      currentUserId,
      ...members.map((member) => member.id),
      ...participants.map((participant) => participant.id),
    ],
  });

  const currentUserRole =
    membersByUserId[currentUserId]?.role ||
    (currentUserId === createdBy
      ? RoomMemberRole.OWNER
      : RoomMemberRole.MEMBER);
  const groupCapabilities = conversation.permissions ?? null;
  const isAdmin = canRenameGroup(currentUserRole, groupCapabilities);
  const canAddMembers = canAddGroupMembers(currentUserRole, groupCapabilities);
  const canLeaveCurrentGroup = canLeaveGroup(
    currentUserRole,
    activeOwnerCount,
    groupCapabilities,
  );
  const participantCount =
    conversation.participantCount ??
    (members.length > 0 ? members.length : participants.length);

  const canRemoveMember = useCallback(
    (member: GroupMember) => {
      return canRemoveGroupMember({
        actorRole: currentUserRole,
        actorUserId: currentUserId,
        targetRole: member.role,
        targetUserId: member.id,
        capabilities: groupCapabilities,
      });
    },
    [currentUserId, currentUserRole, groupCapabilities],
  );

  const fetchMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const response = await chatApi.group.getMembers(conversation.id, 1, 200);
      const payload = unwrapApiSuccess(response);
      const rows = extractMemberRows(payload);
      const nextMembers = rows
        .map((row) => normalizeMember(row))
        .filter((member): member is GroupMember => member !== null);

      const nextById: Record<string, GroupMember> = {};
      nextMembers.forEach((member) => {
        nextById[member.id] = member;
      });
      setMembersByUserId((previous) =>
        areMemberMapsEqual(previous, nextById) ? previous : nextById,
      );
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || loadMembersFailedMessage);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [conversation.id, loadMembersFailedMessage]);

  const refreshConversation = useCallback(async () => {
    const response = await getConversationByIdUseCase(conversation.id);
    const refreshedConversation = unwrapApiSuccess(response);
    updateConversation(conversation.id, refreshedConversation);
  }, [conversation.id, updateConversation]);

  const refreshGroupState = useCallback(async () => {
    await Promise.all([refreshConversation(), fetchMembers()]);
  }, [fetchMembers, refreshConversation]);

  const handleGroupAvatarChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = "";

      if (!file) {
        setGroupAvatarStage("idle");
        return;
      }

      const mimeType = file.type.trim().toLowerCase();
      setGroupAvatarStage("validating");
      if (!mimeType || !ALLOWED_GROUP_AVATAR_TYPES.has(mimeType)) {
        setGroupAvatarStage("error");
        toast.error(
          t("profile:settings.upload.unsupportedType", {
            defaultValue: "Unsupported image type",
          }),
        );
        return;
      }

      setGroupAvatarProgress(0);
      setGroupAvatarPreview((current) => {
        revokeBlobUrl(current);
        return URL.createObjectURL(file);
      });

      try {
        uploadClient.validateUpload(file, "group_avatar");
        setGroupAvatarStage("reserving");
        const reserved = await uploadClient.reserveUpload({
          purpose: "group_avatar",
          groupId: conversation.id,
          filename: file.name,
          mimeType,
          sizeBytes: file.size,
        });
        setGroupAvatarStage("uploading");
        await uploadClient.uploadToSignedUrl({
          signedUrl: reserved.uploadUrl,
          method: reserved.uploadMethod || "PUT",
          headers: {
            ...(reserved.uploadHeaders || {}),
            "Content-Type": mimeType,
          },
          file,
          onProgress: (progress) => setGroupAvatarProgress(progress),
        });
        setGroupAvatarStage("completing");
        const completed = await uploadClient.completeUpload({
          uploadId: reserved.uploadId,
          conversationId: conversation.id,
          objectKey: reserved.objectKey,
        });

        const fileId = completed.attachment?.id; 
        if (!fileId) { 
          throw new Error("Group avatar upload completed without fileId"); 
        } 

        setGroupAvatarStage("attaching"); 
        await uploadClient.attachToGroupAvatar({
          groupId: conversation.id,
          fileId,
          uploadId: completed.uploadId,
        });
        await refreshGroupState(); 
        setGroupAvatarStage("success");
        setGroupAvatarProgress(100);
        setGroupAvatarPreview((current) => {
          revokeBlobUrl(current);
          return null;
        });
        toast.success(
          t("profile:groupInfo.avatarUpdated", {
            defaultValue: "Group avatar updated",
          }),
        );
      } catch (error) {
        const apiError = extractApiError(error);
        setGroupAvatarStage("error");
        setGroupAvatarPreview((current) => {
          revokeBlobUrl(current);
          return null;
        });
        toast.error(
          apiError.message ||
            t("profile:groupInfo.avatarUpdateFailed", {
              defaultValue: "Unable to update group avatar",
            }),
        );
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
    setGroupAvatarPreview((current) => {
      revokeBlobUrl(current);
      return null;
    });
  }, [conversation.id, conversation.name]);

  React.useEffect(
    () => () => {
      revokeBlobUrl(groupAvatarPreview);
    },
    [groupAvatarPreview],
  );

  React.useEffect(() => {
    void fetchMembers();
  }, [fetchMembers, memberListVersion]);

  React.useEffect(() => {
    let cancelled = false;

    if (!isAdmin) {
      setInviteLinks(conversation.id, []);
      setJoinRequests(conversation.id, []);
      return () => {
        cancelled = true;
      };
    }

    const hydrateRealtimeState = async () => {
      try {
        const [inviteLinksResponse, joinRequestsResponse] = await Promise.all([
          chatApi.group.getInviteLinks(conversation.id),
          chatApi.group.getJoinRequests(conversation.id),
        ]);

        if (cancelled) return;

        const inviteLinksPayload = unwrapApiSuccess(inviteLinksResponse);
        const joinRequestsPayload = unwrapApiSuccess(joinRequestsResponse);

        const normalizedInviteLinks: InviteLinkItem[] = Array.isArray(
          inviteLinksPayload,
        )
          ? inviteLinksPayload.reduce<InviteLinkItem[]>((items, item) => {
              if (!isRecord(item) || typeof item.id !== "string") {
                return items;
              }

              items.push({
                id: item.id,
                conversationId:
                  resolveConversationId(item, {
                    source: "GroupInfo.inviteLinks",
                  }) ?? conversation.id,
                name: asString(item.name),
                inviteUrl: asString(item.inviteUrl),
                token: asString(item.token),
                tokenPreview: asString(item.tokenPreview),
                usageCount:
                  typeof item.usageCount === "number" ? item.usageCount : 0,
                usageLimit:
                  typeof item.usageLimit === "number"
                    ? item.usageLimit
                    : null,
                expireAt: asString(item.expireAt) ?? null,
                revokedAt: asString(item.revokedAt) ?? null,
                createdAt:
                  asString(item.createdAt) ?? new Date().toISOString(),
              });

              return items;
            }, [])
          : [];

        const normalizedJoinRequests: JoinRequestItem[] = Array.isArray(
          joinRequestsPayload,
        )
          ? joinRequestsPayload.reduce<JoinRequestItem[]>((items, item) => {
              if (!isRecord(item) || typeof item.id !== "string") {
                return items;
              }

              const status = asString(item.status);
              if (
                status !== "pending" &&
                status !== "approved" &&
                status !== "rejected"
              ) {
                return items;
              }

              items.push({
                id: item.id,
                conversationId:
                  resolveConversationId(item, {
                    source: "GroupInfo.joinRequests",
                  }) ?? conversation.id,
                userId: asString(item.userId) ?? "",
                status,
                note: asString(item.note),
                createdAt:
                  asString(item.requestedAt) ??
                  asString(item.createdAt) ??
                  new Date().toISOString(),
                resolvedAt: asString(item.resolvedAt),
              });

              return items;
            }, [])
          : [];

        setInviteLinks(conversation.id, normalizedInviteLinks);
        setJoinRequests(conversation.id, normalizedJoinRequests);
      } catch {
        // no-op: keep local state if bootstrap snapshot is temporarily unavailable
      }
    };

    void hydrateRealtimeState();

    return () => {
      cancelled = true;
    };
  }, [
    conversation.id,
    isAdmin,
    setInviteLinks,
    setJoinRequests,
  ]);

  const handleAddMember = useCallback(
    async (userId: string) => {
      setIsSubmitting(true);
      try {
        await chatApi.group.addMember(conversation.id, userId);
        await refreshGroupState();
        setSearchQuery("");
        setShowAddMember(false);
        toast.success(t("profile:toast.memberAdded"));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.memberAddFailed"));
      } finally {
        setIsSubmitting(false);
      }
    },
    [conversation.id, refreshGroupState, t],
  );

  const handleRenameGroup = useCallback(async () => {
    const nextName = groupNameDraft.trim();

    if (!nextName) {
      toast.error(t("profile:toast.groupNameRequired"));
      return;
    }

    if (nextName === (conversation.name || "").trim()) {
      setIsRenamingGroup(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await chatApi.group.updateSettings(conversation.id, { title: nextName });
      await refreshGroupState();
      setIsRenamingGroup(false);
      toast.success(t("profile:toast.groupRenamed"));
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("profile:toast.groupRenameFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    conversation.id,
    conversation.name,
    groupNameDraft,
    refreshGroupState,
    t,
  ]);

  const handleToggleMemberRole = useCallback(
    async (member: GroupMember) => {
      if (
        !canToggleAdminRole({
          actorRole: currentUserRole,
          actorUserId: currentUserId,
          targetRole: member.role,
          targetUserId: member.id,
          capabilities: groupCapabilities,
        })
      ) {
        return;
      }

      const nextRole =
        member.role === RoomMemberRole.ADMIN
          ? RoomMemberRole.MEMBER
          : RoomMemberRole.ADMIN;

      setActingMemberId(member.id);
      try {
        await chatApi.group.updateMemberRole(conversation.id, member.id, nextRole);
        await refreshGroupState();
        toast.success(
          nextRole === RoomMemberRole.ADMIN
            ? t("profile:toast.memberPromoted")
            : t("profile:toast.memberDemoted"),
        );
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.roleUpdateFailed"));
      } finally {
        setActingMemberId(null);
      }
    },
    [conversation.id, currentUserId, currentUserRole, groupCapabilities, refreshGroupState, t],
  );

  const handleRemoveMember = useCallback(
    (member: GroupMember) => {
      if (!canRemoveMember(member)) return;
      // Set both old and new modal states
      setPendingConfirm({ type: "remove-member", member });
      setRemoveMemberTarget({
        memberId: member.id,
        memberName: resolveMemberName(member) || member.id,
      });
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
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.memberRemoveFailed"));
      } finally {
        setActingMemberId(null);
        setIsConfirmActionPending(false);
      }
    },
    [conversation.id, refreshGroupState, t],
  );

  const handleLeaveGroup = useCallback(() => {
    if (!canLeaveCurrentGroup) {
      toast.error(
        t("profile:groupInfo.leaveBlockedOwner", {
          defaultValue: "Transfer ownership before leaving this group.",
        }),
      );
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
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("profile:toast.leaveGroupFailed"));
    } finally {
      setIsSubmitting(false);
      setIsConfirmActionPending(false);
    }
  }, [
    conversation.id,
    navigate,
    onClose,
    removeConversation,
    t,
  ]);

  const handleTransferOwnership = useCallback(
    (member: GroupMember) => {
      if (currentUserRole !== RoomMemberRole.OWNER) return;
      if (member.role === RoomMemberRole.OWNER) return;
      setPendingConfirm({ type: "transfer-ownership", member });
      setTransferOwnershipTarget({
        memberId: member.id,
        memberName: resolveMemberName(member) || member.id,
      });
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
        toast.success(
          t("profile:toast.ownershipTransferred", {
            name: resolveMemberName({ id: member.id, username: member.username, displayName: member.displayName }),
          }),
        );
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.ownershipTransferFailed"));
      } finally {
        setActingMemberId(null);
        setIsConfirmActionPending(false);
      }
    },
    [conversation.id, refreshGroupState, t],
  );

  const handleDeleteGroup = useCallback(() => {
    if (currentUserRole !== RoomMemberRole.OWNER) return;
    setPendingConfirm({ type: "delete-group" });
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
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("profile:toast.groupDeleteFailed"));
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
      setBanMemberTarget({
        memberId: member.id,
        memberName: resolveMemberName(member) || member.id,
      });
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
        toast.success(
          t("profile:toast.memberBanned", {
            name: resolveMemberName({ id: member.id, username: member.username, displayName: member.displayName }),
          }),
        );
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.banMemberFailed"));
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
      const response = await createGroupInviteLinkUseCase({
        conversationId: conversation.id,
        name: inviteNameDraft.trim() || undefined,
      });
      const payload = unwrapApiSuccess(response) as Record<string, unknown>;
      const id = typeof payload.id === "string" ? payload.id : "";
      if (!id) {
        throw new Error("Invite link id missing");
      }

      upsertInviteLink(conversation.id, {
        id,
        conversationId: conversation.id,
        name: typeof payload.name === "string" ? payload.name : undefined,
        inviteUrl:
          typeof payload.inviteUrl === "string" ? payload.inviteUrl : undefined,
        token: typeof payload.token === "string" ? payload.token : undefined,
        tokenPreview:
          typeof payload.tokenPreview === "string"
            ? payload.tokenPreview
            : undefined,
        usageCount:
          typeof payload.usageCount === "number" ? payload.usageCount : 0,
        usageLimit:
          typeof payload.usageLimit === "number" ? payload.usageLimit : null,
        expireAt:
          typeof payload.expireAt === "string" ? payload.expireAt : null,
        revokedAt:
          typeof payload.revokedAt === "string" ? payload.revokedAt : null,
        createdAt:
          typeof payload.createdAt === "string"
            ? payload.createdAt
            : new Date().toISOString(),
      });

      const copyValue =
        (typeof payload.inviteUrl === "string" && payload.inviteUrl) ||
        (typeof payload.token === "string" && payload.token) ||
        "";
      if (copyValue && typeof navigator !== "undefined") {
        void navigator.clipboard.writeText(copyValue);
      }

      setShowCreateInviteForm(false);
      setInviteNameDraft("");
      toast.success(t("profile:groupInfo.invite.created"));
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(
        apiError.message || t("profile:groupInfo.invite.createFailed"),
      );
    } finally {
      setIsCreatingInvite(false);
    }
  }, [
    conversation.id,
    inviteNameDraft,
    isAdmin,
    isCreatingInvite,
    t,
    upsertInviteLink,
  ]);

  const handleCopyInviteLink = useCallback(
    async (value?: string) => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        toast.success(t("profile:groupInfo.invite.copied"));
      } catch {
        toast.error(t("profile:groupInfo.invite.copyFailed"));
      }
    },
    [t],
  );

  const handleRevokeInvite = useCallback(
    async (linkId: string) => {
      if (!isAdmin || !linkId) return;
      setRevokingInviteId(linkId);
      try {
        await revokeGroupInviteLinkUseCase(conversation.id, linkId);
        markInviteLinkRevoked(conversation.id, linkId);
        toast.success(t("profile:groupInfo.invite.revoked"));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message || t("profile:groupInfo.invite.revokeFailed"),
        );
      } finally {
        setRevokingInviteId(null);
      }
    },
    [conversation.id, isAdmin, markInviteLinkRevoked, t],
  );

  const handleResolveJoinRequest = useCallback(
    async (requestId: string, status: "approved" | "rejected") => {
      if (!isAdmin || !requestId) return;

      setResolvingRequestId(requestId);
      try {
        await resolveGroupJoinRequestUseCase(
          conversation.id,
          requestId,
          status,
        );
        markJoinRequestResolved(conversation.id, requestId, status);
        removeJoinRequest(conversation.id, requestId);
        if (status === "approved") {
          void fetchMembers();
        }
        toast.success(
          status === "approved"
            ? t("profile:groupInfo.joinRequests.approved")
            : t("profile:groupInfo.joinRequests.rejected"),
        );
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message || t("profile:groupInfo.joinRequests.resolveFailed"),
        );
      } finally {
        setResolvingRequestId(null);
      }
    },
    [
      conversation.id,
      fetchMembers,
      isAdmin,
      markJoinRequestResolved,
      removeJoinRequest,
      t,
    ],
  );

  const pendingConfirmMember =
    pendingConfirm?.type === "remove-member" || pendingConfirm?.type === "transfer-ownership"
      ? pendingConfirm.member
      : null;
  const pendingConfirmMemberName = pendingConfirmMember
    ? resolveMemberName(pendingConfirmMember) || pendingConfirmMember.id
    : "";

  // Pending join requests count (only pending status)
  const pendingJoinRequestsCount = joinRequests.filter((r) => r.status === "pending").length;

  const confirmTitle =
    pendingConfirm?.type === "leave-group"
      ? t("profile:groupInfo.leaveGroup")
      : pendingConfirm?.type === "transfer-ownership"
        ? t("profile:groupInfo.transferOwnership")
        : pendingConfirm?.type === "delete-group"
          ? t("profile:groupInfo.deleteGroup")
          : pendingConfirm?.type === "ban-member"
            ? t("profile:groupInfo.banMember")
            : t("profile:groupInfo.actions.removeMember", {
                defaultValue: "Remove member",
              });
  const confirmMessage =
    pendingConfirm?.type === "leave-group"
      ? t("profile:groupInfo.leaveConfirm")
      : pendingConfirm?.type === "transfer-ownership"
        ? t("profile:groupInfo.transferOwnershipConfirm", {
            name: pendingConfirmMemberName,
          })
        : pendingConfirm?.type === "delete-group"
          ? t("profile:groupInfo.deleteGroupConfirm")
          : pendingConfirm?.type === "ban-member"
            ? t("profile:groupInfo.banMemberConfirm", {
                name: pendingConfirmMemberName,
              })
            : t("profile:groupInfo.removeMemberConfirm", {
                name: pendingConfirmMemberName,
              });
  const confirmText =
    pendingConfirm?.type === "leave-group"
      ? t("profile:groupInfo.leaveGroup")
      : pendingConfirm?.type === "delete-group"
        ? t("profile:groupInfo.deleteGroup")
        : t("common:actions.remove", { defaultValue: "Remove" });

  return (
    <div className={clsx("flex h-full flex-col bg-surface", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("profile:groupInfo.title")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="icon-button-surface h-9 w-9"
          aria-label={t("common:actions.close")}
        >
          <XMarkIcon className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <Avatar
                src={groupAvatarPreview || conversation.avatar}
                alt={conversation.name}
                size="lg"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-text-primary">
                    {isRenamingGroup
                      ? t("profile:groupInfo.renameGroup")
                      : conversation.name || t("common:labels.group")}
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {t("profile:groupInfo.membersCount", {
                      count: participantCount,
                    })}
                  </p>
                  {groupAvatarStage !== "idle" ? (
                    <p className="mt-1 text-xs text-text-muted">
                      {resolveGroupAvatarStageLabel(
                        groupAvatarStage,
                        groupAvatarProgress,
                      )}
                    </p>
                  ) : null}
                </div>
                {isAdmin && !isRenamingGroup ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={isSubmitting || groupAvatarStage === "uploading"}
                      className="rounded-md p-2 hover:bg-surface-overlay"
                      aria-label={t("profile:groupInfo.changeAvatar", {
                        defaultValue: "Change group avatar",
                      })}
                    >
                      <CameraIcon className="h-4 w-4 text-text-muted" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRenamingGroup(true)}
                      disabled={isSubmitting}
                      className="rounded-md p-2 hover:bg-surface-overlay"
                      aria-label={t("profile:groupInfo.renameGroup")}
                    >
                      <HugeiconsIcon
                        icon={PencilEdit01Icon}
                        className="h-4 w-4 text-text-muted"
                        strokeWidth={1.5}
                      />
                    </button>
                  </div>
                ) : null}
              </div>

              {isRenamingGroup ? (
                <div className="mt-3 max-w-sm space-y-2">
                  <Input
                    type="text"
                    value={groupNameDraft}
                    onChange={(event) => setGroupNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleRenameGroup();
                      }
                      if (event.key === "Escape") {
                        setIsRenamingGroup(false);
                        setGroupNameDraft(conversation.name || "");
                      }
                    }}
                    placeholder={t("profile:groupInfo.renamePlaceholder")}
                    disabled={isSubmitting}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRenamingGroup(false);
                        setGroupNameDraft(conversation.name || "");
                      }}
                      className="rounded-md border border-border px-3 py-1.5 text-body-sm text-text-muted hover:bg-surface-hover"
                    >
                      {t("common:actions.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleRenameGroup()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-body-sm text-text-inverse hover:opacity-90 disabled:opacity-60"
                    >
                      <CheckIcon className="w-4 h-4" />
                      {t("common:actions.save")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              void handleGroupAvatarChange(event);
            }}
          />

          {(canAddMembers || isAdmin || joinRequests.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canAddMembers && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setMembersExpanded(true);
                    setShowAddMember((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
                >
                  <UserPlusIcon className="h-4 w-4" />
                  {t("profile:groupInfo.addMember")}
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setSecurityExpanded(true);
                    setShowCreateInviteForm((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
                >
                  <LinkIcon className="h-4 w-4" />
                  {t("profile:groupInfo.invite.create")}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 bg-background px-3 py-3">
          <div className="rounded-xl border border-border bg-surface">
            <InfoMenuRow
              icon={<UsersIcon />}
              label={t("profile:groupInfo.sections.members")}
              count={participantCount}
              expandable
              expanded={membersExpanded}
              onClick={() => setMembersExpanded((prev) => !prev)}
            />
            {membersExpanded && (
              <div className="border-t border-border py-1">
                {showAddMember && (
                  <div className="space-y-2 px-4 pb-3">
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t("profile:groupInfo.searchMemberPlaceholder")}
                      leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
                      disabled={isSubmitting}
                    />
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                      {isSearching ? (
                        <DirectorySkeleton count={3} />
                      ) : searchErrorMessage ? (
                        <p className="px-3 py-3 text-sm text-danger">
                          {searchErrorMessage}
                        </p>
                      ) : debouncedQuery.trim().length >= 2 &&
                        searchResults.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-text-muted">
                          {t("profile:groupInfo.noSearchResult")}
                        </p>
                      ) : searchResults.length === 0 ? null : (
                        searchResults.map((user) => (
                          <UserSearchResultItem
                            key={user.id}
                            avatarUrl={user.avatarUrl}
                            avatarAlt={user.displayName || user.id}
                            status={user.status ?? null}
                            primaryText={user.displayName || user.id}
                            secondaryText={buildUserSearchSecondaryText(user)}
                            disabled={isSubmitting || !isGroupMemberEligible(user)}
                            onSelect={() => void handleAddMember(user.id)}
                            trailing={
                              isGroupMemberEligible(user) ? (
                                <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                  {t("common:actions.add")}
                                </span>
                              ) : (
                                <span className="rounded-lg bg-surface-overlay px-2 py-1 text-xs text-text-muted">
                                  {t("profile:newChatModal.friendsOnly", {
                                    defaultValue: "Friends only",
                                  })}
                                </span>
                              )
                            }
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}

                {isLoadingMembers ? (
                  <DirectorySkeleton count={5} />
                ) : members.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-text-muted">
                    {t("profile:groupInfo.noMembers")}
                  </p>
                ) : (
                  <MembersList
                    members={members}
                    isLoading={isLoadingMembers}
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
                )}
              </div>
            )}
          </div>

          <SharedResourcesPreview conversationId={conversation.id} />

          {isAdmin && (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <InfoMenuRow
                icon={<ShieldCheckIcon />}
                label={t("profile:groupInfo.sections.security")}
                badge={
                  pendingJoinRequestsCount > 0
                    ? pendingJoinRequestsCount
                    : undefined
                }
                expandable
                expanded={securityExpanded}
                onClick={() => setSecurityExpanded((prev) => !prev)}
              />
              {securityExpanded && (
                <div className="space-y-4 border-t border-border p-4">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {t("profile:groupInfo.tabs.inviteLinks")}
                    </p>
                  {showCreateInviteForm && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <Input
                        type="text"
                        value={inviteNameDraft}
                        onChange={(event) =>
                          setInviteNameDraft(event.target.value)
                        }
                        placeholder={t(
                          "profile:groupInfo.invite.namePlaceholder",
                        )}
                        disabled={isCreatingInvite}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isCreatingInvite}
                          onClick={() => {
                            setShowCreateInviteForm(false);
                            setInviteNameDraft("");
                          }}
                          className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
                        >
                          {t("common:actions.cancel")}
                        </button>
                        <button
                          type="button"
                          disabled={isCreatingInvite}
                          onClick={() => void handleCreateInviteLink()}
                          className="rounded-md bg-primary px-3 py-1.5 text-sm text-text-inverse hover:opacity-90 disabled:opacity-60"
                        >
                          {isCreatingInvite
                            ? t("common:loading.processing")
                            : t("profile:groupInfo.invite.create")}
                        </button>
                      </div>
                    </div>
                  )}

                  {inviteLinks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <LinkIcon className="mb-3 h-10 w-10 text-text-muted" />
                      <p className="mb-4 text-sm text-text-muted">
                        {t("profile:groupInfo.invite.empty")}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCreateInviteForm(true)}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-text-inverse hover:opacity-90"
                      >
                        <LinkIcon className="h-4 w-4" />
                        {t("profile:groupInfo.invite.create")}
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {inviteLinks.map((link) => {
                        const shareValue = link.inviteUrl || link.token || "";
                        const isRevoked = Boolean(link.revokedAt);
                        return (
                          <div
                            key={link.id}
                            className="flex items-start justify-between gap-3 px-3 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-text-primary">
                                  {link.name ||
                                    t("profile:groupInfo.invite.unnamed")}
                                </p>
                                {isRevoked && (
                                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                                    {t("profile:groupInfo.invite.revokedLabel")}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 truncate text-xs text-text-muted">
                                {link.inviteUrl || link.tokenPreview || link.id}
                              </p>
                              <p className="mt-1 text-xs text-text-muted">
                                {t("profile:groupInfo.invite.usage", {
                                  count: link.usageCount || 0,
                                  limit:
                                    typeof link.usageLimit === "number"
                                      ? link.usageLimit
                                      : "unlimited",
                                })}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                disabled={!shareValue}
                                onClick={() =>
                                  void handleCopyInviteLink(shareValue)
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                              >
                                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                {t("common:actions.copy")}
                              </button>
                              {!isRevoked && (
                                <button
                                  type="button"
                                  disabled={revokingInviteId === link.id}
                                  onClick={() =>
                                    void handleRevokeInvite(link.id)
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                                >
                                  <NoSymbolIcon className="h-3.5 w-3.5" />
                                  {revokingInviteId === link.id
                                    ? t("common:loading.processing")
                                    : t("profile:groupInfo.invite.revoke")}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {t("profile:groupInfo.tabs.joinRequests")}
                    </p>
                    {joinRequests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckIcon className="mb-3 h-10 w-10 text-text-muted" />
                  <p className="text-sm text-text-muted">
                    {t("profile:groupInfo.joinRequests.empty")}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {joinRequests.map((request) => {
                    const user =
                      membersByUserId[request.userId] ||
                      members.find((member) => member.id === request.userId);
                    const displayName =
                      resolveMemberName(user) || request.userId;

                    return (
                      <div
                        key={request.id}
                        className="flex items-start justify-between gap-3 px-3 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar
                            src={user?.avatar}
                            alt={displayName}
                            size="md"
                            status={user?.status}
                            showStatus
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-text-primary">
                              {displayName}
                            </p>
                            <p className="truncate text-xs text-text-muted">
                              @{user?.username || request.userId}
                            </p>
                            {request.note && (
                              <p className="mt-1 truncate text-xs text-text-secondary">
                                {request.note}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={resolvingRequestId === request.id}
                            onClick={() =>
                              void handleResolveJoinRequest(
                                request.id,
                                "approved",
                              )
                            }
                            className="rounded-md bg-primary px-3 py-1.5 text-xs text-text-inverse hover:opacity-90 disabled:opacity-60"
                          >
                            {t("common:actions.approve")}
                          </button>
                          <button
                            type="button"
                            disabled={resolvingRequestId === request.id}
                            onClick={() =>
                              void handleResolveJoinRequest(
                                request.id,
                                "rejected",
                              )
                            }
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
        </div>

        <div className="border-t border-border bg-danger/5">
          {currentUserRole === RoomMemberRole.OWNER && (
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 text-danger" />
                <span className="text-xs font-medium uppercase tracking-wide text-danger">
                  {t("profile:groupInfo.dangerZone", { defaultValue: "Danger Zone" })}
                </span>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleDeleteGroup()}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-60"
              >
                <ExclamationTriangleIcon className="h-4 w-4" />
                {t("profile:groupInfo.deleteGroup")}
              </button>
            </div>
          )}
          <div className="px-4 py-2">
            <button
              type="button"
              disabled={isSubmitting || !canLeaveCurrentGroup}
              title={
                canLeaveCurrentGroup ? undefined : blockedOwnerLeaveTitle
              }
              onClick={() => void handleLeaveGroup()}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
                canLeaveCurrentGroup
                  ? "text-danger hover:bg-danger/10"
                  : "cursor-not-allowed text-text-muted opacity-60",
              )}
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
              <span>{t("profile:groupInfo.leaveGroup")}</span>
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={pendingConfirm !== null}
        onClose={() => {
          if (!isConfirmActionPending) {
            setPendingConfirm(null);
          }
        }}
        onConfirm={() => {
          if (pendingConfirm?.type === "remove-member") {
            void confirmRemoveMember(pendingConfirm.member);
            return;
          }
          if (pendingConfirm?.type === "leave-group") {
            void confirmLeaveGroup();
            return;
          }
          if (pendingConfirm?.type === "transfer-ownership") {
            void confirmTransferOwnership(pendingConfirm.member);
            return;
          }
          if (pendingConfirm?.type === "delete-group") {
            void confirmDeleteGroup();
            return;
          }
          if (pendingConfirm?.type === "ban-member") {
            void confirmBanMember(pendingConfirm.member);
          }
        }}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmText}
        isLoading={isConfirmActionPending}
        variant="danger"
      />

      {/* New refined modals */}
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
