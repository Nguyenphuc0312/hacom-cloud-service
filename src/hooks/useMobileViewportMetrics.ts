import { useEffect, useState } from "react";

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

const readViewportMetrics = (): MobileViewportMetrics => {
  if (typeof window === "undefined") {
    return FALLBACK_VIEWPORT;
  }

  const layoutWidth = window.innerWidth;
  const layoutHeight = window.innerHeight;
  const visualViewport = window.visualViewport;

  if (!visualViewport) {
    return {
      width: layoutWidth,
      height: layoutHeight,
      keyboardInset: 0,
    };
  }

  const width = Math.round(visualViewport.width);
  const height = Math.round(visualViewport.height);
  const viewportBottom =
    visualViewport.height + Math.max(0, visualViewport.offsetTop);
  const keyboardInset = Math.max(
    0,
    Math.round(layoutHeight - Math.min(layoutHeight, viewportBottom)),
  );

  return {
    width,
    height,
    keyboardInset,
  };
};

export const useMobileViewportMetrics = (): MobileViewportMetrics => {
  const [metrics, setMetrics] = useState<MobileViewportMetrics>(() =>
    readViewportMetrics(),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let frameId: number | null = null;
    const visualViewport = window.visualViewport;

    const flush = () => {
      frameId = null;
      const nextMetrics = readViewportMetrics();
      setMetrics((previous) => {
        if (
          Math.abs(previous.width - nextMetrics.width) <= 1 &&
          Math.abs(previous.height - nextMetrics.height) <= 1 &&
          Math.abs(previous.keyboardInset - nextMetrics.keyboardInset) <= 1
        ) {
          return previous;
        }

        return nextMetrics;
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
    visualViewport?.addEventListener("resize", schedule);
    visualViewport?.addEventListener("scroll", schedule);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      visualViewport?.removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("scroll", schedule);
    };
  }, []);

  return metrics;
};

export default useMobileViewportMetrics;
