/**
 * Timeline V2 — public barrel.
 *
 * Phase 1 surface: types, the pure state machine + queue + classifier, the
 * owner hook, and the passthrough wrapper component. Phase 2 will add a
 * V2-native renderer.
 */

export { ChatTimelineV2 } from "./ChatTimelineV2";
export type { ChatTimelineV2Props } from "./ChatTimelineV2";

export { useChatScrollOwnerV2 } from "./useChatScrollOwnerV2";
export type {
  ChatScrollOwnerParams,
  ChatScrollOwnerResult,
} from "./useChatScrollOwnerV2";

export { ScrollCommandQueue, __resetCommandIdsForTest } from "./scrollCommandQueue";
export type {
  EnqueueResult,
  CommandQueueSnapshot,
  QueueGuards,
  ScrollCommandQueueOptions,
} from "./scrollCommandQueue";

export {
  initialContext,
  initialState,
  resolvePinnedToBottom,
  transition,
} from "./scrollStateMachine";
export type {
  CommandRequest,
  MachineContext,
  SideEffects,
  Transition,
} from "./scrollStateMachine";

export { classifyMessageChange } from "./messageChangeClassifier";

export { debugScroll, isChatScrollDebugEnabled } from "./scrollDebug";

export {
  createNoopAdapter,
} from "./virtualizerAdapter";
export type { ScrollVirtualizerAdapter } from "./virtualizerAdapter";

export type {
  CommandRejectReason,
  MessageChangeSummary,
  MessageChangeType,
  ScrollBehavior,
  ScrollCommand,
  ScrollEvent,
  ScrollReason,
  ScrollState,
  ScrollTarget,
  VisibleAnchor,
} from "./scrollTypes";
export {
  LOAD_OLDER_COOLDOWN_MS,
  PINNED_BOTTOM_ENTER_PX,
  PINNED_BOTTOM_LEAVE_PX,
  SCROLL_REASON_PRIORITY,
  SMOOTH_SCROLL_MAX_DISTANCE_PX,
  USER_SCROLL_IDLE_MS,
} from "./scrollTypes";
