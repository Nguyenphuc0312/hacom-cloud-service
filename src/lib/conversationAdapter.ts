import type {
  Conversation,
  ConversationSendRestrictionCode,
  ConversationSendRestrictionDto,
  MessageSummary,
  UserSummary,
} from "../types";
import { MessageStatus, MessageType, RoomType, UserStatus } from "../types";
import { asStringValue as asString } from "../utils/payloadGuards";
// Import THẲNG file thuần: qua "mentionAliasText" sẽ kéo theo `friendshipStore`
// → `services/api` → chính file này, thành vòng import và app trắng màn.
import { parseMentionDetails } from "../utils/parseMentionDetails";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object";


const asNullableString = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }
  return asString(value);
};

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const SEND_RESTRICTION_CODES: readonly ConversationSendRestrictionCode[] = [
  "FRIENDSHIP_REQUIRED",
  "UNFRIENDED",
  "PERMISSION_DENIED",
];

const asSendRestriction = (
  value: unknown,
): ConversationSendRestrictionDto | null | undefined => {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const code = asString(value.code);
  if (
    !code ||
    !SEND_RESTRICTION_CODES.includes(code as ConversationSendRestrictionCode)
  ) {
    return undefined;
  }
  return {
    code: code as ConversationSendRestrictionCode,
    ...(asString(value.reason) ? { reason: asString(value.reason) } : {}),
    ...(asString(value.message) ? { message: asString(value.message) } : {}),
  };
};

const asNullableDateValue = (
  value: unknown,
  fallback?: Date,
): Date | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
};

const toDate = (value: unknown, fallback: Date): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
};

const normalizeUserSummary = (value: unknown): UserSummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  const nestedUser = isRecord(value.user) ? value.user : null;
  const source = nestedUser ?? value;
  const id =
    asString(source.id) ??
    asString(source.userId) ??
    asString(source.user_id) ??
    asString(value.userId) ??
    asString(value.user_id);
  if (!id) {
    return null;
  }

  const username =
    asString(source.username) ??
    asString(source.employeeCode) ??
    asString(source.employee_code) ??
    asString(source.userName) ??
    asString(source.nickname) ??
    id;
  // Keep displayName as the raw value from the API. Do NOT fold fullName /
  // fullNameFromHR into it here — those are stored as separate fields so that
  // resolveUserDisplayName can apply the correct priority at display time (e.g.
  // skipping an email-shaped displayName and falling back to fullName).
  const displayName =
    asString(source.displayName) ??
    asString(source.display_name) ??
    username;
  const fullNameFromHr =
    asString(source.fullNameFromHR) ??
    asString(source.full_name_from_hr) ??
    asString(source.fullNameFromHr) ??
    asString(source.fullNameHR) ??
    asString(source.hrLegalName) ??
    null;
  const fullName =
    asString(source.fullName) ??
    asString(source.full_name) ??
    asString(source.name) ??
    null;
  const avatar = asString(source.avatar);
  const status = asString(source.status);

  return {
    id,
    username,
    displayName,
    fullName,
    fullNameFromHr,
    avatar,
    status: (status ?? UserStatus.OFFLINE) as UserSummary["status"],
    isBot: typeof source.isBot === "boolean" ? source.isBot : undefined,
  };
};

const normalizeParticipants = (
  source: UnknownRecord,
  otherUser: UserSummary | null,
): UserSummary[] => {
  const result = new Map<string, UserSummary>();
  const candidates = [
    source.participants,
    source.members,
    source.users,
    source.memberDetails,
  ];

  candidates.forEach((candidate) => {
    if (!Array.isArray(candidate)) {
      return;
    }

    candidate.forEach((item) => {
      const normalized = normalizeUserSummary(item);
      if (!normalized) {
        return;
      }
      result.set(normalized.id, normalized);
    });
  });

  if (otherUser) {
    result.set(otherUser.id, otherUser);
  }

  return Array.from(result.values());
};

