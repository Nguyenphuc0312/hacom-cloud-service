import React from "react";
import clsx from "clsx";
import { PhotoIcon } from "@heroicons/react/24/outline";

type SafeImageStatus = "empty" | "loading" | "loaded" | "error";

interface SafeImageProps
  extends Omit<
    React.ImgHTMLAttributes<HTMLImageElement>,
    "src" | "alt" | "onError" | "onLoad"
  > {
  src?: string | null;
  alt: string;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
  objectFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  retryOnSignedUrlExpired?: boolean;
  onRetrySource?: (src: string) => void;
  onError?: (event: React.SyntheticEvent<HTMLImageElement>, src: string) => void;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>, src: string, meta?: { decodeDurationMs?: number }) => void;
}

const objectFitClasses = {
  cover: "object-cover",
  contain: "object-contain",
  fill: "object-fill",
  none: "object-none",
  "scale-down": "object-scale-down",
};

const defaultFallback = (
  <div className="flex h-full w-full items-center justify-center bg-surface-overlay text-text-muted">
    <PhotoIcon className="h-6 w-6" aria-hidden="true" />
  </div>
);

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  fallback = defaultFallback,
  loadingFallback,
  objectFit = "cover",
  retryOnSignedUrlExpired = false,
  onRetrySource,
  className,
  onError,
  onLoad,
  loading = "lazy",
  decoding = "async",
  ...imgProps
}) => {
  const safeSrc =
    typeof src === "string" && src.trim().length > 0 ? src.trim() : undefined;
  const [failedSources, setFailedSources] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [retriedSources, setRetriedSources] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [loadedSource, setLoadedSource] = React.useState<string | null>(null);
  // Keep painting the last successfully-loaded image until the next one is
  // ready, so switching src never blanks the <img> for a frame (gray flash).
  const [displaySource, setDisplaySource] = React.useState<string | null>(null);
  const decodeDurationBySourceRef = React.useRef(new Map<string, number>());
  const status: SafeImageStatus = !safeSrc
    ? "empty"
    : failedSources.has(safeSrc)
      ? "error"
      : loadedSource === safeSrc
        ? "loaded"
        : "loading";

  const markFailed = React.useCallback(
    (
      failedSrc: string,
      event?: React.SyntheticEvent<HTMLImageElement>,
    ) => {
      setFailedSources((previous) => {
        if (previous.has(failedSrc)) return previous;
        const next = new Set(previous);
        next.add(failedSrc);
        return next;
      });
      if (retryOnSignedUrlExpired && !retriedSources.has(failedSrc)) {
        setRetriedSources((previous) => {
          if (previous.has(failedSrc)) return previous;
          const next = new Set(previous);
          next.add(failedSrc);
          return next;
        });
        onRetrySource?.(failedSrc);
      }
      if (event) onError?.(event, failedSrc);
    },
    [onError, onRetrySource, retriedSources, retryOnSignedUrlExpired],
  );

  // Preload the incoming src off-screen; only promote it to the visible <img>
  // once it has decoded, so the on-screen avatar never blanks mid-swap.
  React.useEffect(() => {
    if (!safeSrc || failedSources.has(safeSrc)) return undefined;
    if (safeSrc === displaySource) return undefined;

    let cancelled = false;
    const preloader = new Image();
    const commit = () => {
      if (cancelled) return;
      setLoadedSource(safeSrc);
      setDisplaySource(safeSrc);
    };
    const fail = () => {
      if (!cancelled) markFailed(safeSrc);
    };
    preloader.onload = commit;
    preloader.onerror = fail;
    preloader.src = safeSrc;
    // Prefer decode() when available (resolves only once pixels are ready, so
    // the swap is truly flash-free). Not in every environment (e.g. jsdom) —
    // there the onload/onerror handlers above carry the load.
    if (typeof preloader.decode === "function") {
      const decodeStartedAt = performance.now();
      preloader.decode().then(() => {
        decodeDurationBySourceRef.current.set(safeSrc, performance.now() - decodeStartedAt);
        commit();
      }).catch(() => {
        if (preloader.complete && preloader.naturalWidth === 0) fail();
      });
    }

    return () => {
      cancelled = true;
      preloader.onload = null;
      preloader.onerror = null;
    };
  }, [safeSrc, displaySource, failedSources, markFailed]);

  const handleLoad = React.useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      if (!safeSrc) return;
      setFailedSources((previous) => {
        if (!previous.has(safeSrc)) return previous;
        const next = new Set(previous);
        next.delete(safeSrc);
        return next;
      });
      setLoadedSource(safeSrc);
      setDisplaySource(safeSrc);
      onLoad?.(event, safeSrc, {
        decodeDurationMs: decodeDurationBySourceRef.current.get(safeSrc),
      });
    },
    [onLoad, safeSrc],
  );

  const handleError = React.useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      if (!safeSrc) return;
      markFailed(safeSrc, event);
    },
    [markFailed, safeSrc],
  );

  if (!safeSrc || status === "empty" || status === "error") {
    return <>{fallback}</>;
  }

  // Paint the already-decoded image if we have one; only show the loading
  // fallback on the very first load, when there's nothing to keep on screen.
  const renderedSrc = displaySource ?? safeSrc;

  return (
    <>
      {status === "loading" && !displaySource && loadingFallback}
      <img
        {...imgProps}
        src={renderedSrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        className={clsx(className, objectFitClasses[objectFit])}
        onLoad={handleLoad}
        onError={handleError}
      />
    </>
  );
};

export default SafeImage;
