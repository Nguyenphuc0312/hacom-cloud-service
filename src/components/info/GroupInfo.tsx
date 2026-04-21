import React, { useState, useCallback } from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  PencilIcon,
  CheckIcon,
  BellIcon,
  PhotoIcon,
  UserPlusIcon,
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "../common/Avatar";
import { UserSearchResultItem } from "../common/UserSearchResultItem";
import { Input, Spinner, TabTrigger, toast } from "../ui";
import type { Conversation, UserSummary } from "../../types";
import { RoomMemberRole, UserStatus } from "../../types";
import { useChatStore, useGroupStore } from "../../stores";
import type { InviteLinkItem, JoinRequestItem } from "../../stores/groupStore";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { resolveConversationId } from "../../lib/conversationIdentity";
import { chatApi } from "../../features/chat/api/chatApi";
import { getConversationByIdUseCase } from "../../features/chat/usecases/getConversationById";
import {
  buildUserSearchSecondaryText,
  isGroupMemberEligible,
  useChatUserSearch,
} from "../../features/chat/hooks/useChatUserSearch";
import {
  canAddGroupMembers,
  canDeleteConversationForSelf,
  canLeaveGroup,
  canRemoveGroupMember,
  canRenameGroup,
  canToggleAdminRole,
} from "../../features/chat/permissions/groupPermissions";
import { createGroupInviteLinkUseCase } from "../../features/chat/usecases/createGroupInviteLink";
import { revokeGroupInviteLinkUseCase } from "../../features/chat/usecases/revokeGroupInviteLink";
import { resolveGroupJoinRequestUseCase } from "../../features/chat/usecases/resolveGroupJoinRequest";
import { getUserDisplayName } from "../../utils/messageHelpers";

