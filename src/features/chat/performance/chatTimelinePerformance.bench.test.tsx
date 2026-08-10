import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomType, type Message } from "../../../types";
import { useConversationTimelineRows } from "../hooks/useConversationTimelineRows";
import { useConversationThreadRows } from "../hooks/useConversationThreadRows";

const CURRENT_USER_ID = "user-current";
const PEER_USER_ID = "user-peer";

const makeMessage = (index: number, createdAtBaseMs = Date.UTC(2026, 0, 1)): Message =>
  ({
    id: `message-${index}`,
    conversationId: "conversation-benchmark",
    senderId: index % 5 === 0 ? PEER_USER_ID : CURRENT_USER_ID,
    senderName: index % 5 === 0 ? "Peer User" : "Current User",
    content: `Benchmark message ${index}`,
    type: "text",
    status: "sent",
    createdAt: new Date(createdAtBaseMs + index * 30_000),
    updatedAt: new Date(createdAtBaseMs + index * 30_000).toISOString(),
    serverSeq: index + 1,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
    reactions: [],
    readBy: [],
    mentions: [],
    attachments: [],
  }) as Message;

const makeLongMessage = (
  index: number,
  createdAtBaseMs = Date.UTC(2026, 0, 1),
): Message =>
  makeMessage(index, createdAtBaseMs) as Message;

const makeMessages = (count: number, startIndex = 0): Message[] =>
  Array.from({ length: count }, (_, offset) => makeMessage(startIndex + offset));

const makeLongMessages = (count: number, startIndex = 0): Message[] =>
  Array.from({ length: count }, (_, offset) => ({
    ...makeLongMessage(startIndex + offset),
    content: `INFO block ${startIndex + offset}\n${"line=value\n".repeat(140)}`,
  }));

const useBenchmarkPipeline = (messages: Message[]) => {
  const timelineItems = useConversationTimelineRows({
    messages,
    currentUserId: CURRENT_USER_ID,
    conversationType: RoomType.DIRECT,
    unreadMarker: null,
  });
  const threadRows = useConversationThreadRows(timelineItems);
  return { timelineItems, threadRows };
};

const measure = <T,>(name: string, fn: () => T): { name: string; durationMs: number; value: T } => {
  const startedAt = performance.now();
  const value = fn();
  return {
    name,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    value,
  };
};

