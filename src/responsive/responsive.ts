import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** Min-width thresholds (px), aligned with Tailwind-style defaults. */
export const RSP_BREAKPOINT_MIN = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
  ultrawide: 1920,
} as const;

/**
 * Current viewport bucket: width falls in [token, nextToken).
 * `xs` is below `sm`.
 */
export type ResponsiveBreakpoint =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "ultrawide";

export type ScreenCategory =
  | "mobile"
  | "tablet"
  | "laptop"
  | "desktop"
  | "ultrawide";

/** Chat shell routing thresholds (historical ChatPage behavior). */
export type ChatLayoutBreakpointBand = "compact" | "standard" | "wide";

export interface ResponsiveSpacingPx {
  shellGutter: number;
  panelGap: number;
  bubblePad: number;
}

export interface ResponsiveTypographyRem {
  body: number;
  bodySm: number;
  titleSm: number;
  title: number;
}

export interface ResponsiveSnapshot {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  /** Soft factor for compensating HiDPI layout math (1–1.25). */
  dprLayoutFactor: number;
  /** Width / reference width for optional UI scaling hints (0.85–1). */
  scaleRatio: number;
  breakpoint: ResponsiveBreakpoint;
  screenCategory: ScreenCategory;
  chatLayoutBreakpoint: ChatLayoutBreakpointBand;
  spacingPx: ResponsiveSpacingPx;
  typographyRem: ResponsiveTypographyRem;
}

const REFERENCE_LAYOUT_WIDTH = 1440;
const THROTTLE_MS = 96;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export const resolveResponsiveBreakpoint = (
  width: number,
): ResponsiveBreakpoint => {
  if (width < RSP_BREAKPOINT_MIN.sm) return "xs";
  if (width < RSP_BREAKPOINT_MIN.md) return "sm";
  if (width < RSP_BREAKPOINT_MIN.lg) return "md";
  if (width < RSP_BREAKPOINT_MIN.xl) return "lg";
  if (width < RSP_BREAKPOINT_MIN["2xl"]) return "xl";
  if (width < RSP_BREAKPOINT_MIN.ultrawide) return "2xl";
  return "ultrawide";
};

export const resolveScreenCategory = (
  width: number,
  height: number,
): ScreenCategory => {
  if (width < RSP_BREAKPOINT_MIN.md) return "mobile";
  if (width < RSP_BREAKPOINT_MIN.lg) return "tablet";
  if (width < RSP_BREAKPOINT_MIN.ultrawide) {
    return height < 720 ? "laptop" : "desktop";
  }
  return "ultrawide";
};

export const resolveChatLayoutBreakpointBand = (
  width: number,
): ChatLayoutBreakpointBand => {
  // compact dưới `md` (768px): chỉ các viewport thực sự hẹp (mobile) mới dùng
  // layout một cột. Cửa sổ desktop tối thiểu 1024px (viewport thực ~1008px do
  // viền cửa sổ) và browser zoom lớn phải giữ layout hai cột — xem ChatPage
  // (`hidden md:flex` cho pane chính khi chưa chọn hội thoại).
  if (width < RSP_BREAKPOINT_MIN.md) return "compact";
  if (width < RSP_BREAKPOINT_MIN.xl) return "standard";
  return "wide";
};

const computeDprLayoutFactor = (dpr: number): number => {
  const safe = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(1.25, Math.max(1, 2 / Math.min(safe, 3)));
};

const computeScaleRatio = (width: number): number => {
  const t = clamp01((width - 320) / (REFERENCE_LAYOUT_WIDTH - 320));
  return lerp(0.92, 1, t);
};

export const computeAdaptiveSpacingPx = (width: number): ResponsiveSpacingPx => {
  const t = clamp01((width - 360) / (1280 - 360));
  return {
    shellGutter: Math.round(lerp(12, 24, t)),
    panelGap: Math.round(lerp(8, 16, t)),
    bubblePad: Math.round(lerp(10, 14, t)),
  };
};

export const computeAdaptiveTypographyRem = (
  width: number,
): ResponsiveTypographyRem => {
  const t = clamp01((width - 360) / (1440 - 360));
  return {
    body: lerp(0.875, 1, t),
    bodySm: lerp(0.8125, 0.875, t),
    titleSm: lerp(1, 1.125, t),
    title: lerp(1.0625, 1.25, t),
  };
};

export const buildResponsiveSnapshot = (
  width: number,
  height: number,
  innerWidth: number,
  innerHeight: number,
  devicePixelRatio: number,
): ResponsiveSnapshot => {
  const dpr = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  return {
    width,
    height,
    innerWidth,
    innerHeight,
    devicePixelRatio: dpr,
    dprLayoutFactor: computeDprLayoutFactor(dpr),
    scaleRatio: computeScaleRatio(width),
    breakpoint: resolveResponsiveBreakpoint(width),
    screenCategory: resolveScreenCategory(width, height),
    chatLayoutBreakpoint: resolveChatLayoutBreakpointBand(width),
    spacingPx: computeAdaptiveSpacingPx(width),
    typographyRem: computeAdaptiveTypographyRem(width),
  };
};

const readRawViewport = (): {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
} => {
  if (typeof window === "undefined") {
    return {
      width: 1280,
      height: 800,
      innerWidth: 1280,
      innerHeight: 800,
    };
  }

  const innerWidth = window.innerWidth;
  const innerHeight = window.innerHeight;
  const vv = window.visualViewport;
  if (!vv) {
    return {
      width: Math.round(innerWidth),
      height: Math.round(innerHeight),
      innerWidth: Math.round(innerWidth),
      innerHeight: Math.round(innerHeight),
    };
  }

  return {
    width: Math.round(vv.width),
    height: Math.round(vv.height),
    innerWidth: Math.round(innerWidth),
    innerHeight: Math.round(innerHeight),
  };
};

