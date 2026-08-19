import { useEffect, useState } from "react";
import { useResponsiveOptional } from "../responsive/responsive";

export interface MobileViewportMetrics {
  width: number;
  height: number;
  keyboardInset: number;
}

const FALLBACK_VIEWPORT: MobileViewportMetrics = {
  width: 1280,
  height: 900,
  keyboardInset: 0,
};

const readKeyboardInset = (): number => {
  if (typeof window === "undefined") {
    return 0;
  }

  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return 0;
  }

  const layoutHeight = window.innerHeight;
  const viewportBottom =
    visualViewport.height + Math.max(0, visualViewport.offsetTop);
  return Math.max(
    0,
    Math.round(layoutHeight - Math.min(layoutHeight, viewportBottom)),
  );
};

const readLayoutSize = (): Pick<MobileViewportMetrics, "width" | "height"> => {
  if (typeof window === "undefined") {
    return { width: FALLBACK_VIEWPORT.width, height: FALLBACK_VIEWPORT.height };
  }

  const layoutWidth = window.innerWidth;
  const layoutHeight = window.innerHeight;
  const visualViewport = window.visualViewport;

  if (!visualViewport) {
    return {
      width: Math.round(layoutWidth),
      height: Math.round(layoutHeight),
    };
  }

  return {
    width: Math.round(visualViewport.width),
    height: Math.round(visualViewport.height),
  };
};

export const useMobileViewportMetrics = (): MobileViewportMetrics => {
  const globalLayout = useResponsiveOptional();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [localSize, setLocalSize] = useState(() => readLayoutSize());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const flushKeyboard = () => {
      setKeyboardInset(readKeyboardInset());
    };

    flushKeyboard();
    window.visualViewport?.addEventListener("resize", flushKeyboard);
    window.visualViewport?.addEventListener("scroll", flushKeyboard);
    window.addEventListener("resize", flushKeyboard);

    return () => {
      window.visualViewport?.removeEventListener("resize", flushKeyboard);
      window.visualViewport?.removeEventListener("scroll", flushKeyboard);
      window.removeEventListener("resize", flushKeyboard);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || globalLayout) {
      return;
    }

    let frameId: number | null = null;

    const flush = () => {
      frameId = null;
      const nextSize = readLayoutSize();
      setLocalSize((previous) => {
        if (
          Math.abs(previous.width - nextSize.width) <= 1 &&
          Math.abs(previous.height - nextSize.height) <= 1
        ) {
          return previous;
        }

        return nextSize;
      });
    };

    const schedule = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(flush);
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [globalLayout]);

  if (globalLayout) {
    return {
      width: globalLayout.width,
      height: globalLayout.height,
      keyboardInset,
    };
  }

  return {
    width: localSize.width,
    height: localSize.height,
    keyboardInset,
  };
};

export default useMobileViewportMetrics;