describe("chat timeline performance benchmark", () => {
  it("records baseline timeline derivation costs", () => {
    const results: Array<Record<string, number | string>> = [];
    const durations = new Map<string, number>();

    const open100 = measure("open_100", () =>
      renderHook(({ messages }) => useBenchmarkPipeline(messages), {
        initialProps: { messages: makeMessages(100) },
      }),
    );
    results.push({
      scenario: open100.name,
      durationMs: open100.durationMs,
      timelineRows: open100.value.result.current.timelineItems.length,
      threadRows: open100.value.result.current.threadRows.length,
    });
    durations.set(open100.name, open100.durationMs);
    open100.value.unmount();

    const open100Long = measure("open_100_long_messages", () =>
      renderHook(({ messages }) => useBenchmarkPipeline(messages), {
        initialProps: { messages: makeLongMessages(100) },
      }),
    );
    results.push({
      scenario: open100Long.name,
      durationMs: open100Long.durationMs,
      timelineRows: open100Long.value.result.current.timelineItems.length,
      threadRows: open100Long.value.result.current.threadRows.length,
    });
    durations.set(open100Long.name, open100Long.durationMs);
    open100Long.value.unmount();

    const messages10k = makeMessages(10_000);
    const open10k = measure("open_10k", () =>
      renderHook(({ messages }) => useBenchmarkPipeline(messages), {
        initialProps: { messages: messages10k },
      }),
    );
    results.push({
      scenario: open10k.name,
      durationMs: open10k.durationMs,
      timelineRows: open10k.value.result.current.timelineItems.length,
      threadRows: open10k.value.result.current.threadRows.length,
    });
    durations.set(open10k.name, open10k.durationMs);

    const open50k = measure("open_50k", () =>
      renderHook(({ messages }) => useBenchmarkPipeline(messages), {
        initialProps: { messages: makeMessages(50_000) },
      }),
    );
    results.push({
      scenario: open50k.name,
      durationMs: open50k.durationMs,
      timelineRows: open50k.value.result.current.timelineItems.length,
      threadRows: open50k.value.result.current.threadRows.length,
    });
    durations.set(open50k.name, open50k.durationMs);
    open50k.value.unmount();

    const append1 = [...messages10k, makeMessage(10_000)];
    const append1Measure = measure("append_1", () => {
      open10k.value.rerender({ messages: append1 });
      return open10k.value.result.current;
    });
    results.push({
      scenario: append1Measure.name,
      durationMs: append1Measure.durationMs,
      timelineRows: append1Measure.value.timelineItems.length,
      threadRows: append1Measure.value.threadRows.length,
    });
    durations.set(append1Measure.name, append1Measure.durationMs);

    const append10 = [
      ...append1,
      ...Array.from({ length: 10 }, (_, offset) => makeMessage(10_001 + offset)),
    ];
    const append10Measure = measure("append_10_burst", () => {
      open10k.value.rerender({ messages: append10 });
      return open10k.value.result.current;
    });
    results.push({
      scenario: append10Measure.name,
      durationMs: append10Measure.durationMs,
      timelineRows: append10Measure.value.timelineItems.length,
      threadRows: append10Measure.value.threadRows.length,
    });
    durations.set(append10Measure.name, append10Measure.durationMs);

    const older50 = [...makeMessages(50, -50), ...append10];
    const older50Measure = measure("load_older_50", () => {
      open10k.value.rerender({ messages: older50 });
      return open10k.value.result.current;
    });
    results.push({
      scenario: older50Measure.name,
      durationMs: older50Measure.durationMs,
      timelineRows: older50Measure.value.timelineItems.length,
      threadRows: older50Measure.value.threadRows.length,
    });
    durations.set(older50Measure.name, older50Measure.durationMs);

    const sameMessagesRerender = measure("same_messages_rerender_keypress_proxy", () => {
      open10k.value.rerender({ messages: older50 });
      return open10k.value.result.current;
    });
    results.push({
      scenario: sameMessagesRerender.name,
      durationMs: sameMessagesRerender.durationMs,
      timelineRows: sameMessagesRerender.value.timelineItems.length,
      threadRows: sameMessagesRerender.value.threadRows.length,
    });
    durations.set(sameMessagesRerender.name, sameMessagesRerender.durationMs);

    const memoryStart =
      typeof process !== "undefined" ? process.memoryUsage().heapUsed : 0;
    for (let index = 0; index < 20; index += 1) {
      open10k.value.rerender({
        messages: makeMessages(10_000, index % 2 === 0 ? 0 : 20_000),
      });
    }
    const memoryEnd =
      typeof process !== "undefined" ? process.memoryUsage().heapUsed : 0;
    results.push({
      scenario: "switch_conversation_20_memory_delta",
      durationMs: 0,
      timelineRows: open10k.value.result.current.timelineItems.length,
      threadRows: open10k.value.result.current.threadRows.length,
      memoryDeltaMb:
        Math.round(((memoryEnd - memoryStart) / 1024 / 1024) * 100) / 100,
    });

    open10k.value.unmount();

    console.table(results);

    expect(durations.get("open_100")).toBeLessThanOrEqual(1_000);
    expect(durations.get("open_100_long_messages")).toBeLessThanOrEqual(1_000);
    expect(durations.get("open_10k")).toBeLessThanOrEqual(1_000);
    expect(durations.get("open_50k")).toBeLessThanOrEqual(2_500);
    expect(durations.get("append_1")).toBeLessThanOrEqual(100);
    expect(durations.get("append_10_burst")).toBeLessThanOrEqual(250);
    expect(durations.get("load_older_50")).toBeLessThanOrEqual(300);
    expect(durations.get("same_messages_rerender_keypress_proxy")).toBeLessThanOrEqual(32);
  }, 30_000);
});
