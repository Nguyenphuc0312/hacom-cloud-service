/**
 * @fileoverview Hooks exports
 */

export { useAuth } from "./useAuth";
export { useLogout } from "./useLogout";
export { useWebSocket } from "./useWebSocket";
export { useMessageGrouping } from "./useMessageGrouping";
export { useAutoResizeTextarea } from "./useAutoResizeTextarea";
export { useTypingIndicator } from "./useTypingIndicator";
export { useSendMessage } from "./useSendMessage";
export { useAttachmentDownloadUrl } from "./useAttachmentDownloadUrl";
export { useFilePreview } from "./useFilePreview";
export { useDropZone } from "./useDropZone";
export { useUploadQueue } from "./useUploadQueue";
export {
  useDebounce,
  useDebouncedCallback,
  useThrottledCallback,
} from "./useDebounce";
export { useMessageSearch } from "./useMessageSearch";
export { usePinnedMessages } from "./usePinnedMessages";
export { useFriendship } from "./useFriendship";
export { usePresence } from "./usePresence";
export { useComposerAvailability } from "./useComposerAvailability";
export { useClickOutside } from "./useClickOutside";
export { useMobileViewportMetrics } from "./useMobileViewportMetrics";
export { useResendCooldown } from "./useResendCooldown";
export { useOtpInput } from "./useOtpInput";
export { useEmailVerificationChallenge } from "./useEmailVerificationChallenge";
export { useNotifications } from "./useNotifications";

// Phase 02: Thumbnail/Preview hooks
export { useBatchThumbnailUrl } from "./useBatchThumbnailUrl";
export { usePreviewUrl } from "./usePreviewUrl";
