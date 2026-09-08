/**
 * Resource APIs from older servers omit these fields. Only an explicit false
 * blocks the matching action, so legacy responses retain their prior behavior.
 */
export interface ResourceCapabilities {
  canPreview?: boolean;
  canDownload?: boolean;
}

export const canPreviewResource = (resource: ResourceCapabilities): boolean =>
  resource.canPreview !== false;

export const canDownloadResource = (resource: ResourceCapabilities): boolean =>
  resource.canDownload !== false;

/**
 * Preserve explicit server capabilities when a resource is handed to another
 * UI surface. Omit absent fields so legacy default behavior remains intact.
 */
export const getResourceCapabilityMetadata = (
  resource: ResourceCapabilities,
): ResourceCapabilities => ({
  ...(typeof resource.canPreview === "boolean"
    ? { canPreview: resource.canPreview }
    : {}),
  ...(typeof resource.canDownload === "boolean"
    ? { canDownload: resource.canDownload }
    : {}),
});