const applyResponsiveRootStyles = (
  root: HTMLElement,
  snapshot: ResponsiveSnapshot,
  reducedMotion: boolean,
): void => {
  const { spacingPx, typographyRem } = snapshot;
  root.dataset.rspBp = snapshot.breakpoint;
  root.dataset.rspScreen = snapshot.screenCategory;
  root.dataset.rspChatLayout = snapshot.chatLayoutBreakpoint;
  root.dataset.rspReducedMotion = reducedMotion ? "true" : "false";

  root.style.setProperty("--rsp-viewport-w", `${snapshot.width}px`);
  root.style.setProperty("--rsp-viewport-h", `${snapshot.height}px`);
  root.style.setProperty("--rsp-inner-w", `${snapshot.innerWidth}px`);
  root.style.setProperty("--rsp-inner-h", `${snapshot.innerHeight}px`);
  root.style.setProperty("--rsp-dpr", String(snapshot.devicePixelRatio));
  root.style.setProperty(
    "--rsp-dpr-layout",
    String(snapshot.dprLayoutFactor),
  );
  root.style.setProperty(
    "--rsp-scale-ratio",
    String(snapshot.scaleRatio),
  );
  root.style.setProperty(
    "--rsp-shell-gutter-px",
    `${spacingPx.shellGutter}px`,
  );
  root.style.setProperty(
    "--rsp-panel-gap-px",
    `${spacingPx.panelGap}px`,
  );
  root.style.setProperty(
    "--rsp-bubble-pad-px",
    `${spacingPx.bubblePad}px`,
  );
  root.style.setProperty("--rsp-font-body-rem", `${typographyRem.body}rem`);
  root.style.setProperty(
    "--rsp-font-body-sm-rem",
    `${typographyRem.bodySm}rem`,
  );
  root.style.setProperty(
    "--rsp-font-title-sm-rem",
    `${typographyRem.titleSm}rem`,
  );
  root.style.setProperty(
    "--rsp-font-title-rem",
    `${typographyRem.title}rem`,
  );
};

const ResponsiveContext = createContext<ResponsiveSnapshot | null>(null);

export const useResponsive = (): ResponsiveSnapshot => {
  const value = useContext(ResponsiveContext);
  if (!value) {
    throw new Error("useResponsive must be used within ResponsiveProvider");
  }
  return value;
};

export const useResponsiveOptional = (): ResponsiveSnapshot | null =>
  useContext(ResponsiveContext);

export const ResponsiveProvider = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null => {
  const [snapshot, setSnapshot] = useState<ResponsiveSnapshot>(() => {
    const raw = readRawViewport();
    return buildResponsiveSnapshot(
      raw.width,
      raw.height,
      raw.innerWidth,
      raw.innerHeight,
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
  });

  const snapshotRef = useRef(snapshot);
  useLayoutEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const reducedMotionRef = useRef(false);

  const flushToDom = useCallback((next: ResponsiveSnapshot) => {
    if (typeof document === "undefined") return;
    applyResponsiveRootStyles(
      document.documentElement,
      next,
      reducedMotionRef.current,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReduce = () => {
      reducedMotionRef.current = mqReduce.matches;
      flushToDom(snapshotRef.current);
    };
    syncReduce();
    mqReduce.addEventListener("change", syncReduce);

    let rafId: number | null = null;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastThrottleCommit = 0;

    const compute = (): ResponsiveSnapshot => {
      const raw = readRawViewport();
      return buildResponsiveSnapshot(
        raw.width,
        raw.height,
        raw.innerWidth,
        raw.innerHeight,
        window.devicePixelRatio || 1,
      );
    };

    const pushFrame = () => {
      rafId = null;
      const next = compute();
      flushToDom(next);

      const now = performance.now();
      if (now - lastThrottleCommit >= THROTTLE_MS) {
        lastThrottleCommit = now;
        setSnapshot((prev) => {
          if (
            prev.width === next.width &&
            prev.height === next.height &&
            prev.innerWidth === next.innerWidth &&
            prev.innerHeight === next.innerHeight &&
            prev.devicePixelRatio === next.devicePixelRatio &&
            prev.breakpoint === next.breakpoint &&
            prev.screenCategory === next.screenCategory &&
            prev.chatLayoutBreakpoint === next.chatLayoutBreakpoint
          ) {
            return prev;
          }
          return next;
        });
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        return;
      }

      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
          lastThrottleCommit = performance.now();
          const latest = compute();
          flushToDom(latest);
          setSnapshot((prev) => {
            if (
              prev.width === latest.width &&
              prev.height === latest.height &&
              prev.innerWidth === latest.innerWidth &&
              prev.innerHeight === latest.innerHeight &&
              prev.devicePixelRatio === latest.devicePixelRatio &&
              prev.breakpoint === latest.breakpoint &&
              prev.screenCategory === latest.screenCategory &&
              prev.chatLayoutBreakpoint === latest.chatLayoutBreakpoint
            ) {
              return prev;
            }
            return latest;
          });
        }, THROTTLE_MS);
      }
    };

    const schedule = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(pushFrame);
    };

    const rootEl = document.getElementById("root");
    const ro =
      rootEl && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    ro?.observe(rootEl as Element);

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);

    schedule();

    return () => {
      mqReduce.removeEventListener("change", syncReduce);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (throttleTimer) clearTimeout(throttleTimer);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [flushToDom]);

  const value = useMemo(() => snapshot, [snapshot]);

  return React.createElement(
    ResponsiveContext.Provider,
    { value },
    children,
  );
};