const normalizeLastMessage = (
  source: UnknownRecord,
): MessageSummary | undefined => {
  const raw =
    (isRecord(source.lastMessage) ? source.lastMessage : null) ??
    (isRecord(source.last_message) ? source.last_message : null);
  if (!raw) {
    return undefined;
  }

  const sender = isRecord(raw.sender) ? raw.sender : null;
  const id =
    asString(raw.id) ??
    asString(raw.messageId) ??
    asString(raw._id) ??
    `last-${asString(source.id) ?? "message"}`;
  const senderId =
    asString(raw.senderId) ??
    asString(raw.userId) ??
    asString(sender?.id) ??
    "unknown-user";
  const senderName =
    asString(raw.senderName) ??
    asString(raw.displayName) ??
    asString(raw.display_name) ??
    asString(raw.fullNameFromHR) ??
    asString(raw.full_name_from_hr) ??
    asString(raw.employeeCode) ??
    asString(raw.employee_code) ??
    asString(raw.username) ??
    asString(sender?.displayName) ??
    asString(sender?.fullNameFromHR) ??
    asString(sender?.full_name_from_hr) ??
    asString(sender?.employeeCode) ??
    asString(sender?.employee_code) ??
    asString(sender?.username) ??
    "Unknown user";
  const type = asString(raw.type) ?? MessageType.TEXT;

  return {
    id,
    senderId,
    senderName,
    content: typeof raw.content === "string" ? raw.content : "",
    type: type as MessageSummary["type"],
    isDeleted: asBoolean(raw.isDeleted, false),
    createdAt: toDate(
      raw.createdAt ?? source.lastMessageAt ?? source.updatedAt,
      new Date(),
    ),
    // Ai được tag trong `content` — để preview sidebar đổi tag `@` sang "tên gợi
    // nhớ" của người xem. BE ship 30-07-26 (migration 071); tin cũ không có field
    // này thì preview hiện tên thật, đúng như trước.
    ...(() => {
      const mentions = parseMentionDetails(raw.mentions);
      return mentions.length > 0 ? { mentions } : {};
    })(),
    ...(asString(raw.sendState) ? { sendState: asString(raw.sendState) } : {}),
    ...(asString(raw.status) &&
    Object.values(MessageStatus).includes(asString(raw.status) as MessageStatus)
      ? { status: asString(raw.status) }
      : {}),
  } as MessageSummary;
};

const normalizeLastMessageStatus = (
  source: UnknownRecord,
  lastMessage?: MessageSummary,
): "pending" | "sent" | "failed" | null => {
  const explicitStatus = asString(source.lastMessageStatus)?.toLowerCase();
  if (
    explicitStatus === "pending" ||
    explicitStatus === "sent" ||
    explicitStatus === "failed"
  ) {
    return explicitStatus;
  }

  const messageRecord = lastMessage && isRecord(lastMessage)
    ? lastMessage as UnknownRecord
    : null;
  const sendState = asString(messageRecord?.sendState)?.toLowerCase();
  const status = asString(messageRecord?.status)?.toLowerCase();
  const isDeleted = asBoolean(messageRecord?.isDeleted);
  const lifecycleStatus = asString(messageRecord?.lifecycleStatus);

  if (isDeleted || lifecycleStatus === "recalled" || lifecycleStatus === "deleted_admin") {
    return null;
  }

  if (
    sendState === "sending" ||
    sendState === "queued" ||
    sendState === "retrying" ||
    status === MessageStatus.SENDING
  ) {
    return "pending";
  }

  if (sendState === "failed" || status === MessageStatus.FAILED) {
    return "failed";
  }

  if (lastMessage) {
    return "sent";
  }

  return null;
};

const toParticipantsCount = (
  participants: UserSummary[],
  source: UnknownRecord,
): number =>
  asNumber(source.participantCount) ??
  asNumber(source.memberCount) ??
  asNumber(source.membersCount) ??
  participants.length;

const extractConversationRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const directKeys = ["conversations", "rooms", "items", "data"] as const;
  for (const key of directKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  const nestedData = isRecord(payload.data) ? payload.data : null;
  if (nestedData) {
    for (const key of directKeys) {
      if (Array.isArray(nestedData[key])) {
        return nestedData[key];
      }
    }
  }

  return [];
};

export const normalizeRoomType = (
  value: unknown,
  participantCount?: number,
): RoomType => {
  const roomType = asString(value)?.toLowerCase();

  switch (roomType) {
    case RoomType.DIRECT:
      return RoomType.DIRECT;
    case RoomType.PRIVATE:
      return RoomType.PRIVATE;
    case RoomType.GROUP:
      return RoomType.GROUP;
    case "personal_cloud":
      // The API owns this type. Keep it intact until the shared RoomType
      // package is consumed by every deployed client.
      return "personal_cloud" as RoomType;
    case RoomType.CHANNEL:
      return RoomType.CHANNEL;
    case RoomType.PUBLIC:
      return RoomType.PUBLIC;
    case RoomType.SUPPORT:
      return RoomType.SUPPORT;
    case RoomType.BOT:
      return RoomType.BOT;
    default:
      if (participantCount === 2) {
        return RoomType.DIRECT;
      }
      if (typeof participantCount === "number" && participantCount > 2) {
        return RoomType.GROUP;
      }
      return RoomType.GROUP;
  }
};

