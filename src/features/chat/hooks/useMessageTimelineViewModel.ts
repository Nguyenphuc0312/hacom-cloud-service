import { useMemo } from "react";
import type { Conversation, Message } from "../../../types";
import {
  useMessageGrouping,
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../../../hooks/useMessageGrouping";

interface UseMessageTimelineViewModelParams {
  messages: Message[];
  currentUserId: string;
  conversationType: Conversation["type"];
  unreadMarker?: UnreadTimelineMarker | null;
}

interface MessageTimelineViewModel {
  timelineItems: TimelineItem[];
}

export const useMessageTimelineViewModel = ({
  messages,
  currentUserId,
  conversationType,
  unreadMarker,
}: UseMessageTimelineViewModelParams): MessageTimelineViewModel => {
  const timelineItems = useMessageGrouping({
    messages,
    currentUserId,
    conversationType,
    unreadMarker,
  });

  return useMemo(
    () => ({
      timelineItems,
    }),
    [timelineItems],
  );
};

export default useMessageTimelineViewModel;