interface GroupInfoProps {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
  onDeleteConversation?: () => void | Promise<void>;
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
  onDeleteConversation,
  className,
}) => {
  const { t } = useTranslation(["profile", "common"]);
  const unavailableActionClass = "cursor-not-allowed opacity-60";
  const unavailableActionTitle = t("profile:groupInfo.unavailableAction");
  const blockedOwnerLeaveTitle = t("profile:groupInfo.leaveBlockedOwner", {
    defaultValue: "Transfer ownership before leaving this group.",
  });

  const participants = React.useMemo(
    () =>
      Array.isArray(conversation.participants) ? conversation.participants : [],
    [conversation.participants],
  );

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "members" | "media" | "files" | "inviteLinks" | "joinRequests"
  >("members");
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
  const [inviteUsageLimitDraft, setInviteUsageLimitDraft] = useState("");
  const [inviteExpireAtDraft, setInviteExpireAtDraft] = useState("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(
    null,
  );

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

  const createdBy = React.useMemo(() => {
    if (!isRecord(conversation)) return undefined;
    return asString(
      (conversation as unknown as Record<string, unknown>).createdBy,
    );
  }, [conversation]);

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
  const isAdmin = canRenameGroup(currentUserRole);
  const canAddMembers = canAddGroupMembers(currentUserRole);
  const canDeleteConversation = canDeleteConversationForSelf();
  const canLeaveCurrentGroup = canLeaveGroup(currentUserRole, activeOwnerCount);

  const canRemoveMember = useCallback(
    (member: GroupMember) => {
      return canRemoveGroupMember({
        actorRole: currentUserRole,
        actorUserId: currentUserId,
        targetRole: member.role,
        targetUserId: member.id,
      });
    },
    [currentUserId, currentUserRole],
  );

  const roleLabel = useCallback(
    (role: GroupMemberRole) => {
      if (role === RoomMemberRole.OWNER)
        return t("profile:groupInfo.roles.owner");
      if (role === RoomMemberRole.ADMIN)
        return t("profile:groupInfo.roles.admin");
      return t("profile:groupInfo.roles.member");
    },
    [t],
  );

  const roleBadgeClass = useCallback((role: GroupMemberRole) => {
    if (role === RoomMemberRole.OWNER) {
      return "bg-warning/15 text-warning";
    }

    if (role === RoomMemberRole.ADMIN) {
      return "bg-primary/10 text-primary";
    }

    return "bg-surface-overlay text-text-muted";
  }, []);

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

  React.useEffect(() => {
    setGroupNameDraft(conversation.name || "");
    setIsRenamingGroup(false);
    setShowAddMember(false);
  }, [conversation.id, conversation.name]);

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
    [conversation.id, currentUserId, currentUserRole, refreshGroupState, t],
  );

  const handleRemoveMember = useCallback(
    async (member: GroupMember) => {
      if (!canRemoveMember(member)) return;

      const displayName = resolveMemberName(member) || member.id;
      if (
        !window.confirm(
          t("profile:groupInfo.removeMemberConfirm", { name: displayName }),
        )
      ) {
        return;
      }

      setActingMemberId(member.id);
      try {
        await chatApi.group.removeMember(conversation.id, member.id);
        await refreshGroupState();
        toast.success(t("profile:toast.memberRemoved"));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.memberRemoveFailed"));
      } finally {
        setActingMemberId(null);
      }
    },
    [canRemoveMember, conversation.id, refreshGroupState, t],
  );

  const handleLeaveGroup = useCallback(async () => {
    if (!canLeaveCurrentGroup) {
      toast.error(
        t("profile:groupInfo.leaveBlockedOwner", {
          defaultValue: "Transfer ownership before leaving this group.",
        }),
      );
      return;
    }

    if (!window.confirm(t("profile:groupInfo.leaveConfirm"))) return;

    setIsSubmitting(true);
    try {
      await chatApi.group.leaveGroup(conversation.id);
      removeConversation(conversation.id);
      toast.success(t("profile:toast.leftGroup"));
      onClose();
      navigate("/chat");
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("profile:toast.leaveGroupFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canLeaveCurrentGroup,
    conversation.id,
    navigate,
    onClose,
    removeConversation,
    t,
  ]);

  const tabs = [
    { id: "members", label: t("profile:groupInfo.tabs.members") },
    {
      id: "inviteLinks",
      label: t("profile:groupInfo.tabs.inviteLinks"),
    },
    {
      id: "joinRequests",
      label: t("profile:groupInfo.tabs.joinRequests"),
    },
    { id: "media", label: t("profile:groupInfo.tabs.media") },
    { id: "files", label: t("profile:groupInfo.tabs.files") },
  ] as const;

  const handleCreateInviteLink = useCallback(async () => {
    if (!isAdmin || isCreatingInvite) return;

    const usageLimit = inviteUsageLimitDraft.trim()
      ? Number(inviteUsageLimitDraft.trim())
      : undefined;
    if (
      usageLimit !== undefined &&
      (!Number.isFinite(usageLimit) || usageLimit <= 0)
    ) {
      toast.error(t("profile:groupInfo.invite.invalidUsageLimit"));
      return;
    }

    setIsCreatingInvite(true);
    try {
      const response = await createGroupInviteLinkUseCase({
        conversationId: conversation.id,
        name: inviteNameDraft.trim() || undefined,
        expireAt: inviteExpireAtDraft
          ? new Date(inviteExpireAtDraft).toISOString()
          : undefined,
        usageLimit: usageLimit ? Math.floor(usageLimit) : undefined,
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
      setInviteUsageLimitDraft("");
      setInviteExpireAtDraft("");
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
    inviteExpireAtDraft,
    inviteNameDraft,
    inviteUsageLimitDraft,
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

  return (
    <div className={clsx("flex h-full flex-col bg-surface", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-title-sm text-text-primary">
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
        <div className="flex flex-col items-center px-4 py-4">
          <Avatar src={conversation.avatar} alt={conversation.name} size="xl" />

          <div className="mt-3 text-center">
            <h2 className="flex items-center justify-center gap-2 text-title text-text-primary">
              {isRenamingGroup
                ? t("profile:groupInfo.renameGroup")
                : conversation.name || t("common:labels.group")}
            </h2>

            {isRenamingGroup ? (
              <div className="mt-3 w-full min-w-64 space-y-2">
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
                <div className="flex items-center justify-center gap-2">
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
            ) : (
              <div className="mt-1 flex items-center justify-center gap-2">
                <p className="text-body-sm text-text-muted">
                  {t("profile:groupInfo.membersCount", {
                    count:
                      conversation.participantCount ??
                      (members.length > 0
                        ? members.length
                        : participants.length),
                  })}
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsRenamingGroup(true)}
                    disabled={isSubmitting}
                    className="rounded-md p-1 hover:bg-surface-overlay"
                    aria-label={t("profile:groupInfo.renameGroup")}
                  >
                    <PencilIcon className="w-4 h-4 text-text-muted" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mx-4 h-px bg-border" />

        <div className="py-2">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-4">
              <BellIcon className="w-5 h-5 text-text-muted" />
              <div>
                <span className="text-sm text-text-primary">
                  {t("profile:groupInfo.notifications")}
                </span>
                <p className="text-xs text-text-muted">
                  {t("profile:groupInfo.comingSoon")}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled
              title={unavailableActionTitle}
              className={clsx(
                "w-10 h-6 rounded-full relative bg-border-strong",
                unavailableActionClass,
              )}
              aria-disabled="true"
              aria-label={unavailableActionTitle}
            >
              <div className="absolute top-1 left-1 w-4 h-4 bg-surface rounded-full shadow" />
            </button>
          </div>
        </div>

        <div className="mx-4 h-px bg-border" />

        <div className="flex border-b border-border px-1">
          {tabs.map((tab) => (
            <TabTrigger
              key={tab.id}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1"
            >
              {tab.label}
            </TabTrigger>
          ))}
        </div>

        <div className="py-2">
          {activeTab === "members" && (
            <>
              {canAddMembers && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowAddMember((prev) => !prev)}
                  className="flex w-full items-center gap-4 px-4 py-2.5 text-primary transition-micro hover:bg-surface-hover"
                >
                  <UserPlusIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {t("profile:groupInfo.addMember")}
                  </span>
                </button>
              )}

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
                  <p className="text-xs leading-5 text-text-muted">
                    {t("profile:groupInfo.addMemberEligibilityHint", {
                      defaultValue:
                        "Only accepted friends can be added directly. Use invite links for broader access when group settings allow.",
                    })}
                  </p>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                    {isSearching ? (
                      <div className="py-4 flex justify-center">
                        <Spinner size="md" />
                      </div>
                    ) : searchErrorMessage ? (
                      <p className="px-3 py-3 text-sm text-danger">
                        {searchErrorMessage}
                      </p>
                    ) : debouncedQuery.trim().length >= 2 &&
                      searchResults.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-text-muted">
                        {t("profile:groupInfo.noSearchResult")}
                      </p>
                    ) : searchResults.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-text-muted">
                        {t("profile:groupInfo.searchHint", {
                          defaultValue:
                            "Search by name, username, email, or employee code.",
                        })}
                      </p>
                    ) : (
                      searchResults.map((user) => (
                        <UserSearchResultItem
                          key={user.id}
                          avatarUrl={user.avatarUrl}
                          avatarAlt={user.displayName || user.id}
                          status={user.status ?? null}
                          primaryText={user.displayName || user.id}
                          secondaryText={buildUserSearchSecondaryText(user)}
                          disabled={
                            isSubmitting || !isGroupMemberEligible(user)
                          }
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
                <div className="py-4 flex justify-center">
                  <Spinner size="md" />
                </div>
              ) : members.length === 0 ? (
                <p className="px-4 py-3 text-sm text-text-muted">
                  {t("profile:groupInfo.noMembers")}
                </p>
              ) : (
                members.map((member) => {
                  const isMemberActionRunning =
                    isSubmitting || actingMemberId === member.id;
                  const canToggleRole = canToggleAdminRole({
                    actorRole: currentUserRole,
                    actorUserId: currentUserId,
                    targetRole: member.role,
                    targetUserId: member.id,
                  });

                  return (
                    <div
                      key={member.id}
                      className="flex items-start gap-3 px-4 py-2.5 transition-micro hover:bg-surface-hover"
                    >
                      <Avatar
                        src={member.avatar}
                        alt={resolveMemberName(member) || member.id}
                        size="md"
                        status={member.status}
                        showStatus
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {resolveMemberName(member) || member.id}
                          {member.id === currentUserId && (
                            <span className="ml-2 text-xs text-text-muted">
                              {t("profile:groupInfo.youSuffix")}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                          @{member.username}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={clsx(
                              "rounded-full px-2 py-0.5 text-caption",
                              roleBadgeClass(member.role),
                            )}
                          >
                            {roleLabel(member.role)}
                          </span>

                          {canToggleRole && (
                            <button
                              type="button"
                              disabled={isMemberActionRunning}
                              onClick={() =>
                                void handleToggleMemberRole(member)
                              }
                              className="text-xs px-2 py-0.5 rounded border border-border text-text-secondary hover:bg-surface-overlay disabled:opacity-60"
                            >
                              {member.role === RoomMemberRole.ADMIN
                                ? t("profile:groupInfo.actions.removeAdmin")
                                : t("profile:groupInfo.actions.makeAdmin")}
                            </button>
                          )}

                          {canRemoveMember(member) && (
                            <button
                              type="button"
                              disabled={isMemberActionRunning}
                              onClick={() => void handleRemoveMember(member)}
                              className="text-xs px-2 py-0.5 rounded border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-60"
                            >
                              {t("profile:groupInfo.actions.removeMember")}
                            </button>
                          )}

                          {actingMemberId === member.id && (
                            <Spinner size="sm" className="ml-1" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {activeTab === "media" && (
            <div className="p-4">
              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex aspect-square items-center justify-center rounded-lg bg-surface-overlay"
                  >
                    <PhotoIcon className="w-8 h-8 text-border-strong" />
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled
                title={unavailableActionTitle}
                className={clsx(
                  "w-full mt-4 py-2 text-sm text-primary font-medium rounded-lg",
                  unavailableActionClass,
                )}
              >
                {t("profile:groupInfo.viewAllMedia")}
              </button>
            </div>
          )}

          {activeTab === "files" && (
            <div className="p-4 text-center text-text-muted text-sm">
              {t("profile:groupInfo.noSharedFiles")}
            </div>
          )}

          {activeTab === "inviteLinks" && (
            <div className="space-y-3 p-4">
              {!isAdmin ? (
                <p className="text-sm text-text-muted">
                  {t("profile:groupInfo.invite.noPermission")}
                </p>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateInviteForm((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
                  >
                    <LinkIcon className="h-4 w-4" />
                    {t("profile:groupInfo.invite.create")}
                  </button>

                  {showCreateInviteForm && (
                    <div className="space-y-2 rounded-xl border border-border bg-surface-raised p-3">
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
                      <Input
                        type="number"
                        value={inviteUsageLimitDraft}
                        onChange={(event) =>
                          setInviteUsageLimitDraft(event.target.value)
                        }
                        placeholder={t(
                          "profile:groupInfo.invite.usageLimitPlaceholder",
                        )}
                        disabled={isCreatingInvite}
                      />
                      <Input
                        type="datetime-local"
                        value={inviteExpireAtDraft}
                        onChange={(event) =>
                          setInviteExpireAtDraft(event.target.value)
                        }
                        disabled={isCreatingInvite}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isCreatingInvite}
                          onClick={() => {
                            setShowCreateInviteForm(false);
                            setInviteNameDraft("");
                            setInviteUsageLimitDraft("");
                            setInviteExpireAtDraft("");
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
                    <p className="text-sm text-text-muted">
                      {t("profile:groupInfo.invite.empty")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {inviteLinks.map((link) => {
                        const shareValue = link.inviteUrl || link.token || "";
                        const isRevoked = Boolean(link.revokedAt);
                        return (
                          <div
                            key={link.id}
                            className="rounded-xl border border-border bg-surface-raised p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-text-primary">
                                  {link.name ||
                                    t("profile:groupInfo.invite.unnamed")}
                                </p>
                                <p className="mt-1 truncate text-xs text-text-muted">
                                  {link.inviteUrl ||
                                    link.tokenPreview ||
                                    link.id}
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
                              {isRevoked && (
                                <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                                  {t("profile:groupInfo.invite.revokedLabel")}
                                </span>
                              )}
                            </div>

                            <div className="mt-3 flex items-center gap-2">
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
              )}
            </div>
          )}

          {activeTab === "joinRequests" && (
            <div className="space-y-2 p-4">
              {!isAdmin ? (
                <p className="text-sm text-text-muted">
                  {t("profile:groupInfo.joinRequests.noPermission")}
                </p>
              ) : joinRequests.length === 0 ? (
                <p className="text-sm text-text-muted">
                  {t("profile:groupInfo.joinRequests.empty")}
                </p>
              ) : (
                joinRequests.map((request) => {
                  const user =
                    membersByUserId[request.userId] ||
                    members.find((member) => member.id === request.userId);
                  const displayName = resolveMemberName(user) || request.userId;

                  return (
                    <div
                      key={request.id}
                      className="rounded-xl border border-border bg-surface-raised p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={user?.avatar}
                          alt={displayName}
                          size="md"
                          status={user?.status}
                          showStatus
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {displayName}
                          </p>
                          <p className="truncate text-xs text-text-muted">
                            @{user?.username || request.userId}
                          </p>
                          {request.note && (
                            <p className="mt-1 text-xs text-text-secondary">
                              {request.note}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
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
                })
              )}
            </div>
          )}
        </div>

        <div className="h-px bg-border mx-4" />

        <div className="py-2">
          {canDeleteConversation ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                void onDeleteConversation?.();
              }}
              className="w-full flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors text-danger"
            >
              <TrashIcon className="w-5 h-5" />
              <span className="text-sm">
                {t("profile:userProfile.deleteConversation")}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            disabled={isSubmitting || !canLeaveCurrentGroup}
            title={
              canLeaveCurrentGroup ? undefined : blockedOwnerLeaveTitle
            }
            onClick={() => void handleLeaveGroup()}
            className={clsx(
              "w-full flex items-center gap-4 px-4 py-3 text-danger transition-colors",
              canLeaveCurrentGroup
                ? "hover:bg-danger/10"
                : unavailableActionClass,
            )}
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span className="text-sm">{t("profile:groupInfo.leaveGroup")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupInfo;
