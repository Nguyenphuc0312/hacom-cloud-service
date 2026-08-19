/**
 * @fileoverview Vitest test setup
 *
 * This file is loaded before every test file via the `setupFiles` option
 * in vite.config.ts.
 *
 * It configures:
 * - ResizeObserver shim (needed by component tests)
 * - IntersectionObserver shim
 * - Element.scrollTo shim (jsdom)
 */

import { beforeAll } from "vitest";

beforeAll(() => {
  // No-op: timeout configuration if needed in the future
});

// ResizeObserver is not implemented in jsdom — install a minimal shim
// so component tests that call new ResizeObserver() don't throw.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// IntersectionObserver shim for tests that reference it
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  };
}

// jsdom does not implement scrollTo — add a shim for component tests
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function (options?: ScrollToOptions | number) {
    if (typeof options === "object" && options !== null && "top" in options) {
      this.scrollTop = Number((options as { top: number }).top);
    } else if (typeof options === "number") {
      this.scrollTop = options;
    }
  } as Element["scrollTo"];
}

// Suppress console.error noise from React 18 strict mode double-rendering in tests
// (only if NOT in CI — CI should surface all errors)
if (!process.env.CI) {
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const firstArg = args[0];
    if (
      typeof firstArg === "string" &&
      (firstArg.includes("Error: Uncaught") ||
        firstArg.includes("Warning: An update to") ||
        firstArg.includes("Warning: Can't call setState"))
    ) {
      return;
    }
    originalError(...args);
  };
}
