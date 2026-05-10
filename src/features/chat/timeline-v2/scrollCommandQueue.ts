/**
 * Timeline V2 — priority queue for scroll commands.
 *
 * Replaces the legacy single-slot `pendingCommandRef` (audit issue S5). Higher
 * priority always wins; lower priority commands queued while a higher one is
 * pending are kept (not dropped) so they can still execute once the higher
 * one completes — UNLESS they've expired by then.
 *
 * Rejection rules (hard, enforced here so the React layer can stay dumb):
 *   - User is currently scrolling   → reject anything < priority 70.
 *   - State is `detached` and reason is `remote_message_following` → reject.
 *   - Duplicate (same reason + target already pending) → reject.
 *   - expiresAt < now → reject as `expired`.
 */

import type {
  CommandRejectReason,
  ScrollCommand,
  ScrollReason,
  ScrollState,
  ScrollTarget,
} from "./scrollTypes";
import { SCROLL_REASON_PRIORITY } from "./scrollTypes";

export interface QueueGuards {
  /** True between USER_SCROLL and USER_SCROLL_IDLE. */
  isUserScrolling: boolean;
  /** Current state machine state. Used for hard rules. */
  state: ScrollState;
  /** Now (ms). Injectable for tests. */
  now: () => number;
}

export interface EnqueueResult {
  accepted: boolean;
  command?: ScrollCommand;
  rejectedReason?: CommandRejectReason;
}

export interface CommandQueueSnapshot {
  pending: ScrollCommand[];
  inFlight: ScrollCommand | null;
}

let idCounter = 0;
const nextId = (): string => {
  idCounter += 1;
  return `scmd_${idCounter}_${Math.floor(Math.random() * 1e9).toString(36)}`;
};

export const __resetCommandIdsForTest = (): void => {
  idCounter = 0;
};

const sameTarget = (a: ScrollTarget, b: ScrollTarget): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === "bottom") return true;
  if (a.kind === "offset" && b.kind === "offset") return a.value === b.value;
  if (a.kind === "index" && b.kind === "index") return a.index === b.index;
  return false;
};

export interface ScrollCommandQueueOptions {
  /** Optional debug sink. Receives every accept/reject. */
  onAccept?: (cmd: ScrollCommand) => void;
  onReject?: (reason: CommandRejectReason, info: Record<string, unknown>) => void;
  onExecute?: (cmd: ScrollCommand) => void;
  onComplete?: (cmd: ScrollCommand) => void;
}

export class ScrollCommandQueue {
  private pending: ScrollCommand[] = [];
  private inFlight: ScrollCommand | null = null;
  private readonly opts: ScrollCommandQueueOptions;

  constructor(opts: ScrollCommandQueueOptions = {}) {
    this.opts = opts;
  }

  /**
   * Try to enqueue a command. The queue applies hard rejection rules (user
   * scrolling, detached + remote_message_following, expired, duplicate),
   * then inserts in priority order so the next dequeue picks the highest.
   */
  enqueue(
    input: {
      reason: ScrollReason;
      target: ScrollTarget;
      behavior: "instant" | "smooth";
      sourceEvent?: string;
      ttlMs?: number;
      priorityOverride?: number;
    },
    guards: QueueGuards,
  ): EnqueueResult {
    const now = guards.now();
    const priority = input.priorityOverride ?? SCROLL_REASON_PRIORITY[input.reason];

    // Hard rule: if the user is actively scrolling, reject anything below 70.
    if (guards.isUserScrolling && priority < 70) {
      const info = { reason: input.reason, priority };
      this.opts.onReject?.("user_scrolling", info);
      return { accepted: false, rejectedReason: "user_scrolling" };
    }

    // Hard rule: detached + remote_message_following must not auto-scroll.
    if (
      guards.state === "detached" &&
      input.reason === "remote_message_following"
    ) {
      const info = { reason: input.reason, state: guards.state };
      this.opts.onReject?.("state_disallows", info);
      return { accepted: false, rejectedReason: "state_disallows" };
    }

    // Drop expired before they ever enter the queue.
    if (typeof input.ttlMs === "number" && input.ttlMs <= 0) {
      this.opts.onReject?.("expired", { reason: input.reason });
      return { accepted: false, rejectedReason: "expired" };
    }

    const command: ScrollCommand = {
      id: nextId(),
      reason: input.reason,
      priority,
      target: input.target,
      behavior: input.behavior,
      createdAt: now,
      expiresAt:
        typeof input.ttlMs === "number" ? now + input.ttlMs : undefined,
      sourceEvent: input.sourceEvent,
    };

    // Duplicate check across pending + inFlight.
    const isDup =
      (this.inFlight &&
        this.inFlight.reason === command.reason &&
        sameTarget(this.inFlight.target, command.target)) ||
      this.pending.some(
        (p) =>
          p.reason === command.reason && sameTarget(p.target, command.target),
      );
    if (isDup) {
      this.opts.onReject?.("duplicate", { reason: command.reason });
      return { accepted: false, rejectedReason: "duplicate" };
    }

    // Insert in descending priority; ties keep FIFO order for fairness.
    let inserted = false;
    for (let i = 0; i < this.pending.length; i++) {
      if (command.priority > this.pending[i]!.priority) {
        this.pending.splice(i, 0, command);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.pending.push(command);

    this.opts.onAccept?.(command);
    return { accepted: true, command };
  }

  /**
   * Pop the next command to execute. Skips expired ones, surfacing them via
   * `onReject('expired', ...)`. Returns null when the queue is drained or a
   * command is already in-flight.
   */
  dequeue(now: number): ScrollCommand | null {
    if (this.inFlight) return null;
    while (this.pending.length > 0) {
      const head = this.pending.shift()!;
      if (head.expiresAt !== undefined && head.expiresAt < now) {
        this.opts.onReject?.("expired", {
          reason: head.reason,
          id: head.id,
        });
        continue;
      }
      this.inFlight = head;
      this.opts.onExecute?.(head);
      return head;
    }
    return null;
  }

  /**
   * Mark the in-flight command complete, freeing the slot for the next one.
   * The id check ensures we never accidentally complete a command that was
   * already cleared (e.g. due to conversation change).
   */
  complete(commandId: string): void {
    if (this.inFlight && this.inFlight.id === commandId) {
      const cmd = this.inFlight;
      this.inFlight = null;
      this.opts.onComplete?.(cmd);
    }
  }

  /**
   * Hard reset (e.g. on conversation change). Drops all pending + in-flight
   * without firing onComplete so listeners know they were cancelled.
   */
  reset(): void {
    this.pending = [];
    this.inFlight = null;
  }

  snapshot(): CommandQueueSnapshot {
    return {
      pending: [...this.pending],
      inFlight: this.inFlight,
    };
  }

  get size(): number {
    return this.pending.length + (this.inFlight ? 1 : 0);
  }
}
