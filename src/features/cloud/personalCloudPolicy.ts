/**
 * The intentional UI policy differences for a PERSONAL_CLOUD conversation.
 * Keeping them here lets shared Chat components remain the only implementation.
 */
export const personalCloudPolicy = {
  allowTextMessages: true,
  allowAttachments: true,
  allowReply: true,
  allowReaction: true,
  allowPin: true,
  allowForward: true,
  allowDownload: true,
  allowDelete: true,
  showPresence: false,
  showTypingIndicator: false,
  showMemberCount: false,
  showMemberActions: false,
  showCallActions: false,
  allowMentions: false,
  allowAddMember: false,
  allowLeaveConversation: false,
  suppressUnread: true,
  suppressPush: true,
  showCloudQuota: true,
  showCloudSummary: true,
} as const;

export const isPersonalCloudConversation = (conversation: { type?: unknown }): boolean =>
  String(conversation.type).toLowerCase() === 'personal_cloud';

/** Both entry points deliberately resolve to the same conversation surface. */
export const resolvePersonalCloudEntryPath = (
  conversation: { type?: unknown } | undefined,
): '/cloud' | null =>
  conversation && isPersonalCloudConversation(conversation) ? '/cloud' : null;

/**
 * chat-web-client's RoomType has not yet been extended with the backend's
 * PERSONAL_CLOUD value. Keep the compatibility boundary here until the shared
 * conversation enum is published, rather than scattering unsafe casts.
 */
export const personalCloudTimelineType = 'personal_cloud' as never;

export default personalCloudPolicy;

export const personalCloudPresentation = {
  title: 'Cloud c\u1ee7a t\u00f4i',
  subtitle: 'L\u01b0u tr\u1eef v\u00e0 \u0111\u1ed3ng b\u1ed9 d\u1eef li\u1ec7u gi\u1eefa c\u00e1c thi\u1ebft b\u1ecb',
  avatarVariant: 'personal-cloud',
  showPresence: false,
  showMemberCount: false,
  showCallActions: false,
  showGroupActions: false,
  showNotificationAction: false,
  showPinAction: false,
  showInfoPanel: true,
  infoPanelVariant: 'personal-cloud',
} as const;
