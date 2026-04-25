export interface ContactProfileViewDetail {
  userId?: string;
}

export interface NotificationClickDetail {
  conversationId?: string;
  messageId?: string;
}

const CONTACT_PROFILE_VIEW_EVENT = "chat:contact:view-profile";
const NOTIFICATION_CLICK_EVENT = "chat:notification:clicked";

const dispatchWindowEvent = <TDetail>(name: string, detail: TDetail): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<TDetail>(name, { detail }));
};

const listenWindowEvent = <TDetail>(
  name: string,
  handler: (detail: TDetail) => void,
): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener: EventListener = (event) => {
    const customEvent = event as CustomEvent<TDetail>;
    handler(customEvent.detail);
  };

  window.addEventListener(name, listener);
  return () => {
    window.removeEventListener(name, listener);
  };
};

export const dispatchContactProfileView = (
  detail: ContactProfileViewDetail,
): void => {
  dispatchWindowEvent(CONTACT_PROFILE_VIEW_EVENT, detail);
};

export const listenForContactProfileView = (
  handler: (detail: ContactProfileViewDetail) => void,
): (() => void) => listenWindowEvent(CONTACT_PROFILE_VIEW_EVENT, handler);

export const dispatchNotificationClick = (
  detail: NotificationClickDetail,
): void => {
  dispatchWindowEvent(NOTIFICATION_CLICK_EVENT, detail);
};

export const listenForNotificationClick = (
  handler: (detail: NotificationClickDetail) => void,
): (() => void) => listenWindowEvent(NOTIFICATION_CLICK_EVENT, handler);
