import { describe, expect, it } from "vitest";

import { getTimelineItemSpacingClass } from "./timelineDensity";

describe("timelineDensity spacing", () => {
  it("keeps same-sender text clusters tight in comfortable density", () => {
    expect(
      getTimelineItemSpacingClass(
        {
          spacingToken: "tight",
          semanticFamily: "text",
        },
        "comfortable",
      ),
    ).toBe("mb-1");
  });

  it("gives media rows more breathing room than regular clusters", () => {
    expect(
      getTimelineItemSpacingClass(
        {
          spacingToken: "cluster",
          semanticFamily: "media",
        },
        "comfortable",
      ),
    ).toBe("mb-4.5");
  });

  it("uses a medium semantic pause for reply-context breaks", () => {
    expect(
      getTimelineItemSpacingClass(
        {
          spacingToken: "cluster",
          semanticFamily: "text",
          clusterBreakAfter: "reply_context",
        },
        "compact",
      ),
    ).toBe("mb-2");
  });

  it("uses the largest intra-thread pause for real time gaps", () => {
    expect(
      getTimelineItemSpacingClass(
        {
          spacingToken: "related",
          semanticFamily: "text",
          clusterBreakAfter: "time_gap",
        },
        "expanded",
      ),
    ).toBe("mb-6");
  });
});
