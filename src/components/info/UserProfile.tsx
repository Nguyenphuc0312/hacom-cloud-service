import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  BriefcaseIcon,
  BuildingLibraryIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  EyeSlashIcon,
  IdentificationIcon,
  ArrowLeftIcon,
  ClockIcon,
  BellIcon,
  BellSlashIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  PencilSquareIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../common/Avatar";
import {
  Button,
  ConfirmDialog,
  DirectorySkeleton,
  Modal,
  PanelSection,
  ProfileSkeleton,
  toast,
} from "../ui";
import { EditProfileModal } from "../modals/EditProfileModal";
import {
  useAuthStore,
  useChatStore,
  usePresenceStore,
  resolveLivePresenceStatus,
} from "../../stores";
import { useMyProfile } from "../../features/profile/useMyProfile";
import {
  useGetUserProfileQuery,
  useSendMessageMutation,
} from "../../features/api/chatApi";
import {
  formatJoinDate,
  resolveEmploymentStatusLabel,
} from "../../features/profile/profileFormat";
import { useFriendship } from "../../hooks/useFriendship";
import { usePresence } from "../../hooks/usePresence";
import { extractApiError } from "../../lib/apiContract";
import type { UserProfileSummaryDto } from "@hacom/chat-shared-types/auth";
import type { Conversation, Message, UserSummary } from "../../types";
import { MessageType, UserStatus } from "../../types";
import { conversationApi, messageApi } from "../../services/api";
import { unwrapApiSuccess } from "../../lib/apiContract";
import { ReminderHistoryList } from "./ReminderHistoryList";
import { CollapsibleSection } from "./CollapsibleSection";
import { getUserDisplayName } from "../../utils/messageHelpers";
import { formatCalendarDate, formatCalendarDateTime } from "../../utils/formatTime";
import { SharedResourcesPreview } from "./shared-resources/SharedResourcesPreview";
import {
  SharedContentPanel,
  type SharedContentTab,
} from "./shared-resources/SharedContentModal";
import { resolvePublicResourceUrl } from "../../config";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { enrichUserProfile } from "../../services/enrichUserProfile";
import { friendshipApi } from "../../services/api";
import {
  type ChatSearchUser,
  isGroupMemberEligible,
  useChatUserSearch,
  useFriendSuggestions,
} from "../../features/chat/hooks/useChatUserSearch";
import {
  ReminderCreateDialog,
  type ReminderCreatePayload,
} from "../../features/chat/components/ReminderCreateDialog";
import { createGroupConversationUseCase } from "../../features/chat/usecases/createGroupConversation";
import { InfoQuickActionButton } from "./InfoQuickActionButton";
import { Pin } from "lucide-react";

type ProfileUser = Partial<UserSummary> & {
  id: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  phone?: string;
  createdAt?: string;
  fullNameFromHR?: string;
  full_name_from_hr?: string;
  employeeCode?: string;
  employee_code?: string;
  departmentName?: string;
  department_name?: string;
  department?: string;
  orgUnit?: string;
  org_unit?: string;
  company?: string;
  jobTitle?: string;
  job_title?: string;
  title?: string;
  position?: string;
  corporateEmail?: string;
  companyEmail?: string;
  emailFromHr?: string;
  email_from_hr?: string;
  employmentStatus?: string;
  dateOfJoining?: string;
};

type UserProfileConversationContext = "standalone" | "direct" | "group";

interface UserProfileProps {
  userId: string;
  currentUserId: string;
  conversationId?: string;
  initialUser?: ProfileUser | null;
  onClose: () => void;
  onStartConversation?: (userId: string) => void | Promise<void>;
  conversationContext?: UserProfileConversationContext;
  /** Jump the open timeline to a message (e.g. tapping a reminder in the history list). */
  onJumpToMessage?: (messageId: string) => void;
  className?: string;
}

const formatDisplayName = (user: ProfileUser | null | undefined): string => {
  if (!user) return "";

  return getUserDisplayName(user, { allowTechnicalFallback: true }) || user.id;
};

/** Map the latest chat-api user DTO to the panel's ProfileUser shape. */
const toProfileUser = (payload: UserProfileSummaryDto): ProfileUser => {
  // Extra fields present in real API response but not typed in UserProfileSummaryDto
  const raw = payload as unknown as Record<string, unknown>;
  return {
    // Spread first — picks up any extra fields the server sends (bio, firstName, lastName, createdAt…)
    ...(payload as Partial<ProfileUser>),
    id: payload.id,
    username: payload.username ?? undefined,
    displayName: payload.displayName ?? undefined,
    fullNameFromHR: payload.fullNameFromHr ?? undefined,
    // avatarUrl is canonical in UserProfileSummaryDto; avatar kept as runtime fallback
    avatar: resolvePublicResourceUrl(
      (raw["avatar"] as string | undefined) || payload.avatarUrl || undefined,
    ),
    phone: payload.phone ?? undefined,
    status: (payload.status as UserStatus) || UserStatus.OFFLINE,
    // HR canonical fields (UserProfileSummaryDto names — what GET /users/{id} returns)
    department: payload.department ?? undefined,
    position: payload.position ?? undefined,
    company: payload.company ?? undefined,
    employeeCode: payload.employeeCode ?? undefined,
    companyEmail: payload.companyEmail ?? undefined,
    employmentStatus: payload.employmentStatus ?? undefined,
    dateOfJoining: payload.dateOfJoining ?? undefined,
  };
};

const formatPresenceLabel = (
  status: UserStatus | undefined,
  lastSeenAt: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  if (status === UserStatus.ONLINE) {
    return t("common:status.online");
  }

  if (lastSeenAt) {
    return t("common:status.lastSeen", {
      time: formatCalendarDateTime(new Date(lastSeenAt)),
    });
  }

  return t("common:status.offline");
};

const formatRelationshipLabel = (
  kind:
    | "self"
    | "not_friend"
    | "outgoing_request"
    | "incoming_request"
    | "friend",
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  switch (kind) {
    case "self":
      return t("friends:relationship.self");
    case "friend":
      return t("friends:relationship.friend");
    case "incoming_request":
      return t("friends:relationship.incoming");
    case "outgoing_request":
      return t("friends:relationship.outgoing");
    default:
      return t("friends:relationship.notFriend");
  }
};

const badgeToneByRelationship: Record<string, string> = {
  self: "bg-[#1976D2]/10 text-[#1565C0]",
  friend: "bg-success/12 text-success",
  incoming_request: "bg-warning/12 text-warning",
  outgoing_request: "bg-surface-overlay text-text-secondary",
  not_friend: "bg-surface-overlay text-text-secondary",
};

const statCardClass =
  "app-page-subtle rounded-lg px-3 py-2.5 transition-colors";

type DirectInfoPanel = "main" | "reminders" | "storage" | "commonGroups";
type MuteDurationValue = "1h" | "4h" | "8am" | "until-open";

const DIRECT_FILTERS = [
  "Tất cả",
  "Khách hàng",
  "Gia đình",
  "Công việc",
  "Bạn bè",
  "Trả lời sau",
];

const removeDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const groupSearchUsers = (users: ChatSearchUser[]) => {
  const recent = users.slice(0, 5);
  const rest = users.slice(5);
  const groups: Array<{ label: string; items: ChatSearchUser[] }> = [];
  if (recent.length > 0) {
    groups.push({ label: "Trò chuyện gần đây", items: recent });
  }

  const byInitial = new Map<string, ChatSearchUser[]>();
  for (const user of rest) {
    const name = user.alias || user.displayName || user.username || "";
    const initial = removeDiacritics(name.trim().charAt(0).toUpperCase()) || "#";
    const label = /^[A-Z]$/.test(initial) ? initial : "#";
    byInitial.set(label, [...(byInitial.get(label) ?? []), user]);
  }

  for (const label of Array.from(byInitial.keys()).sort()) {
    groups.push({ label, items: byInitial.get(label) ?? [] });
  }

  return groups;
};

const getParticipantUserId = (participant: unknown): string | null => {
  if (!participant || typeof participant !== "object") return null;
  const record = participant as Record<string, unknown>;
  const raw = record.userId ?? record.id;
  return typeof raw === "string" && raw.trim() ? raw : null;
};

const isGroupConversation = (conversation: Conversation): boolean =>
  String(conversation.type).toLowerCase() === "group";

const getConversationTitle = (conversation: Conversation): string =>
  conversation.displayName ||
  (conversation as unknown as { title?: string }).title ||
  (conversation as unknown as { name?: string }).name ||
  "Nhóm";

const resolveMuteUntil = (value: MuteDurationValue): string | null => {
  if (value === "until-open") return null;
  const date = new Date();
  if (value === "1h") {
    date.setHours(date.getHours() + 1);
    return date.toISOString();
  }
  if (value === "4h") {
    date.setHours(date.getHours() + 4);
    return date.toISOString();
  }
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return date.toISOString();
};

