export interface ImageClickPayload {
  url: string;
  alt?: string;
  senderName?: string;
  senderAvatar?: string;
  sentAt?: Date | string;
  /** All images in the same message for gallery navigation */
  allImages?: ImageClickPayload[];
  /** Index of this image in allImages */
  initialIndex?: number;
  /** Conversation ID — used by ChatPage to pull full gallery from RTK cache */
  conversationId?: string;
  /** Groups images from same message for thumbnail panel (+N badge) */
  groupKey?: string;
}
