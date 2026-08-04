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
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>, src: string) => void;
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
  const status: SafeImageStatus = !safeSrc
    ? "empty"
    : failedSources.has(safeSrc)
      ? "error"
      : loadedSource === safeSrc
        ? "loaded"
        : "loading";

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
      onLoad?.(event, safeSrc);
    },
    [onLoad, safeSrc],
  );

  const handleError = React.useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      if (!safeSrc) return;
      setFailedSources((previous) => {
        if (previous.has(safeSrc)) return previous;
        const next = new Set(previous);
        next.add(safeSrc);
        return next;
      });
      if (
        retryOnSignedUrlExpired &&
        !retriedSources.has(safeSrc)
      ) {
        setRetriedSources((previous) => {
          if (previous.has(safeSrc)) return previous;
          const next = new Set(previous);
          next.add(safeSrc);
          return next;
        });
        onRetrySource?.(safeSrc);
      }
      onError?.(event, safeSrc);
    },
    [onError, onRetrySource, retriedSources, retryOnSignedUrlExpired, safeSrc],
  );

  if (!safeSrc || status === "empty" || status === "error") {
    return <>{fallback}</>;
  }

  return (
    <>
      {status === "loading" && loadingFallback}
      <img
        {...imgProps}
        src={safeSrc}
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
