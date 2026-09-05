const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const dmsDocumentId = (value: unknown): string | null => typeof value === "string" && UUID.test(value) ? value : null;
export const dmsNotificationDocumentId = (notification: { type: string; targetId: string | null; metadata: Record<string, unknown> }): string | undefined => {
  const id = dmsDocumentId(notification.targetId);
  return notification.type === "SYSTEM" && id && notification.metadata.deepLink === `hacomchat://documents/${id}` ? id : undefined;
};