const readUserValue = (
  u: ProfileUser | null | undefined,
  ...keys: string[]
): string | null => {
  if (!u) return null;
  const rec = u as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
};

export const UserProfile: React.FC<UserProfileProps> = ({
  userId,
  currentUserId,
  conversationId,
  initialUser,
  onClose,
  onStartConversation,
  conversationContext = "standalone",
  onJumpToMessage,
  className,
}) => {
  const { t } = useTranslation(["profile", "common", "friends"]);
  const authUser = useAuthStore((state) => state.user);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const selectedConversation = useChatStore((state) =>
    conversationId ? state.conversationById[conversationId] : undefined,
  );
  const conversations = useChatStore((state) => state.conversations);
  const updateConversation = useChatStore((state) => state.updateConversation);
  const addConversation = useChatStore((state) => state.addConversation);
  const removeConversation = useChatStore((state) => state.removeConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const resolvedInitialUser = React.useMemo(
    () =>
      initialUser && initialUser.id === userId
        ? initialUser
        : null,
    [initialUser, userId],
  );
  const isSelf = userId === currentUserId;
  // Same canonical self-profile resolver as Settings → Hồ sơ cá nhân, so both
  // surfaces always show identical values (HR over chat). Skipped for others.
  const myProfile = useMyProfile({ enabled: isSelf });

  const {
    data: latestUserProfile,
    isLoading: isLoadingLatestUser,
  } = useGetUserProfileQuery(userId, {
    skip: isSelf || !userId,
    refetchOnMountOrArgChange: true,
  });
  const navigate = useNavigate();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isUnfriendConfirmOpen, setIsUnfriendConfirmOpen] = React.useState(false);
  const [actingKey, setActingKey] = React.useState<string | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement | null>(null);

  // Reminder history for 1-1 DMs — in-chat reminder cards live as REMINDER messages.
  const [reminders, setReminders] = React.useState<Message[]>([]);
  const [remindersLoading, setRemindersLoading] = React.useState(false);
  const [sendMessage] = useSendMessageMutation();
  const [directPanel, setDirectPanel] = React.useState<DirectInfoPanel>("main");
  const [storageDefaultTab, setStorageDefaultTab] =
    React.useState<SharedContentTab>("media");
  const [isMuted, setIsMuted] = React.useState(false);
  const [isMuteDialogOpen, setIsMuteDialogOpen] = React.useState(false);
  const [isPinEntryOpen, setIsPinEntryOpen] = React.useState(false);
  const [isHiddenLocally, setIsHiddenLocally] = React.useState(false);
  const [isUpdatingHidden, setIsUpdatingHidden] = React.useState(false);
  const [isCreateReminderOpen, setIsCreateReminderOpen] = React.useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = React.useState(false);
  const [isDeletingConversation, setIsDeletingConversation] =
    React.useState(false);
  const [isDeleteHistoryConfirmOpen, setIsDeleteHistoryConfirmOpen] =
    React.useState(false);
  const isConversationPinned = Boolean(selectedConversation?.pinnedAt);
  const showReminders = conversationContext === "direct" && Boolean(conversationId);

  React.useEffect(() => {
    if (conversationContext !== "direct") return;
    const muteUntil = selectedConversation?.muteUntil
      ? new Date(selectedConversation.muteUntil).getTime()
      : null;
    const muted =
      selectedConversation?.notificationLevel === "mute" ||
      (typeof muteUntil === "number" && muteUntil > Date.now());
    setIsMuted(Boolean(muted));
  }, [
    conversationContext,
    selectedConversation?.muteUntil,
    selectedConversation?.notificationLevel,
  ]);

  React.useEffect(() => {
    if (conversationContext !== "direct") return;
    setIsHiddenLocally(Boolean(selectedConversation?.hiddenAt));
  }, [conversationContext, selectedConversation?.hiddenAt]);
  React.useEffect(() => {
    if (!showReminders || !conversationId) return;
    setRemindersLoading(true);
    void messageApi
      .searchMessages({ conversationId, type: MessageType.REMINDER, q: "", limit: 30 })
      .then((res) => setReminders(unwrapApiSuccess(res)?.messages ?? []))
      .catch(() => setReminders([]))
      .finally(() => setRemindersLoading(false));
  }, [showReminders, conversationId]);

  const currentAlias = useFriendshipStore((s) => s.friendByUserId[userId]?.alias ?? null);
  // Tag the transient editor state with its owner. A profile surface can swap
  // target users without unmounting; a plain boolean would expose A's draft on
  // B and could save it against B's friendship.
  const [editingAliasUserId, setEditingAliasUserId] = React.useState<string | null>(
    null,
  );
  const [aliasDraft, setAliasDraft] = React.useState<{
    userId: string;
    value: string;
  } | null>(null);
  const [savingAliasUserId, setSavingAliasUserId] = React.useState<string | null>(
    null,
  );
  const aliasInputRef = React.useRef<HTMLInputElement>(null);
  const aliasEditButtonRef = React.useRef<HTMLButtonElement>(null);

  const {
    refreshDirectory,
    getRelationshipState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    removeFriend,
  } = useFriendship();

  usePresence({
    userIds: !isSelf ? [userId] : undefined,
    enabled: !isSelf && Boolean(userId),
  });

  const livePresence = usePresenceStore((state) =>
    userId ? state.presenceMap[userId] : undefined,
  );

  // Self profile is derived from the canonical resolver (auth store + HR),
  // never the /users endpoint — keeping it identical to the Settings view.
  const selfProfile = React.useMemo<ProfileUser | null>(() => {
    if (!isSelf || !authUser) return null;
    return {
      ...(authUser as Partial<ProfileUser>),
      id: authUser.id,
      username: authUser.username,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      // HR-aware name so the self view matches Settings.
      displayName: myProfile.displayName,
      avatar: authUser.avatar,
      bio: authUser.bio,
      // HR fields override the chat copy when an HR profile is linked.
      phone: myProfile.phone ?? undefined,
      // Canonical new names (UserProfileSummaryDto) — checked first by readUserValue
      position: myProfile.jobTitle ?? undefined,
      department: myProfile.departmentName ?? undefined,
      company: myProfile.orgUnit ?? undefined,
      companyEmail: myProfile.corporateEmail ?? undefined,
      // Legacy aliases — fallback for readUserValue when new names absent
      title: myProfile.jobTitle ?? undefined,
      jobTitle: myProfile.jobTitle ?? undefined,
      departmentName: myProfile.departmentName ?? undefined,
      orgUnit: myProfile.orgUnit ?? undefined,
      corporateEmail: myProfile.corporateEmail ?? undefined,
      employeeCode: myProfile.employeeCode ?? undefined,
      employmentStatus: myProfile.employmentStatus ?? undefined,
      dateOfJoining: myProfile.dateOfJoining ?? undefined,
      createdAt: authUser.createdAt,
      status: authUser.status as UserStatus,
    };
  }, [authUser, isSelf, myProfile]);

  const latestOtherProfile = React.useMemo<ProfileUser | null>(() => {
    if (isSelf || !latestUserProfile || latestUserProfile.id !== userId) {
      return null;
    }
    return toProfileUser(latestUserProfile);
  }, [isSelf, latestUserProfile, userId]);

  // Single resolved user for rendering. For other users the latest API DTO wins;
  // snapshots passed by message/conversation/member surfaces are placeholders only.
  const user: ProfileUser | null = isSelf
    ? selfProfile
    : latestOtherProfile
      ? { ...latestOtherProfile, avatar: latestOtherProfile.avatar || resolvedInitialUser?.avatar }
      : (resolvedInitialUser ?? null);

  React.useEffect(() => {
    if (!isSelf) return;
    void refreshProfile().catch(() => null);
  }, [isSelf, refreshProfile]);

  React.useEffect(() => {
    if (isSelf || !userId || !latestUserProfile) return;
    const resolvedName = resolveUserDisplayName(latestUserProfile, {
      allowLegacyFallback: false,
    });
    if (resolvedName && resolvedName !== "Unknown user") {
      useEnrichedProfileStore.getState().setEnrichedName(userId, resolvedName);
    }
  }, [isSelf, latestUserProfile, userId]);

  React.useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  const displayName = formatDisplayName(user);
  const username = user?.username ? `@${user.username}` : null;
  const isLoading = !isSelf && Boolean(userId) && isLoadingLatestUser && !resolvedInitialUser;

  // Resolve employment fields once. Canonical BE field names
  // (position/department/company/companyEmail) are checked first so the panel
  // auto-populates the moment chat-api enriches /users/{id} from HR; the legacy
  // field names remain as fallback. See docs/USER_PROFILE_HR_SYNC_API.md.
  const jobTitleValue = readUserValue(
    user,
    "position",
    "title",
    "jobTitle",
    "job_title",
  );
  const departmentValue = readUserValue(
    user,
    "department",
    "departmentName",
    "department_name",
  );
  const companyValue = readUserValue(user, "company", "orgUnit", "org_unit");
  const corporateEmailValue = readUserValue(
    user,
    "companyEmail",
    "corporateEmail",
    "emailFromHr",
    "email_from_hr",
  );
  const employeeCodeValue = readUserValue(user, "employeeCode", "employee_code");
  const employmentStatusValue = resolveEmploymentStatusLabel(
    readUserValue(user, "employmentStatus"),
    t,
  );
  const joinDateValue = formatJoinDate(readUserValue(user, "dateOfJoining"));
  const hasEmploymentInfo = Boolean(
    jobTitleValue ||
      departmentValue ||
      companyValue ||
      corporateEmailValue ||
      employeeCodeValue ||
      employmentStatusValue ||
      joinDateValue,
  );
  // Live presence (WS) is the only source of truth — never `user.status`.
  // Self is always shown ONLINE (you are actively using the app and we don't
  // subscribe to our own presence channel).
  const effectiveStatus = isSelf
    ? UserStatus.ONLINE
    : resolveLivePresenceStatus(livePresence);
  const lastSeenAt = isSelf ? undefined : livePresence?.lastSeenAt;
  const relationship = getRelationshipState(userId, currentUserId);
  const capabilities = relationship.capabilities;

  const presenceLabel = formatPresenceLabel(effectiveStatus, lastSeenAt, t);
  const relationshipLabel = formatRelationshipLabel(relationship.kind, t);
  const shouldShowMessageAction =
    !isSelf &&
    Boolean(onStartConversation) &&
    (capabilities.canMessage || relationship.kind === "friend") &&
    conversationContext !== "direct";

  const handleAsyncAction = React.useCallback(
    async (
      key: string,
      action: () => Promise<boolean>,
      successMessage: string,
      failureMessage: string,
    ) => {
      setActingKey(key);
      try {
        const success = await action();
        if (!success) {
          toast.error(failureMessage);
          return;
        }
        toast.success(successMessage);
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || failureMessage);
      } finally {
        setActingKey(null);
      }
    },
    [],
  );

  const handleMessage = React.useCallback(async () => {
    if (!onStartConversation || isSelf) return;

    setActingKey("message");
    try {
      await Promise.resolve(onStartConversation(userId));
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("error:chat.startConversationFailed"));
    } finally {
      setActingKey(null);
    }
  }, [isSelf, onStartConversation, t, userId]);

  const aliasInput = aliasDraft?.userId === userId ? aliasDraft.value : "";
  const isEditingAlias =
    editingAliasUserId === userId && aliasDraft?.userId === userId;
  const isSavingAlias = savingAliasUserId === userId;

  const updateAliasInput = React.useCallback(
    (value: string) => {
      setAliasDraft((draft) =>
        draft?.userId === userId ? { ...draft, value } : draft,
      );
    },
    [userId],
  );

  const startEditAlias = React.useCallback(() => {
    if (relationship.kind !== "friend") return;
    setAliasDraft({ userId, value: currentAlias ?? displayName });
    setEditingAliasUserId(userId);
    setTimeout(() => aliasInputRef.current?.focus(), 0);
  }, [currentAlias, displayName, relationship.kind, userId]);

  const cancelEditAlias = React.useCallback(() => {
    setEditingAliasUserId((editingUserId) =>
      editingUserId === userId ? null : editingUserId,
    );
    setAliasDraft((draft) =>
      draft?.userId === userId ? null : draft,
    );
    setTimeout(() => aliasEditButtonRef.current?.focus(), 0);
  }, [userId]);

  const saveAlias = React.useCallback(async () => {
    const aliasTargetUserId = userId;
    const friendshipId =
      relationship.kind === "friend" ? relationship.friendshipId : undefined;
    if (
      !friendshipId ||
      editingAliasUserId !== aliasTargetUserId ||
      aliasDraft?.userId !== aliasTargetUserId ||
      savingAliasUserId === aliasTargetUserId
    ) {
      return;
    }

    const trimmed = aliasInput.trim();
    const newAlias = trimmed || null;
    setSavingAliasUserId(aliasTargetUserId);
    try {
      await friendshipApi.setAlias(friendshipId, newAlias);
      useFriendshipStore.getState().setLocalAlias(aliasTargetUserId, newAlias);
      if (!newAlias) enrichUserProfile(aliasTargetUserId);
      setEditingAliasUserId((editingUserId) =>
        editingUserId === aliasTargetUserId ? null : editingUserId,
      );
      setAliasDraft((draft) =>
        draft?.userId === aliasTargetUserId ? null : draft,
      );
      setTimeout(() => aliasEditButtonRef.current?.focus(), 0);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("friends:alias.saveFailed"));
    } finally {
      setSavingAliasUserId((savingUserId) =>
        savingUserId === aliasTargetUserId ? null : savingUserId,
      );
    }
  }, [
    aliasInput,
    aliasDraft,
    editingAliasUserId,
    relationship,
    savingAliasUserId,
    t,
    userId,
  ]);

  const commonGroups = React.useMemo(
    () =>
      conversations.filter((conversation) => {
        if (!isGroupConversation(conversation)) return false;
        const participantIds = new Set(
          (conversation.participants ?? [])
            .map((participant) => getParticipantUserId(participant))
            .filter((id): id is string => Boolean(id)),
        );
        return participantIds.has(userId) && participantIds.has(currentUserId);
      }),
    [conversations, currentUserId, userId],
  );

  const myCommonGroups = React.useMemo(
    () =>
      commonGroups.filter((conversation) => {
        const createdBy = (conversation as unknown as { createdBy?: string }).createdBy;
        const role = conversation.currentUserRole;
        return (
          createdBy === currentUserId ||
          role === "owner" ||
          role === "admin"
        );
      }),
    [commonGroups, currentUserId],
  );

  const handleToggleDirectPin = React.useCallback(async () => {
    if (!conversationId) return;
    const previousPinnedAt = selectedConversation?.pinnedAt ?? null;
    const previousPinOrder = selectedConversation?.pinOrder ?? null;
    const nextPinned = !isConversationPinned;

    updateConversation(conversationId, {
      pinnedAt: nextPinned ? new Date().toISOString() : null,
      pinOrder: nextPinned ? 0 : null,
      isPinned: nextPinned,
    } as Partial<Conversation>);

    try {
      const result = await conversationApi.setConversationPinned(
        conversationId,
        nextPinned,
      );
      updateConversation(conversationId, {
        pinnedAt: result.pinnedAt,
        pinOrder: result.pinOrder,
        isPinned: Boolean(result.pinnedAt),
      } as Partial<Conversation>);
      toast.success(nextPinned ? "Đã ghim hội thoại" : "Đã bỏ ghim hội thoại");
    } catch (error) {
      updateConversation(conversationId, {
        pinnedAt: previousPinnedAt,
        pinOrder: previousPinOrder,
        isPinned: isConversationPinned,
      } as Partial<Conversation>);
      toast.error(extractApiError(error).message || "Không thể cập nhật ghim");
    }
  }, [
    conversationId,
    isConversationPinned,
    selectedConversation?.pinOrder,
    selectedConversation?.pinnedAt,
    updateConversation,
  ]);

  const handleMuteConversation = React.useCallback(
    async (value: MuteDurationValue) => {
      if (!conversationId) return;
      const muteUntil = resolveMuteUntil(value);
      setIsMuted(true);
      setIsMuteDialogOpen(false);
      try {
        const result = await conversationApi.setConversationMuted(conversationId, {
          muted: true,
          muteUntil,
        });
        updateConversation(conversationId, {
          muteUntil: result.muteUntil,
          notificationLevel: result.notificationLevel,
        } as Partial<Conversation>);
        toast.success("Đã tắt thông báo hội thoại");
      } catch (error) {
        setIsMuted(false);
        toast.error(extractApiError(error).message || "Không thể tắt thông báo");
      }
    },
    [conversationId, updateConversation],
  );

  const handleUnmuteConversation = React.useCallback(async () => {
    if (!conversationId) return;
    setIsMuted(false);
    try {
      const result = await conversationApi.setConversationMuted(conversationId, {
        muted: false,
        muteUntil: null,
      });
      updateConversation(conversationId, {
        muteUntil: result.muteUntil,
        notificationLevel: result.notificationLevel,
      } as Partial<Conversation>);
      toast.success("Đã bật thông báo hội thoại");
    } catch (error) {
      setIsMuted(true);
      toast.error(extractApiError(error).message || "Không thể bật thông báo");
    }
  }, [conversationId, updateConversation]);

  const handleCreateDirectReminder = React.useCallback(
    async (payload: ReminderCreatePayload) => {
      if (!conversationId) return;
      const trimmed = payload.content.trim();
      if (!trimmed) return;

      const response = await sendMessage({
        conversationId,
        clientMessageId: `reminder-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`,
        content: trimmed,
        type: MessageType.REMINDER,
        localId: `temp-reminder-${Date.now()}`,
        reminder: {
          content: trimmed,
          remindAt: payload.reminderDate.toISOString(),
          repeat: payload.repeatType,
        },
        senderId: currentUserId,
      }).unwrap();

      const created = response;
      if (created) {
        setReminders((current) => [created, ...current]);
      }
      toast.success("Đã tạo nhắc hẹn");
      setIsCreateReminderOpen(false);
    },
    [conversationId, currentUserId, sendMessage],
  );

  const handleCreateGroupFromDirect = React.useCallback(
    async (name: string, memberIds: string[]) => {
      const uniqueMemberIds = Array.from(new Set([userId, ...memberIds]));
      const response = await createGroupConversationUseCase({
        name,
        memberIds: uniqueMemberIds,
      });
      const created = unwrapApiSuccess(response);
      addConversation(created);
      selectConversation(created.id);
      toast.success("Đã tạo nhóm trò chuyện");
      setIsCreateGroupOpen(false);
    },
    [addConversation, selectConversation, userId],
  );

  const handleDeleteConversationHistory = React.useCallback(async () => {
    if (!conversationId || isDeletingConversation) return;
    setIsDeletingConversation(true);
    try {
      await conversationApi.deleteConversation(conversationId);
      removeConversation(conversationId);
      selectConversation(null);
      toast.success("Đã xóa lịch sử trò chuyện");
      setIsDeleteHistoryConfirmOpen(false);
      onClose();
    } catch (error) {
      toast.error(extractApiError(error).message || "Không thể xóa lịch sử trò chuyện");
    } finally {
      setIsDeletingConversation(false);
    }
  }, [
    conversationId,
    isDeletingConversation,
    onClose,
    removeConversation,
    selectConversation,
  ]);

  const handleSetConversationHidden = React.useCallback(
    async (hidden: boolean) => {
      if (!conversationId || isUpdatingHidden) return;
      const previousHiddenAt = selectedConversation?.hiddenAt ?? null;
      const optimisticHiddenAt = hidden ? new Date().toISOString() : null;

      setIsUpdatingHidden(true);
      setIsHiddenLocally(hidden);
      updateConversation(conversationId, {
        hiddenAt: optimisticHiddenAt,
      } as Partial<Conversation>);

      try {
        const result = await conversationApi.setConversationHidden(
          conversationId,
          hidden,
        );
        updateConversation(conversationId, {
          hiddenAt: result.hiddenAt,
        } as Partial<Conversation>);

        if (hidden) {
          removeConversation(conversationId);
          selectConversation(null);
          onClose();
        }

        toast.success(hidden ? "Đã ẩn trò chuyện" : "Đã bỏ ẩn trò chuyện");
      } catch (error) {
        setIsHiddenLocally(Boolean(previousHiddenAt));
        updateConversation(conversationId, {
          hiddenAt: previousHiddenAt,
        } as Partial<Conversation>);
        toast.error(extractApiError(error).message || "Không thể cập nhật ẩn trò chuyện");
      } finally {
        setIsUpdatingHidden(false);
      }
    },
    [
      conversationId,
      isUpdatingHidden,
      onClose,
      removeConversation,
      selectConversation,
      selectedConversation?.hiddenAt,
      updateConversation,
    ],
  );

  const renderActions = () => {
    if (relationship.kind === "self") {
      return (
        <div className="flex gap-2">
          <Button
            ref={editButtonRef}
            type="button"
            variant="brand"
            fullWidth
            leftIcon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={() => setIsEditOpen(true)}
          >
            {t("profile:editProfileModal.title")}
          </Button>
        </div>
      );
    }

    if (relationship.kind === "friend") {
      // The "unfriend" action is rendered separately at the bottom of the
      // panel (centered, danger color) — here we only surface the message CTA.
      if (!shouldShowMessageAction) return null;

      return (
        <div className="space-y-2">
          <Button
            type="button"
            variant="brand-yellow"
            fullWidth
            leftIcon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
            isLoading={actingKey === "message"}
            onClick={() => void handleMessage()}
          >
            {t("friends:message")}
          </Button>
        </div>
      );
    }

    if (relationship.kind === "incoming_request") {
      return (
        <div className="space-y-2">
          {capabilities.canAccept ? (
            <Button
              type="button"
              variant="brand"
              fullWidth
              isLoading={actingKey === "accept"}
              onClick={() =>
                void handleAsyncAction(
                  "accept",
                  () => acceptFriendRequest(relationship.requestId),
                  t("friends:requestAccepted"),
                  t("friends:actionFailed"),
                )
              }
            >
              {t("friends:accept")}
            </Button>
          ) : null}
          {capabilities.canDecline ? (
            <Button
              type="button"
              variant="brand-outline"
              fullWidth
              isLoading={actingKey === "decline"}
              onClick={() =>
                void handleAsyncAction(
                  "decline",
                  () => rejectFriendRequest(relationship.requestId),
                  t("friends:requestRejected"),
                  t("friends:actionFailed"),
                )
              }
            >
              {t("friends:reject")}
            </Button>
          ) : null}
        </div>
      );
    }

    if (relationship.kind === "outgoing_request") {
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-border/70 bg-surface-overlay px-3 py-2 text-sm text-text-secondary">
            {t("friends:relationship.outgoing")}
          </div>
          {capabilities.canCancel ? (
            <Button
              type="button"
              fullWidth
              variant="brand-outline"
              isLoading={actingKey === "cancel"}
              onClick={() =>
                void handleAsyncAction(
                  "cancel",
                  () => cancelFriendRequest(relationship.requestId),
                  t("friends:requestCancelled"),
                  t("friends:actionFailed"),
                )
              }
            >
              {t("friends:sentRequests.cancel")}
            </Button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {capabilities.canSendRequest ? (
          <Button
            type="button"
            variant="brand"
            fullWidth
            leftIcon={<UserPlusIcon className="h-4 w-4" />}
            isLoading={actingKey === "add"}
            onClick={() =>
              void handleAsyncAction(
                "add",
                () => sendFriendRequest(userId),
                t("friends:requestSent"),
                t("friends:actionFailed"),
              )
            }
          >
            {t("friends:addFriend")}
          </Button>
        ) : null}
      </div>
    );
  };

  if (conversationContext === "direct" && conversationId) {
    const directTitle = currentAlias || displayName || "Thông tin hội thoại";

    return (
      <>
        <div
          className={clsx(
            "flex h-full flex-col bg-[hsl(var(--chat-panel-bg))]",
            className,
          )}
        >
          {directPanel === "storage" ? (
            <SharedContentPanel
              conversationId={conversationId}
              defaultTab={storageDefaultTab}
              onBack={() => setDirectPanel("main")}
              onJumpToMessage={onJumpToMessage}
            />
          ) : directPanel === "reminders" ? (
            <DirectReminderPanel
              reminders={reminders}
              loading={remindersLoading}
              onBack={() => setDirectPanel("main")}
              onCreate={() => setIsCreateReminderOpen(true)}
              onJumpToMessage={onJumpToMessage}
              onOpenCalendar={() => navigate("/calendar")}
            />
          ) : directPanel === "commonGroups" ? (
            <CommonGroupsPanel
              groups={commonGroups}
              myGroups={myCommonGroups}
              onBack={() => setDirectPanel("main")}
              onAddToGroup={() => setIsCreateGroupOpen(true)}
            />
          ) : (
            <DirectConversationInfoPanel
              user={user}
              conversationId={conversationId}
              displayName={directTitle}
              avatarAlt={displayName}
              effectiveStatus={effectiveStatus}
              isMuted={isMuted}
              isPinned={isConversationPinned}
              isHidden={isHiddenLocally}
              commonGroupCount={commonGroups.length}
              onClose={onClose}
              isEditingAlias={isEditingAlias}
              aliasInput={aliasInput}
              aliasInputRef={aliasInputRef}
              aliasEditButtonRef={aliasEditButtonRef}
              isSavingAlias={isSavingAlias}
              onAliasInputChange={updateAliasInput}
              onSaveAlias={() => void saveAlias()}
              onCancelAlias={cancelEditAlias}
              onEditAlias={relationship.kind === "friend" ? startEditAlias : undefined}
              onToggleMute={() =>
                isMuted ? void handleUnmuteConversation() : setIsMuteDialogOpen(true)
              }
              onTogglePin={() => void handleToggleDirectPin()}
              onCreateGroup={() => setIsCreateGroupOpen(true)}
              onOpenReminders={() => setDirectPanel("reminders")}
              onOpenCommonGroups={() => setDirectPanel("commonGroups")}
              onOpenStorage={(tab) => {
                setStorageDefaultTab(tab);
                setDirectPanel("storage");
              }}
              onJumpToMessage={onJumpToMessage}
              onToggleHidden={() =>
                isHiddenLocally
                  ? void handleSetConversationHidden(false)
                  : setIsPinEntryOpen(true)
              }
              hiddenUpdating={isUpdatingHidden}
              onDeleteHistory={() => setIsDeleteHistoryConfirmOpen(true)}
            />
          )}
        </div>

        <MuteConversationDialog
          isOpen={isMuteDialogOpen}
          onClose={() => setIsMuteDialogOpen(false)}
          onConfirm={(value) => void handleMuteConversation(value)}
        />

        <PinEntryDialog
          isOpen={isPinEntryOpen}
          onClose={() => setIsPinEntryOpen(false)}
          onConfirm={() => {
            setIsPinEntryOpen(false);
            void handleSetConversationHidden(true);
          }}
        />

        <CreateDirectGroupDialog
          isOpen={isCreateGroupOpen}
          initialUser={{
            id: userId,
            displayName: displayName,
            username: user?.username,
            avatarUrl: user?.avatar,
          }}
          currentUserId={currentUserId}
          onClose={() => setIsCreateGroupOpen(false)}
          onCreateGroup={handleCreateGroupFromDirect}
        />

        <ReminderCreateDialog
          isOpen={isCreateReminderOpen}
          onClose={() => setIsCreateReminderOpen(false)}
          onSubmit={(payload) => void handleCreateDirectReminder(payload)}
        />

        <ConfirmDialog
          isOpen={isDeleteHistoryConfirmOpen}
          onClose={() => {
            if (!isDeletingConversation) setIsDeleteHistoryConfirmOpen(false);
          }}
          onConfirm={() => void handleDeleteConversationHistory()}
          title="Xóa lịch sử trò chuyện"
          message="Bạn có chắc muốn xóa lịch sử trò chuyện này trên thiết bị của mình?"
          confirmText="Xóa"
          variant="danger"
          isLoading={isDeletingConversation}
        />
      </>
    );
  }

  return (
    <>
      <div className={clsx("flex h-full flex-col bg-[hsl(var(--chat-panel-bg))]", className)}>
        <div className="app-page-header flex items-center justify-between px-4 py-2.5">
          <div>
            <h3 className="text-title-sm text-text-primary">
              {isSelf
                ? t("friends:relationship.self")
                : t("profile:userProfile.title")}
            </h3>
          </div>

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
          {isLoading && !user ? (
            <ProfileSkeleton />
          ) : (
            <div className="space-y-4 px-4 py-4">
              <PanelSection className="rounded-2xl border-transparent bg-[hsl(var(--chat-panel-bg))] px-4 py-4 shadow-none">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Avatar
                    src={user?.avatar}
                    alt={displayName}
                    size="2xl"
                    status={effectiveStatus}
                    showStatus
                  />

                  <div className="w-full min-w-0 space-y-1.5">
                    {isEditingAlias ? (
                      <AliasEditor
                        value={aliasInput}
                        inputRef={aliasInputRef}
                        isSaving={isSavingAlias}
                        variant="profile"
                        onChange={updateAliasInput}
                        onSave={() => void saveAlias()}
                        onCancel={cancelEditAlias}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <h2 className="text-2xl font-semibold text-text-primary">
                          {currentAlias || displayName}
                        </h2>
                        {relationship.kind === "friend" && (
                          <button
                            type="button"
                            ref={aliasEditButtonRef}
                            onClick={startEditAlias}
                            aria-label={t("friends:alias.editTitle")}
                            title={t("friends:alias.editTitle")}
                            className="icon-button-surface h-9 w-9 opacity-50 transition-opacity hover:opacity-100"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span
                          className={clsx(
                            "inline-flex rounded-full px-2.5 py-1 text-caption font-medium",
                            badgeToneByRelationship[relationship.kind],
                          )}
                        >
                          {relationshipLabel}
                        </span>
                      </div>
                    )}
                    {currentAlias && !isEditingAlias && (
                      <p className="text-body-sm text-text-muted">
                        {t("friends:alias.realName")} {displayName}
                      </p>
                    )}

                    {username && (
                      <p className="truncate text-body-sm text-text-secondary">
                        {username}
                      </p>
                    )}

                    {jobTitleValue && (
                      <p className="truncate text-body-sm font-medium text-text-primary">
                        {jobTitleValue}
                      </p>
                    )}

                    {(departmentValue || companyValue) && (
                      <p className="truncate text-body-sm text-text-muted">
                        {[departmentValue, companyValue]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}

                    <p
                      className={clsx(
                        "text-body-sm",
                        effectiveStatus === UserStatus.ONLINE
                          ? "text-success"
                          : "text-text-secondary",
                      )}
                    >
                      {presenceLabel}
                    </p>

                    <p className="mx-auto max-w-sm text-body-sm leading-6 text-text-secondary">
                      {user?.bio?.trim() ||
                        (isSelf
                          ? t("profile:userProfile.emptyBioSelf")
                          : t("profile:userProfile.emptyBioOther"))}
                    </p>
                  </div>
                </div>
              </PanelSection>

              <section className="space-y-3">{renderActions()}</section>

              {(user?.phone || user?.createdAt) && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {user?.phone ? (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <PhoneIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:editProfileModal.phone")}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {user.phone}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {user?.createdAt ? (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <CalendarDaysIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("friends:joined")}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {formatCalendarDate(new Date(user.createdAt))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {hasEmploymentInfo && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {jobTitleValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BriefcaseIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.jobTitle", { defaultValue: "Chức danh" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {jobTitleValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {departmentValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BuildingOffice2Icon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.departmentName", { defaultValue: "Phòng ban" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {departmentValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {companyValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BuildingLibraryIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.orgUnit", { defaultValue: "Công ty" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {companyValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {corporateEmailValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <EnvelopeIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0]" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.corporateEmail", { defaultValue: "Email công ty" })}
                          </p>
                          <p className="mt-1 break-all text-sm text-text-primary">
                            {corporateEmailValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {employeeCodeValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <IdentificationIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.employeeCode", { defaultValue: "Mã nhân viên" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {employeeCodeValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {employmentStatusValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <CheckBadgeIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.employmentStatus", { defaultValue: "Trạng thái nhân sự" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {employmentStatusValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {joinDateValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <CalendarDaysIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.joinDate", { defaultValue: "Ngày vào làm" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {joinDateValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {conversationContext === "direct" && conversationId && (
                <section className="space-y-2">
                  <SharedResourcesPreview
                    conversationId={conversationId}
                    onJumpToMessage={onJumpToMessage}
                  />
                </section>
              )}

              {showReminders && (
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
              )}

              {relationship.kind === "friend" && capabilities.canUnfriend && (
                <section className="flex justify-center pt-2">
                  <Button
                    type="button"
                    variant="danger"
                    isLoading={actingKey === "unfriend"}
                    onClick={() => setIsUnfriendConfirmOpen(true)}
                  >
                    {t("friends:unfriend")}
                  </Button>
                </section>
              )}

            </div>
          )}
        </div>
      </div>

      {isSelf && (
        <EditProfileModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          restoreFocusRef={editButtonRef}
        />
      )}

      <ConfirmDialog
        isOpen={isUnfriendConfirmOpen}
        onClose={() => {
          if (actingKey !== "unfriend") setIsUnfriendConfirmOpen(false);
        }}
        onConfirm={() => {
          if (relationship.kind !== "friend") {
            setIsUnfriendConfirmOpen(false);
            return;
          }
          const friendshipId = relationship.friendshipId;
          void handleAsyncAction(
            "unfriend",
            () => removeFriend(friendshipId),
            t("friends:unfriendSuccess"),
            t("friends:actionFailed"),
          ).finally(() => setIsUnfriendConfirmOpen(false));
        }}
        title={t("friends:unfriendConfirmTitle")}
        message={t("friends:unfriendConfirmMessage", { name: displayName })}
        confirmText={t("friends:unfriend")}
        variant="danger"
        isLoading={actingKey === "unfriend"}
      />
    </>
  );
};

const DirectPanelHeader: React.FC<{
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, onClose, right }) => {
  if (onBack) {
    return (
      <div className="app-page-header flex min-h-[var(--app-header-height)] shrink-0 items-center border-b border-border bg-surface px-4 py-2.5">
        <div className="flex w-10 justify-start">
          <button
            type="button"
            onClick={onBack}
            className="icon-button-surface h-9 w-9"
            aria-label="Quay lại"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
        </div>
        <h2 className="min-w-0 flex-1 truncate text-center text-title-sm text-text-primary">
          {title}
        </h2>
        <div className="flex w-10 justify-end">{right}</div>
      </div>
    );
  }

  return (
    <div className="app-page-header flex min-h-[var(--app-header-height)] shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-2.5">
      <h2 className="min-w-0 truncate text-title-sm text-text-primary">
        {title}
      </h2>
      <div className="flex shrink-0 justify-end">
        {right ??
          (onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="icon-button-surface h-9 w-9"
              aria-label="Đóng"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          ) : null)}
      </div>
    </div>
  );
};

const DirectActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}> = ({ icon, label, active = false, onClick }) => (
  <InfoQuickActionButton
    icon={icon}
    label={label}
    active={active}
    onClick={onClick}
  />
);

const DirectNavRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
}> = ({ icon, label, subtitle, danger = false, disabled = false, onClick, trailing }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || !onClick}
    className={clsx(
      "flex min-h-[52px] w-full items-center gap-3 bg-surface px-5 py-2 text-left transition-colors",
      onClick && !disabled ? "hover:bg-surface-hover" : "cursor-default",
      disabled && "opacity-50",
    )}
  >
    <span className={clsx("flex h-7 w-7 shrink-0 items-center justify-center [&_svg]:h-5 [&_svg]:w-5", danger ? "text-[#d91f1f]" : "text-text-primary")}>
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className={clsx("block truncate text-[15px]", danger ? "text-[#d91f1f]" : "text-text-primary")}>
        {label}
      </span>
      {subtitle ? (
        <span className="mt-0.5 block truncate text-[13px] text-text-muted">
          {subtitle}
        </span>
      ) : null}
    </span>
    {trailing}
  </button>
);

const DirectSectionHeader: React.FC<{
  title: string;
  open?: boolean;
  onToggle?: () => void;
}> = ({ title, open = true, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex h-[52px] w-full items-center justify-between bg-surface px-5 text-left"
  >
    <span className="text-[16px] font-semibold text-text-primary">{title}</span>
    {open ? (
      <ChevronDownIcon className="h-5 w-5 text-text-secondary" />
    ) : (
      <ChevronRightIcon className="h-5 w-5 text-text-secondary" />
    )}
  </button>
);

const AliasEditor: React.FC<{
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isSaving: boolean;
  variant: "profile" | "direct";
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({
  value,
  inputRef,
  isSaving,
  variant,
  onChange,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation(["friends", "common"]);
  const inputId = React.useId();
  const isDirect = variant === "direct";

  return (
    <div
      className={clsx(
        "flex flex-col items-center gap-3",
        isDirect ? "mt-4" : "py-1",
      )}
      aria-busy={isSaving}
    >
      <label className="sr-only" htmlFor={inputId}>
        {t("friends:alias.editTitle")}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !isSaving) {
            event.preventDefault();
            onSave();
          }
          if (event.key === "Escape" && !isSaving) {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder={t("friends:alias.placeholder")}
        maxLength={100}
        disabled={isSaving}
        className={clsx(
          "border-0 border-b-2 border-[#1565C0]/40 bg-transparent pb-1 text-center font-semibold text-text-primary placeholder:font-normal placeholder:text-text-muted/50 focus:border-[#1565C0] focus:outline-none disabled:opacity-50 transition-colors",
          isDirect
            ? "w-full max-w-[280px] text-base"
            : "w-full text-2xl",
        )}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#1565C0] px-4 py-1.5 text-sm font-medium text-[#E7E9EB] transition-colors hover:bg-[#1976D2] disabled:opacity-50"
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {t("common:actions.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-overlay px-4 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
          {t("common:actions.cancel")}
        </button>
      </div>
    </div>
  );
};

const DirectConversationInfoPanel: React.FC<{
  user: ProfileUser | null;
  conversationId: string;
  displayName: string;
  avatarAlt: string;
  effectiveStatus: UserStatus;
  isMuted: boolean;
  isPinned: boolean;
  isHidden: boolean;
  hiddenUpdating?: boolean;
  commonGroupCount: number;
  onClose: () => void;
  isEditingAlias: boolean;
  aliasInput: string;
  aliasInputRef: React.RefObject<HTMLInputElement | null>;
  aliasEditButtonRef: React.RefObject<HTMLButtonElement | null>;
  isSavingAlias: boolean;
  onAliasInputChange: (value: string) => void;
  onSaveAlias: () => void;
  onCancelAlias: () => void;
  onEditAlias?: () => void;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onCreateGroup: () => void;
  onOpenReminders: () => void;
  onOpenCommonGroups: () => void;
  onOpenStorage: (tab: SharedContentTab) => void;
  onJumpToMessage?: (messageId: string) => void;
  onToggleHidden: () => void;
  onDeleteHistory: () => void;
}> = ({
  user,
  conversationId,
  displayName,
  avatarAlt,
  effectiveStatus,
  isMuted,
  isPinned,
  isHidden,
  hiddenUpdating = false,
  commonGroupCount,
  onClose,
  isEditingAlias,
  aliasInput,
  aliasInputRef,
  aliasEditButtonRef,
  isSavingAlias,
  onAliasInputChange,
  onSaveAlias,
  onCancelAlias,
  onEditAlias,
  onToggleMute,
  onTogglePin,
  onCreateGroup,
  onOpenReminders,
  onOpenCommonGroups,
  onOpenStorage,
  onJumpToMessage,
  onToggleHidden,
  onDeleteHistory,
}) => {
  const [securityOpen, setSecurityOpen] = React.useState(true);
  const { t } = useTranslation(["friends"]);

  return (
    <>
      <DirectPanelHeader title="Thông tin hội thoại" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--chat-panel-bg))]">
        <section className="bg-surface px-5 pb-5 pt-6 text-center">
          <Avatar
            src={user?.avatar}
            alt={avatarAlt}
            size="xl"
            status={effectiveStatus}
            showStatus
          />
          {isEditingAlias ? (
            <AliasEditor
              value={aliasInput}
              inputRef={aliasInputRef}
              isSaving={isSavingAlias}
              variant="direct"
              onChange={onAliasInputChange}
              onSave={onSaveAlias}
              onCancel={onCancelAlias}
            />
          ) : (
            <div className="mt-4 flex items-center justify-center gap-1.5">
              <h3 className="line-clamp-2 max-w-[220px] text-base font-bold text-text-primary">
                {displayName}
              </h3>
              {onEditAlias ? (
                <button
                  ref={aliasEditButtonRef}
                  type="button"
                  onClick={onEditAlias}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={t("friends:alias.editTitle")}
                  title={t("friends:alias.editTitle")}
                >
                  <PencilSquareIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2">
            <DirectActionButton
              icon={isMuted ? <BellSlashIcon className="h-5 w-5" /> : <BellIcon className="h-5 w-5" />}
              label={isMuted ? "Bật thông báo" : "Tắt thông báo"}
              active={isMuted}
              onClick={onToggleMute}
            />
            <DirectActionButton
              icon={<Pin size={20} color="currentColor" strokeWidth={1.5} />}
              label={isPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}
              active={isPinned}
              onClick={onTogglePin}
            />
            <DirectActionButton
              icon={<UserPlusIcon className="h-5 w-5" />}
              label="Tạo nhóm trò chuyện"
              onClick={onCreateGroup}
            />
          </div>
        </section>

        <div className="h-2.5 bg-[#eef0f4]" />
        <section className="bg-surface py-1">
          <DirectNavRow
            icon={<ClockIcon className="h-7 w-7" />}
            label="Danh sách nhắc hẹn"
            onClick={onOpenReminders}
          />
          <DirectNavRow
            icon={<UserGroupIcon className="h-7 w-7" />}
            label={`${commonGroupCount} nhóm chung`}
            onClick={onOpenCommonGroups}
          />
        </section>

        <div className="h-2.5 bg-[#eef0f4]" />
        <SharedResourcesPreview
          conversationId={conversationId}
          variant="zalo"
          onOpenAll={onOpenStorage}
          onJumpToMessage={onJumpToMessage}
        />

        <div className="h-2.5 bg-[#eef0f4]" />
        <section className="bg-surface">
          <DirectSectionHeader
            title="Thiết lập bảo mật"
            open={securityOpen}
            onToggle={() => setSecurityOpen((value) => !value)}
          />
          {securityOpen ? (
            <DirectNavRow
              icon={<EyeSlashIcon className="h-6 w-6" />}
              label="Ẩn trò chuyện"
              onClick={onToggleHidden}
              disabled={hiddenUpdating}
              trailing={<ZaloSwitch checked={isHidden} />}
            />
          ) : null}
        </section>

        <div className="h-2.5 bg-[#eef0f4]" />
        <section className="bg-surface pb-7">
          <DirectNavRow
            icon={<TrashIcon className="h-6 w-6" />}
            label="Xóa lịch sử trò chuyện"
            danger
            onClick={onDeleteHistory}
          />
        </section>
      </div>
    </>
  );
};

const ZaloSwitch: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={clsx(
      "relative h-7 w-12 rounded-full transition-colors",
      checked ? "bg-[#0068ff]" : "bg-[#b9bcc2]",
    )}
  >
    <span
      className={clsx(
        "absolute top-1 h-5 w-5 rounded-full bg-white transition-transform",
        checked ? "translate-x-6" : "translate-x-1",
      )}
    />
  </span>
);

const DirectReminderPanel: React.FC<{
  reminders: Message[];
  loading: boolean;
  onBack: () => void;
  onCreate: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onOpenCalendar: () => void;
}> = ({ reminders, loading, onBack, onCreate, onJumpToMessage, onOpenCalendar }) => (
  <>
    <DirectPanelHeader
      title="Danh sách nhắc hẹn"
      onBack={onBack}
      right={
        <button
          type="button"
          onClick={onCreate}
          className="flex h-11 w-11 items-center justify-center rounded text-[#0068ff] hover:bg-surface-hover"
          aria-label="Tạo nhắc hẹn"
        >
          <PlusIcon className="h-8 w-8" />
        </button>
      }
    />
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-5 py-6">
      {reminders.length > 0 || loading ? (
        <ReminderHistoryList
          reminders={reminders}
          loading={loading}
          onJumpToMessage={onJumpToMessage}
          onOpenCalendar={onOpenCalendar}
        />
      ) : (
        <div className="flex flex-col items-center pt-2 text-center">
          <div className="flex h-44 w-44 items-center justify-center text-[#e6f0ff]">
            <CalendarDaysIcon className="h-40 w-40 stroke-[1.2]" />
          </div>
          <p className="mt-5 max-w-[260px] text-[17px] leading-7 text-text-secondary">
            Chưa có nhắc hẹn nào được chia sẻ trong hội thoại này
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-7 flex h-10 w-full items-center justify-center gap-2 rounded bg-[#e5f1ff] text-[20px] font-semibold text-[#005ae0] hover:bg-[#d8eaff]"
          >
            <ClockIcon className="h-5 w-5" />
            Tạo nhắc hẹn
          </button>
        </div>
      )}
    </div>
  </>
);

const CommonGroupsPanel: React.FC<{
  groups: Conversation[];
  myGroups: Conversation[];
  onBack: () => void;
  onAddToGroup: () => void;
}> = ({ groups, myGroups, onBack, onAddToGroup }) => {
  const [tab, setTab] = React.useState<"all" | "mine">("all");
  const visibleGroups = tab === "all" ? groups : myGroups;

  return (
    <>
      <DirectPanelHeader
        title="Nhóm chung"
        onBack={onBack}
        right={<button className="text-[18px] font-semibold text-text-primary">Chọn nhiều</button>}
      />
      <div className="flex h-[62px] shrink-0 border-b border-border bg-surface px-8">
        {[
          ["all", "Tất cả"],
          ["mine", "Nhóm của tôi"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as "all" | "mine")}
            className={clsx(
              "relative flex-1 text-[18px] font-semibold",
              tab === key ? "text-[#0068ff]" : "text-text-muted",
            )}
          >
            {label}
            {tab === key ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#0068ff]" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-7 py-4">
        {visibleGroups.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            Chưa có nhóm chung
          </p>
        ) : (
          visibleGroups.map((conversation) => (
            <div
              key={conversation.id}
              className="flex h-[78px] items-center gap-4"
            >
              <GroupAvatarStack conversation={conversation} />
              <p className="min-w-0 flex-1 truncate text-[18px] text-text-primary">
                {getConversationTitle(conversation)}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-border bg-surface px-7 py-4">
        <button
          type="button"
          onClick={onAddToGroup}
          className="flex h-10 w-full items-center justify-center gap-2 rounded bg-[#e1e5eb] text-[20px] font-semibold text-text-primary hover:bg-[#d9dee6]"
        >
          <UserPlusIcon className="h-5 w-5" />
          Thêm vào nhóm
        </button>
      </div>
    </>
  );
};

const GroupAvatarStack: React.FC<{ conversation: Conversation }> = ({ conversation }) => {
  const participants = conversation.participants ?? [];
  const first = participants[0] as unknown as { avatar?: string; avatarUrl?: string; name?: string; displayName?: string } | undefined;
  const second = participants[1] as unknown as { avatar?: string; avatarUrl?: string; name?: string; displayName?: string } | undefined;
  const count = conversation.participantCount ?? participants.length;

  return (
    <div className="relative h-12 w-12 shrink-0">
      <Avatar
        src={first?.avatar || first?.avatarUrl || conversation.displayAvatar || undefined}
        alt={first?.displayName || first?.name || getConversationTitle(conversation)}
        size="md"
      />
      {second ? (
        <div className="absolute -bottom-1 -right-1 rounded-full bg-surface">
          <Avatar
            src={second.avatar || second.avatarUrl}
            alt={second.displayName || second.name || ""}
            size="sm"
          />
        </div>
      ) : null}
      {count > 2 ? (
        <span className="absolute -bottom-2 -right-2 flex h-7 min-w-7 items-center justify-center rounded-full border border-border bg-[#eef1f5] px-1 text-xs font-semibold text-text-primary">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </div>
  );
};

const MuteConversationDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: MuteDurationValue) => void;
}> = ({ isOpen, onClose, onConfirm }) => {
  const [value, setValue] = React.useState<MuteDurationValue>("1h");
  const options: Array<[MuteDurationValue, string]> = [
    ["1h", "Trong 1 giờ"],
    ["4h", "Trong 4 giờ"],
    ["8am", "Cho đến 8:00 AM"],
    ["until-open", "Cho đến khi được mở lại"],
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      size="md"
      contentClassName="max-w-[502px] rounded"
      bodyClassName="p-0"
    >
      <DialogHeader title="Xác nhận" onClose={onClose} />
      <div className="px-6 py-5">
        <p className="mb-4 text-[17px] text-text-primary">
          Bạn có chắc muốn tắt thông báo hội thoại này:
        </p>
        <div className="space-y-3">
          {options.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[17px] text-text-primary">
              <input
                type="radio"
                checked={value === key}
                onChange={() => setValue(key)}
                className="h-5 w-5"
              />
              {label}
            </label>
          ))}
        </div>
        <DialogFooter
          cancelLabel="Hủy"
          confirmLabel="Đồng ý"
          onCancel={onClose}
          onConfirm={() => onConfirm(value)}
          confirmEnabled
        />
      </div>
    </Modal>
  );
};

const PinEntryDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ isOpen, onClose, onConfirm }) => {
  const [pin, setPin] = React.useState("");
  const inputs = React.useRef<Array<HTMLInputElement | null>>([]);

  React.useEffect(() => {
    if (!isOpen) {
      setPin("");
      return;
    }
    setTimeout(() => inputs.current[0]?.focus(), 0);
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      size="lg"
      contentClassName="max-w-[478px] rounded"
      bodyClassName="p-0"
    >
      <DialogHeader title="Nhập mã PIN để ẩn trò chuyện" onClose={onClose} />
      <div className="px-8 pb-16 pt-9 text-center">
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((index) => (
            <input
              key={index}
              ref={(node) => {
                inputs.current[index] = node;
              }}
              value={pin[index] ?? ""}
              maxLength={1}
              inputMode="numeric"
              onChange={(event) => {
                const digit = event.target.value.replace(/\D/g, "").slice(-1);
                const next = `${pin.slice(0, index)}${digit}${pin.slice(index + 1)}`.slice(0, 4);
                setPin(next);
                if (digit && index < 3) inputs.current[index + 1]?.focus();
                if (next.length === 4) onConfirm();
              }}
              className="h-[68px] w-[54px] rounded border border-border text-center text-2xl font-semibold focus:border-[#0068ff] focus:outline-none"
            />
          ))}
        </div>
        <p className="mt-8 text-[15px] text-text-primary">
          Quên mã PIN? Bạn phải{" "}
          <button type="button" className="text-[#0068ff] underline">
            cài đặt lại mã.
          </button>
        </p>
      </div>
    </Modal>
  );
};

const DialogHeader: React.FC<{ title: string; onClose: () => void }> = ({
  title,
  onClose,
}) => (
  <div className="flex h-[62px] items-center justify-between border-b border-border px-5">
    <h2 className="text-[20px] font-semibold text-text-primary">{title}</h2>
    <button
      type="button"
      onClick={onClose}
      className="flex h-10 w-10 items-center justify-center rounded text-text-primary hover:bg-surface-hover"
      aria-label="Đóng"
    >
      <XMarkIcon className="h-7 w-7" />
    </button>
  </div>
);

const DialogFooter: React.FC<{
  cancelLabel: string;
  confirmLabel: string;
  confirmEnabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ cancelLabel, confirmLabel, confirmEnabled, onCancel, onConfirm }) => (
  <div className="mt-8 flex justify-end gap-4">
    <button
      type="button"
      onClick={onCancel}
      className="h-12 rounded bg-[#e5e7eb] px-7 text-[17px] font-semibold text-text-primary hover:bg-[#dfe2e7]"
    >
      {cancelLabel}
    </button>
    <button
      type="button"
      onClick={onConfirm}
      disabled={!confirmEnabled}
      className={clsx(
        "h-12 rounded px-7 text-[17px] font-semibold text-white",
        confirmEnabled
          ? "bg-[#0068ff] hover:bg-[#005ae0]"
          : "cursor-not-allowed bg-[#9dc7ff] text-white/85",
      )}
    >
      {confirmLabel}
    </button>
  </div>
);

const CreateDirectGroupDialog: React.FC<{
  isOpen: boolean;
  initialUser: {
    id: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
  currentUserId: string;
  onClose: () => void;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
}> = ({ isOpen, initialUser, currentUserId, onClose, onCreateGroup }) => {
  const [groupName, setGroupName] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState("Tất cả");
  const [selectedById, setSelectedById] = React.useState<Record<string, ChatSearchUser>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isSearchActive = searchQuery.trim().length >= 2;
  const excludeUserIds = React.useMemo(
    () => [currentUserId, initialUser.id],
    [currentUserId, initialUser.id],
  );

  const { results, isLoading: isSearching, errorMessage, debouncedQuery } =
    useChatUserSearch(searchQuery, {
      enabled: isOpen && isSearchActive,
      limit: 60,
      excludeUserIds,
    });
  const { suggestions, isLoading: isFriendsLoading } = useFriendSuggestions({
    enabled: isOpen && !isSearchActive,
    limit: 80,
  });

  React.useEffect(() => {
    if (!isOpen) return;
    setGroupName("");
    setSearchQuery("");
    setActiveFilter("Tất cả");
    setSelectedById({
      [initialUser.id]: {
        id: initialUser.id,
        username: initialUser.username || initialUser.displayName || initialUser.id,
        displayName: initialUser.displayName,
        avatarUrl: initialUser.avatarUrl,
        isFriend: true,
        friendshipStatus: "accepted",
      } as ChatSearchUser,
    });
    setIsSubmitting(false);
  }, [initialUser, isOpen]);

  const users = React.useMemo(() => {
    const excluded = new Set(excludeUserIds);
    const source = isSearchActive ? results : suggestions;
    return source.filter((user) => !excluded.has(user.id));
  }, [excludeUserIds, isSearchActive, results, suggestions]);
  const groupedUsers = React.useMemo(() => groupSearchUsers(users), [users]);
  const selectedUsers = React.useMemo(
    () => Object.values(selectedById),
    [selectedById],
  );
  const loading = isSearchActive ? isSearching : isFriendsLoading;
  const canCreate = groupName.trim().length > 0 && selectedUsers.length > 0;

  const toggleUser = React.useCallback((user: ChatSearchUser) => {
    if (!isGroupMemberEligible(user)) return;
    setSelectedById((current) => {
      if (current[user.id]) {
        const next = { ...current };
        delete next[user.id];
        return next;
      }
      return { ...current, [user.id]: user };
    });
  }, []);

  const handleConfirm = React.useCallback(async () => {
    if (!canCreate || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCreateGroup(
        groupName.trim(),
        selectedUsers.map((user) => user.id),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [canCreate, groupName, isSubmitting, onCreateGroup, selectedUsers]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      size="xl"
      contentClassName="max-w-[652px] rounded"
      bodyClassName="p-0"
      footer={
        <div className="flex items-center justify-end gap-4 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-12 rounded bg-[#e5e7eb] px-7 text-[17px] font-semibold text-text-primary hover:bg-[#dfe2e7] disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canCreate || isSubmitting}
            className={clsx(
              "h-12 rounded px-7 text-[17px] font-semibold text-white",
              canCreate && !isSubmitting
                ? "bg-[#0068ff] hover:bg-[#005ae0]"
                : "cursor-not-allowed bg-[#9dc7ff] text-white/85",
            )}
          >
            Tạo nhóm
          </button>
        </div>
      }
    >
      <DialogHeader title="Tạo nhóm" onClose={onClose} />
      <div className="px-5 pt-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-muted"
            aria-label="Chọn ảnh nhóm"
          >
            <PhotoIcon className="h-6 w-6" />
          </button>
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="Nhập tên nhóm..."
            className="h-12 min-w-0 flex-1 border-0 border-b border-[#0068ff] bg-transparent text-[17px] text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>

        <div className="relative mt-5">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Nhập tên, số điện thoại, hoặc danh sách số điện thoại"
            className="h-12 w-full rounded-full border border-border bg-surface pl-12 pr-4 text-[17px] text-text-primary placeholder:text-text-muted focus:border-[#0068ff] focus:outline-none"
          />
        </div>

        <div className="mt-5 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
          {DIRECT_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={clsx(
                "h-8 shrink-0 rounded-full px-4 text-[15px] font-medium transition-colors",
                activeFilter === filter
                  ? "bg-[#0068ff] text-white"
                  : "bg-[#e4e7ec] text-text-secondary hover:bg-[#dce1e8]",
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-5 mt-4 border-t border-border" />
      <div className="grid h-[590px] grid-cols-[minmax(0,1fr)_230px] px-5">
        <div className="min-h-0 overflow-y-auto py-3 pr-4">
          {loading ? (
            <DirectorySkeleton count={7} />
          ) : errorMessage ? (
            <p className="py-3 text-sm text-danger">{errorMessage}</p>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">
              {debouncedQuery.trim().length >= 2
                ? "Không tìm thấy người phù hợp"
                : "Không có bạn bè phù hợp"}
            </p>
          ) : (
            groupedUsers.map((group) => (
              <div key={group.label}>
                <div className="px-1 py-3 text-[17px] font-semibold text-text-primary">
                  {group.label}
                </div>
                {group.items.map((user) => (
                  <SelectableContactRow
                    key={user.id}
                    user={user}
                    selected={Boolean(selectedById[user.id])}
                    disabled={!isGroupMemberEligible(user)}
                    onToggle={() => toggleUser(user)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
        <div className="my-3 min-h-0 border-l border-border pl-4">
          <div className="h-full rounded border border-border px-3 py-4">
            <p className="text-[17px] font-semibold text-text-primary">
              Đã chọn{" "}
              <span className="rounded bg-[#e5f1ff] px-1.5 text-[#0068ff]">
                {selectedUsers.length}/100
              </span>
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {selectedUsers.map((user) => {
                const name = user.displayName || user.username || user.id;
                return (
                  <span
                    key={user.id}
                    className="flex max-w-full items-center gap-2 rounded-full bg-[#dcebff] py-1 pl-1 pr-2 text-[15px] text-[#005ae0]"
                  >
                    <Avatar src={user.avatarUrl} alt={name} size="sm" />
                    <span className="min-w-0 max-w-[124px] truncate">{name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (user.id === initialUser.id) return;
                        setSelectedById((current) => {
                          const next = { ...current };
                          delete next[user.id];
                          return next;
                        });
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0068ff] text-white"
                      aria-label={`Bỏ chọn ${name}`}
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

const SelectableContactRow: React.FC<{
  user: ChatSearchUser;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}> = ({ user, selected, disabled, onToggle }) => {
  const name = user.alias || user.displayName || user.username || user.id;
  const secondary =
    disabled && !isGroupMemberEligible(user)
      ? "Chỉ bạn bè mới có thể thêm"
      : user.departmentName || user.employeeCode || "";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={clsx(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-[#0068ff] bg-[#0068ff] text-white"
            : "border-[#b8bec8] bg-surface text-transparent",
        )}
      >
        <CheckIcon className="h-4 w-4 stroke-[3]" />
      </span>
      <Avatar src={user.avatarUrl} alt={name} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-medium text-text-primary">
          {name}
        </span>
        {secondary ? (
          <span className="mt-0.5 block truncate text-[14px] text-text-muted">
            {secondary}
          </span>
        ) : null}
      </span>
    </button>
  );
};

export default UserProfile;
