import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScrollCommandQueue,
  __resetCommandIdsForTest,
} from "./scrollCommandQueue";
import type { QueueGuards } from "./scrollCommandQueue";

const guards = (overrides: Partial<QueueGuards> = {}): QueueGuards => ({
  isUserScrolling: false,
  state: "following_bottom",
  now: () => 1000,
  ...overrides,
});

beforeEach(() => {
  __resetCommandIdsForTest();
});

describe("ScrollCommandQueue.enqueue", () => {
  it("rejects priority < 70 while user is scrolling", () => {
    const q = new ScrollCommandQueue();
    const r = q.enqueue(
      {
        reason: "remote_message_following",
        target: { kind: "bottom" },
        behavior: "smooth",
      },
      guards({ isUserScrolling: true }),
    );
    expect(r.accepted).toBe(false);
    expect(r.rejectedReason).toBe("user_scrolling");
  });

  it("accepts priority >= 70 while user is scrolling (e.g. preserve_after_prepend)", () => {
    const q = new ScrollCommandQueue();
    const r = q.enqueue(
      {
        reason: "preserve_after_prepend",
        target: { kind: "index", index: 4 },
        behavior: "instant",
      },
      guards({ isUserScrolling: true }),
    );
    expect(r.accepted).toBe(true);
  });

  it("rejects remote_message_following when state is detached", () => {
    const q = new ScrollCommandQueue();
    const r = q.enqueue(
      {
        reason: "remote_message_following",
        target: { kind: "bottom" },
        behavior: "smooth",
      },
      guards({ state: "detached" }),
    );
    expect(r.accepted).toBe(false);
    expect(r.rejectedReason).toBe("state_disallows");
  });

  it("rejects duplicates (same reason + target)", () => {
    const q = new ScrollCommandQueue();
    q.enqueue(
      { reason: "initial_bottom", target: { kind: "bottom" }, behavior: "instant" },
      guards(),
    );
    const r = q.enqueue(
      { reason: "initial_bottom", target: { kind: "bottom" }, behavior: "instant" },
      guards(),
    );
    expect(r.accepted).toBe(false);
    expect(r.rejectedReason).toBe("duplicate");
  });

  it("rejects negative ttl as expired", () => {
    const q = new ScrollCommandQueue();
    const r = q.enqueue(
      {
        reason: "initial_bottom",
        target: { kind: "bottom" },
        behavior: "instant",
        ttlMs: -5,
      },
      guards(),
    );
    expect(r.accepted).toBe(false);
    expect(r.rejectedReason).toBe("expired");
  });
});

describe("ScrollCommandQueue.dequeue priority order", () => {
  it("returns highest-priority command first", () => {
    const q = new ScrollCommandQueue();
    q.enqueue(
      {
        reason: "remote_message_following",
        target: { kind: "bottom" },
        behavior: "smooth",
      },
      guards(),
    );
    q.enqueue(
      {
        reason: "preserve_after_prepend",
        target: { kind: "index", index: 1 },
        behavior: "instant",
      },
      guards(),
    );
    q.enqueue(
      { reason: "own_message_sent", target: { kind: "bottom" }, behavior: "smooth" },
      guards(),
    );
    const first = q.dequeue(1000);
    expect(first?.reason).toBe("preserve_after_prepend");
    q.complete(first!.id);
    const second = q.dequeue(1001);
    expect(second?.reason).toBe("own_message_sent");
    q.complete(second!.id);
    const third = q.dequeue(1002);
    expect(third?.reason).toBe("remote_message_following");
  });

  it("returns null while a command is in-flight (no preemption)", () => {
    const q = new ScrollCommandQueue();
    q.enqueue(
      { reason: "initial_bottom", target: { kind: "bottom" }, behavior: "instant" },
      guards(),
    );
    const inFlight = q.dequeue(1000);
    expect(inFlight).not.toBeNull();
    q.enqueue(
      {
        reason: "preserve_after_prepend",
        target: { kind: "index", index: 5 },
        behavior: "instant",
      },
      guards(),
    );
    expect(q.dequeue(1001)).toBeNull();
    q.complete(inFlight!.id);
    const next = q.dequeue(1002);
    expect(next?.reason).toBe("preserve_after_prepend");
  });

  it("skips and reports expired commands at dequeue time", () => {
    const onReject = vi.fn();
    const q = new ScrollCommandQueue({ onReject });
    // Priority-100 with a tight ttl: this lands at the head and will expire.
    q.enqueue(
      {
        reason: "preserve_after_prepend",
        target: { kind: "index", index: 0 },
        behavior: "instant",
        ttlMs: 100,
      },
      guards({ now: () => 1000 }),
    );
    // Priority-90 lower, fresh, no ttl: should survive and be returned.
    q.enqueue(
      {
        reason: "own_message_sent",
        target: { kind: "bottom" },
        behavior: "smooth",
      },
      guards(),
    );
    // 5s later, head expired → skipped → onReject('expired'); next is returned.
    const popped = q.dequeue(6000);
    expect(popped?.reason).toBe("own_message_sent");
    expect(onReject).toHaveBeenCalledWith("expired", expect.any(Object));
  });
});

describe("ScrollCommandQueue.reset", () => {
  it("drops pending and in-flight without firing onComplete", () => {
    const onComplete = vi.fn();
    const q = new ScrollCommandQueue({ onComplete });
    q.enqueue(
      { reason: "initial_bottom", target: { kind: "bottom" }, behavior: "instant" },
      guards(),
    );
    q.dequeue(1000);
    q.enqueue(
      {
        reason: "preserve_after_prepend",
        target: { kind: "index", index: 2 },
        behavior: "instant",
      },
      guards(),
    );
    q.reset();
    expect(q.size).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
