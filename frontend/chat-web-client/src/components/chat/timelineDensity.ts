import type { ChatDensity } from "../../stores/uiStore";
import type {
  ClusterBreakReason,
  MessageTimelineItem,
  TimelineSpacingToken,
} from "../../hooks/useMessageGrouping";

export type TimelineDensity = Exclude<ChatDensity, "auto">;

type TimelineDensityContract = {
  itemSpacing: Record<
    TimelineSpacingToken | "semanticPause" | "mediaCluster" | "timePause",
    string
  >;
  dateDivider: {
    outer: string;
    pill: string;
  };
  unreadDivider: {
    outer: string;
    line: string;
    pill: string;
  };
  cluster: {
    rowGap: string;
    senderLabel: string;
    replyPreview: string;
    forwardedBadge: string;
    meta: string;
    reactionOffset: string;
    threadOffset: string;
  };
};

const TIMELINE_DENSITY_CONTRACT: Record<
  TimelineDensity,
  TimelineDensityContract
> = {
  compact: {
    itemSpacing: {
      tight: "mb-0.5",
      related: "mb-1",
      cluster: "mb-3",
      semanticPause: "mb-2",
      mediaCluster: "mb-3",
      timePause: "mb-4",
    },
    dateDivider: {
      outer: "my-3",
      pill:
        "px-3 py-1 text-[10px] font-medium tracking-[0.01em]",
    },
    unreadDivider: {
      outer: "my-3 gap-2",
      line: "bg-primary/12",
      pill:
        "px-3 py-1 text-[10px] font-semibold tracking-[0.01em]",
    },
    cluster: {
      rowGap: "gap-1",
      senderLabel:
        "mb-1 block text-[11.5px] font-semibold leading-[1.15] text-primary",
      replyPreview: "",
      forwardedBadge: "mb-1 flex items-center gap-1 text-[11px] leading-4",
      meta:
        "mt-0.5 min-h-[1rem] gap-x-1.5 gap-y-0.5 px-0.5 text-[11px] leading-4",
      reactionOffset: "mt-0.5",
      threadOffset: "mt-0.5",
    },
  },
  comfortable: {
    itemSpacing: {
      tight: "mb-1",
      related: "mb-2",
      cluster: "mb-4",
      semanticPause: "mb-3",
      mediaCluster: "mb-4",
      timePause: "mb-5",
    },
    dateDivider: {
      outer: "my-3.5",
      pill:
        "px-3.5 py-1 text-[10px] font-medium tracking-[0.01em]",
    },
    unreadDivider: {
      outer: "my-3.5 gap-2.5",
      line: "bg-primary/14",
      pill:
        "px-3.5 py-1 text-[10px] font-semibold tracking-[0.01em]",
    },
    cluster: {
      rowGap: "gap-2",
      senderLabel:
        "mb-1 block text-[12px] font-semibold leading-[1.15] text-primary",
      replyPreview: "",
      forwardedBadge: "mb-1.5 flex items-center gap-1 text-[11px] leading-4",
      meta:
        "mt-0.5 min-h-[1rem] gap-x-1.5 gap-y-0.5 px-0.5 text-[11px] leading-4",
      reactionOffset: "mt-0.75",
      threadOffset: "mt-0.5",
    },
  },
  expanded: {
    itemSpacing: {
      tight: "mb-1",
      related: "mb-2",
      cluster: "mb-4",
      semanticPause: "mb-2.5",
      mediaCluster: "mb-4",
      timePause: "mb-5",
    },
    dateDivider: {
      outer: "my-4",
      pill: "px-4 py-1.5 text-[11px] font-medium tracking-[0.01em]",
    },
    unreadDivider: {
      outer: "my-4 gap-3",
      line: "bg-primary/16",
      pill: "px-4 py-1.5 text-[11px] font-semibold tracking-[0.01em]",
    },
    cluster: {
      rowGap: "gap-2",
      senderLabel:
        "mb-1 block text-[12px] font-semibold leading-[1.15] text-primary",
      replyPreview: "",
      forwardedBadge: "mb-1.5 flex items-center gap-1 text-[11px] leading-4",
      meta:
        "mt-0.75 min-h-[1rem] gap-x-1.5 gap-y-0.5 px-0.5 text-[11px] leading-4",
      reactionOffset: "mt-1",
      threadOffset: "mt-0.75",
    },
  },
};

export const resolveTimelineDensity = (
  density?: ChatDensity,
): TimelineDensity => {
  if (density === "compact" || density === "expanded") {
    return density;
  }

  return "comfortable";
};

export const getTimelineDensityContract = (
  density?: ChatDensity,
): TimelineDensityContract =>
  TIMELINE_DENSITY_CONTRACT[resolveTimelineDensity(density)];

const hasBreathingMediaFamily = (
  semanticFamily: MessageTimelineItem["semanticFamily"],
): boolean =>
  semanticFamily === "media" ||
  semanticFamily === "file" ||
  semanticFamily === "voice";

const isSemanticPauseReason = (
  clusterBreakAfter?: ClusterBreakReason,
): boolean =>
  clusterBreakAfter === "semantic_family" ||
  clusterBreakAfter === "reply_context" ||
  clusterBreakAfter === "status" ||
  clusterBreakAfter === "edited";

const isTimePauseReason = (
  clusterBreakAfter?: ClusterBreakReason,
): boolean =>
  clusterBreakAfter === "time_gap" || clusterBreakAfter === "visual_pause";

export const getTimelineItemSpacingClass = (
  item:
    | TimelineSpacingToken
    | Pick<MessageTimelineItem, "spacingToken" | "semanticFamily" | "clusterBreakAfter">,
  density?: ChatDensity,
): string => {
  const contract = getTimelineDensityContract(density);
  if (typeof item === "string") {
    return contract.itemSpacing[item];
  }

  if (isTimePauseReason(item.clusterBreakAfter)) {
    return contract.itemSpacing.timePause;
  }

  if (hasBreathingMediaFamily(item.semanticFamily)) {
    return item.spacingToken === "tight"
      ? contract.itemSpacing.related
      : contract.itemSpacing.mediaCluster;
  }

  if (isSemanticPauseReason(item.clusterBreakAfter)) {
    return contract.itemSpacing.semanticPause;
  }

  return contract.itemSpacing[item.spacingToken];
};
