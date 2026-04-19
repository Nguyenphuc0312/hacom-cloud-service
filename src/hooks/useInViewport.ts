import { useEffect, useState } from "react";
import type { RefObject } from "react";

interface UseInViewportOptions {
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
  enabled?: boolean;
}

export const useInViewport = <T extends Element>(
  target: RefObject<T | null>,
  options: UseInViewportOptions = {},
): boolean => {
  const {
    rootMargin = "240px 0px",
    threshold = 0,
    once = true,
    enabled = true,
  } = options;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const node = target.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const rafId = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => {
        cancelAnimationFrame(rafId);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextVisible = entries.some((entry) => entry.isIntersecting);
        if (!nextVisible) {
          if (!once) {
            setIsVisible(false);
          }
          return;
        }

        setIsVisible(true);
        if (once) {
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin,
        threshold,
      },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [enabled, once, rootMargin, target, threshold]);

  return enabled ? isVisible : false;
};

export default useInViewport;
