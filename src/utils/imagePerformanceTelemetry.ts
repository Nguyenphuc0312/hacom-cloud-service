/**
 * Opt-in, redacted image-performance signals for staging/canary analysis.
 * No signed URLs, file IDs, conversation IDs, cookies, or request bodies leave
 * this module. A host integration may listen for the browser event and forward
 * the small sampled payload to its approved telemetry pipeline.
 */
export type ImagePerformanceEvent = {
  kind: 'batch_url_request' | 'image_painted';
  durationMs?: number;
  queueWaitMs?: number;
  batchSize?: number;
  width?: number;
  height?: number;
  outcome?: 'success' | 'error';
  requestStartMs?: number;
  responseStartMs?: number;
  responseEndMs?: number;
  decodeDurationMs?: number;
  transferSize?: number;
  encodedBodySize?: number;
  renderedWidth?: number;
  renderedHeight?: number;
  cacheLayer?: 'browser-byte-cache' | 'network-or-opaque' | 'unknown';
};

const enabled = (): boolean => import.meta.env.VITE_IMAGE_PERFORMANCE_TELEMETRY_ENABLED === 'true';
const sample = (): boolean => Math.random() < 0.1;

export const reportImagePerformance = (event: ImagePerformanceEvent): void => {
  if (!enabled() || !sample() || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('chat:image-performance', { detail: event }));
};

/** Extracts timing fields without returning or emitting the sensitive URL used
 * to look it up. Cross-origin timing may be opaque; that is reported as
 * unknown instead of guessed. */
export const getRedactedResourceTiming = (src: string): Pick<ImagePerformanceEvent,
  'requestStartMs' | 'responseStartMs' | 'responseEndMs' | 'transferSize' | 'encodedBodySize' | 'cacheLayer'
> => {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByName !== 'function') return {};
  const entries = performance.getEntriesByName(src, 'resource');
  const entry = entries[entries.length - 1] as PerformanceResourceTiming | undefined;
  if (!entry) return { cacheLayer: 'unknown' };
  const hasSizes = typeof entry.transferSize === 'number' && typeof entry.encodedBodySize === 'number';
  return {
    requestStartMs: Math.round(entry.requestStart),
    responseStartMs: Math.round(entry.responseStart),
    responseEndMs: Math.round(entry.responseEnd),
    ...(hasSizes ? { transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize } : {}),
    cacheLayer: hasSizes && entry.transferSize === 0 && entry.encodedBodySize > 0
      ? 'browser-byte-cache'
      : hasSizes ? 'network-or-opaque' : 'unknown',
  };
};
