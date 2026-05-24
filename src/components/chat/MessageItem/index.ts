/**
 * MessageItem Module Exports
 * Public API for the MessageItem component and related utilities
 * Follows barrel export pattern for clean imports
 */

// Main component
export { MessageItem } from "./MessageItem";
export { default } from "./MessageItem";

// Sub-components (for composition and testing)
export { MessageItemContent } from "./MessageItemContent";
export { MessageItemSelection } from "./MessageItemSelection";
export { MessageItemWrapper } from "./MessageItemWrapper";

// Types
export type {
  MessageItemProps,
  MessageItemContentProps,
  MessageItemSelectionProps,
  MessageItemWrapperProps,
} from "./types";

// Utilities
export {
  getAttachmentLayoutSignature,
  getReplyLayoutSignature,
  getForwardedSignature,
  getLayoutSensitiveSignature,
  resolveLiveMessage,
} from "./utils";
