/**
 * Timeline V2 — Phase 1+2 wrapper.
 *
 * Drop-in replacement for `<MessageList>` that:
 *   • renders the legacy MessageList,
 *   • mounts the V2 scroll owner alongside it,
 *   • Phase 2: wires a real DOM scroll adapter and a scroll-event bridge to
 *     the same outer element MessageList uses, so the V2 owner now sees
 *     real `scrollTop`/`scrollHeight`/`clientHeight` metrics and fresh
 *     `USER_SCROLL` events.
 *
 * Until the explicit handover is finished (steps #2–#4 of the Phase 2 plan
 * — replacing legacy `useChatScrollController` calls with V2 dispatches in
 *  MessageList), the bridge runs in OBSERVE-ONLY mode (`active=false`).
 * That guarantees flag-on never produces double-scrolls, because the
 * adapter's `scrollTo*` methods are not invoked (the V2 owner never enqueues
 * a command that would resolve to a real call) until step #4 lands and
 * legacy hands over.
 *
 * Rollback at any time: `VITE_CHAT_TIMELINE_V2_OWNER=false`.
 */

import React from "react";
import { MessageList } from "../../../components/chat/MessageList";
import type { TimelineV2EventFromLegacy } from "../../../components/chat/MessageList";
import type { Conversation, Message, Attachment } from "../../../types";
import type { ChatDensity } from "../../../stores/uiStore";
import type { ChatLayoutState } from "../../../utils/densityPolicy";
import type { UnreadTimelineMarker } from "../../../hooks/useMessageGrouping";
import { useConversationMessagesRTK } from "../hooks/useConversationMessagesRTK";
import { useChatScrollOwnerV2 } from "./useChatScrollOwnerV2";
import { createDomScrollAdapter, type DomScrollAdapter } from "./domScrollAdapter";
import { useScrollEventBridge } from "./useScrollEventBridge";
import { debugScroll, isChatScrollDebugEnabled } from "./scrollDebug";
import { isChatScrollOwnerV2DrivesEnabled } from "../config/experienceFlags";

/**
 * Public props are an exact superset of the legacy MessageList props so a
 * caller can flip from `<MessageList .../>` to `<ChatTimelineV2 .../>` with
 * a single substitution.
 */
export interface ChatTimelineV2Props {
  conversationId: string;
  conversationType: Conversation["type"];
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onInspect?: (message: Message) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  isInitialLoading?: boolean;
  historyLoadingState?: {
    stage:
      | "empty"
      | "partial_unread_bootstrap"
      | "partial_prefetch"
      | "authoritative_initial_window"
      | "paginating_older"
      | "live_realtime";
    isPartial: boolean;
  } | null;
  onLoadMore?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
  density?: ChatDensity;
  layoutState: ChatLayoutState;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  unreadMarker?: UnreadTimelineMarker | null;
  unreadRestoreSignature?: string | null;
  onUnreadRestoreConsumed?: (signature: string) => void;
  onReachedLatest?: (latestMessage: Message) => void;
  jumpToMessageId?: string | null;
  jumpRequestVersion?: number;
  onJumpHandled?: (messageId: string) => void;
  composerHeight?: number;
  className?: string;
}

export const ChatTimelineV2: React.FC<ChatTimelineV2Props> = (props) => {
  const { conversationId, currentUserId, isInitialLoading: parentIsInitialLoading } = props;

  // RTK Query dedupes by query key, so calling the same hook from both
  // ChatTimelineV2 and MessageList does NOT trigger a duplicate fetch.
  const {
    messages,
    hasMoreOlder,
    isFetching,
    loadOlder,
  } = useConversationMessagesRTK(conversationId);

  // Outer DOM ref — populated by MessageList via the additive `onOuterRef`
  // prop. Until MessageList mounts, the ref is null and all adapter
  // operations are harmless no-ops.
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  // The getter closes over `outerRef` but only reads `.current` at call
  // time — never during render. The strict `react-hooks/refs` lint rule
  // flags the `useState` lazy initialiser conservatively because it
  // cannot prove the captured callback isn't invoked during render. The
  // adapter only calls the getter from scrollTo* methods (event
  // handlers/effects) and from the bridge's RAF flush, so the disable
  // is safe.
  const getOuterElement = React.useCallback(() => outerRef.current, []);
  // eslint-disable-next-line react-hooks/refs
  const [adapter] = React.useState<DomScrollAdapter>(() =>
    createDomScrollAdapter(getOuterElement),
  );

  const handleOuterRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      outerRef.current = element;
      debugScroll("virtualizer_measure", {
        attached: element !== null,
      });
    },
    [],
  );

  const owner = useChatScrollOwnerV2({
    conversationId,
    currentUserId,
    messages,
    isInitialLoading: Boolean(parentIsInitialLoading),
    isFetchingOlder: isFetching,
    hasOlder: hasMoreOlder,
    loadOlder,
    adapter,
  });

  // Phase 2 cutover: bridge becomes ACTIVE only when the V2 owner is
  // driving scroll. Otherwise (Phase 1 / dogfood mode) it observes only.
  // Activating it in observe-only mode would be safe but adds dispatch
  // overhead for no benefit, so we gate it on the same flag that gates
  // legacy suppression — that way `active` and `suppressScrollWrites` are
  // always consistent.
  // Resolved per render: lets the runaway-command kill-switch flip drives
  // off mid-session, and lets Playwright addInitScript take effect.
  const drivesScroll = isChatScrollOwnerV2DrivesEnabled();
  useScrollEventBridge({
    getOuterElement,
    adapter,
    dispatch: owner.dispatch,
    active: drivesScroll,
  });

  // Forward legacy MessageList timeline events into the V2 owner. We only
  // consume them when V2 drives — otherwise the legacy controller is also
  // handling them and double-handling causes drift.
  const handleTimelineEvent = React.useCallback(
    (event: TimelineV2EventFromLegacy) => {
      if (!drivesScroll) return;
      switch (event.type) {
        case "anchor_captured":
          if (event.anchor) {
            // Use the real `index` from the legacy capture (it is the
            // virtualizer/threadRows index of the anchor row). The V2
            // owner's `preserve_after_prepend` will call
            // `scrollToIndex(index)` against the adapter, which resolves
            // back through the same getItemOffset the legacy capture
            // used — so the two stay in sync.
            owner.captureAnchor({
              messageKey: event.anchor.messageId ?? "__no_id__",
              index: event.anchor.index,
              offsetFromViewportTop: event.anchor.offsetFromTop,
            });
          } else {
            // anchor === null: legacy could not resolve a visible item.
            // Forward null so the state machine stays in detached/hold
            // mode rather than scrolling on a stale anchor.
            owner.captureAnchor(null);
          }
          break;
        case "media_resized":
          owner.dispatch({
            type: "MEDIA_RESIZED",
            deltaPx: event.deltaPx,
            at: Date.now(),
          });
          break;
      }
    },
    [drivesScroll, owner],
  );

  React.useEffect(() => {
    if (!isChatScrollDebugEnabled()) return;
    debugScroll("bottom_state_change", {
      state: owner.state,
      isPinnedToBottom: owner.isPinnedToBottom,
      pendingNewMessages: owner.pendingNewMessages,
    });
  }, [owner.state, owner.isPinnedToBottom, owner.pendingNewMessages]);

  return (
    <MessageList
      {...props}
      onOuterRef={handleOuterRef}
      suppressScrollWrites={drivesScroll}
      onTimelineEvent={handleTimelineEvent}
    />
  );
};

ChatTimelineV2.displayName = "ChatTimelineV2";

export default ChatTimelineV2;