export const isDirectConversation = (
  conversation:
    | Pick<
        Conversation,
        "type" | "participants" | "otherUser" | "participantCount"
      >
    | null
    | undefined,
): boolean => {
  if (!conversation) {
    return false;
  }

  const rawType = asString(conversation.type)?.toLowerCase();
  if (rawType && Object.values(RoomType).includes(rawType as RoomType)) {
    return rawType === RoomType.DIRECT || rawType === RoomType.PRIVATE;
  }

  const participantCount =
    asNumber(conversation.participantCount) ??
    (Array.isArray(conversation.participants)
      ? conversation.participants.length
      : undefined);
  const normalizedType = normalizeRoomType(conversation.type, participantCount);

  if (
    normalizedType === RoomType.DIRECT ||
    normalizedType === RoomType.PRIVATE
  ) {
    return true;
  }

  if (conversation.otherUser) {
    return true;
  }

  return participantCount === 2;
};

export const normalizeConversation = (
  payload: unknown,
): Conversation | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const id =
    asString(payload.id) ??
    asString(payload._id) ??
    asString(payload.roomId) ??
    asString(payload.conversationId);
  if (!id) {
    return null;
  }

  const otherUser = normalizeUserSummary(payload.otherUser);
  const participants = normalizeParticipants(payload, otherUser);
  const participantCount = toParticipantsCount(participants, payload);
  const normalizedType = normalizeRoomType(payload.type, participantCount);
  const lastMessage = normalizeLastMessage(payload);
  const lastMessageId =
    asString(payload.lastMessageId) ??
    asString(payload.last_message_id) ??
    lastMessage?.id ??
    null;
  const lastReadSeq = asNumber(payload.lastReadSeq) ?? 0;
  const updatedAt = toDate(
    payload.lastActivityAt ??
      payload.updatedAt ??
      payload.lastMessageAt ??
      payload.createdAt,
    new Date(),
  );
  const lastMessageSortAt =
    asNullableDateValue(
      payload.lastMessageSortAt ??
        payload.last_message_sort_at ??
        payload.lastMessageAt ??
        lastMessage?.createdAt ??
        payload.lastActivityAt ??
        payload.updatedAt,
      updatedAt,
    ) ?? updatedAt;
  const conversationName = asNullableString(payload.name);
  const displayName =
    asString(payload.displayName) ??
    (normalizedType === RoomType.DIRECT
      ? (otherUser?.displayName ?? otherUser?.username ?? conversationName)
      : conversationName) ??
    "";
  const displayAvatar =
    asNullableString(payload.displayAvatar) ??
    (normalizedType === RoomType.DIRECT
      ? (otherUser?.avatar ?? asNullableString(payload.avatar))
      : asNullableString(payload.avatar));
  const avatar = asNullableString(payload.avatar);
  const avatarFileId = asNullableString(payload.avatarFileId);
  const avatarVersion = asNumber(payload.avatarVersion);
  const pinnedAt = asNullableDateValue(payload.pinnedAt ?? payload.pinned_at);
  const rawLabelIds = Array.isArray(payload.labelIds)
    ? payload.labelIds
    : Array.isArray(payload.label_ids)
      ? payload.label_ids
      : [];
  const labelIds = rawLabelIds.filter(
    (labelId): labelId is string => typeof labelId === "string",
  );
  const resolvedParticipantCount =
    normalizedType === RoomType.DIRECT && otherUser && participantCount < 2
      ? 2
      : participantCount;

  const baseConversation: Conversation = {
    id,
    type: normalizedType,
    name:
      normalizedType === RoomType.DIRECT
        ? null
        : (conversationName ?? (displayName || null)),
    unreadCount: asNumber(payload.unreadCount) ?? asNumber(payload.unread) ?? 0,
    isPinned: Boolean(pinnedAt) || asBoolean(payload.isPinned, false),
    isMuted: asBoolean(payload.isMuted, false),
    isArchived: asBoolean(payload.isArchived, false),
    isBlocked: asBoolean(payload.isBlocked, false),
    participants,
    participantCount: resolvedParticipantCount,
    updatedAt,
    ...(avatar !== undefined ? { avatar } : {}),
    ...(avatarFileId !== undefined ? { avatarFileId } : {}),
    ...(avatarVersion !== undefined ? { avatarVersion } : {}),
    ...(otherUser ? { otherUser } : {}),
    ...(displayName ? { displayName } : {}),
    ...(displayAvatar !== undefined ? { displayAvatar } : {}),
    ...(lastMessage ? { lastMessage } : {}),
    ...(asString(payload.currentUserId)
      ? { currentUserId: asString(payload.currentUserId) }
      : {}),
    ...(asString(payload.createdBy)
      ? { createdBy: asString(payload.createdBy) }
      : {}),
    ...(payload.createdAt
      ? { createdAt: toDate(payload.createdAt, updatedAt) }
      : {}),
    ...(payload.lastMessageAt
      ? { lastMessageAt: toDate(payload.lastMessageAt, updatedAt) }
      : {}),
    ...(lastMessageSortAt ? { lastMessageSortAt } : {}),
    pinnedAt: pinnedAt ?? null,
    ...(asNumber(payload.pinOrder) !== undefined
      ? { pinOrder: asNumber(payload.pinOrder) }
      : asNumber(payload.pin_order) !== undefined
        ? { pinOrder: asNumber(payload.pin_order) }
        : { pinOrder: null }),
    labelIds,
    ...(lastMessageId ? { lastMessageId } : { lastMessageId: null }),
    ...(normalizeLastMessageStatus(payload, lastMessage) !== null
      ? { lastMessageStatus: normalizeLastMessageStatus(payload, lastMessage) }
      : {}),
    ...(payload.lastActivityAt
      ? { lastActivityAt: toDate(payload.lastActivityAt, updatedAt) }
      : {}),
    ...(asString(payload.directKey)
      ? { directKey: asString(payload.directKey) }
      : {}),
    ...(payload.joinedAt
      ? { joinedAt: toDate(payload.joinedAt, updatedAt) }
      : {}),
    ...(payload.lastReadAt
      ? { lastReadAt: toDate(payload.lastReadAt, updatedAt) }
      : {}),
    ...(lastReadSeq >= 0 ? { lastReadSeq } : {}),
    ...(asString(payload.lastReadMessageId)
      ? { lastReadMessageId: asString(payload.lastReadMessageId) }
      : {}),
    ...(asString(payload.peerUserId)
      ? { peerUserId: asString(payload.peerUserId) }
      : otherUser
        ? { peerUserId: otherUser.id }
        : {}),
    ...(asString(payload.firstUnreadMessageId)
      ? { firstUnreadMessageId: asString(payload.firstUnreadMessageId) }
      : {}),
    ...(payload.firstUnreadMessageAt
      ? { firstUnreadMessageAt: toDate(payload.firstUnreadMessageAt, updatedAt) }
      : {}),
    ...(asString(payload.membershipState)
      ? {
          membershipState: asString(payload.membershipState) as NonNullable<
            Conversation["membershipState"]
          >,
        }
      : {}),
    ...(asString(payload.currentUserRole)
      ? {
          currentUserRole: asString(payload.currentUserRole) as NonNullable<
            Conversation["currentUserRole"]
          >,
        }
      : {}),
    ...(typeof payload.allowMemberMessaging === "boolean"
      ? { allowMemberMessaging: payload.allowMemberMessaging }
      : {}),
    ...(typeof payload.canCurrentUserSend === "boolean"
      ? { canCurrentUserSend: payload.canCurrentUserSend }
      : {}),
    // Sanitize whenever the key is present: malformed payloads collapse to null
    // (no restriction info) instead of leaking through the raw payload spread.
    ...(payload.sendRestriction !== undefined
      ? { sendRestriction: asSendRestriction(payload.sendRestriction) ?? null }
      : {}),
    ...(asNumber(payload.summaryVersion) !== undefined
      ? { summaryVersion: asNumber(payload.summaryVersion) }
      : {}),
  };

  return {
    ...(payload as unknown as Conversation),
    ...baseConversation,
  };
};

export const normalizeConversationsPayload = (
  payload: unknown,
): Conversation[] =>
  extractConversationRows(payload)
    .map((room) => normalizeConversation(room))
    .filter((room): room is Conversation => room !== null);
