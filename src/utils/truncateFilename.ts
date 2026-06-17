/**
 * @fileoverview Filename truncation utilities.
 */

/**
 * Truncate filename in the middle, preserving extension.
 * Example: "very_long_filename_document_final_version.pdf" -> "very_long...al_version.pdf"
 *
 * @param name - Original filename
 * @param maxLen - Maximum length (default: 35)
 * @returns Truncated filename with ellipsis in the middle
 */
export function truncateFilename(name: string, maxLen = 35): string {
  if (!name || name.length <= maxLen) {
    return name;
  }

  const lastDotIndex = name.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < name.length - 1;

  let base: string;
  let ext: string;

  if (hasExtension) {
    base = name.slice(0, lastDotIndex);
    ext = name.slice(lastDotIndex); // includes the dot
  } else {
    base = name;
    ext = "";
  }

  // Reserve space for ellipsis and extension
  const keepLen = maxLen - ext.length - 3; // 3 = "..."
  if (keepLen <= 0) {
    return name.slice(0, maxLen - 3) + "...";
  }

  // Split: 60% front, 40% back (like Zalo)
  const frontLen = Math.ceil(keepLen * 0.6);
  const backLen = Math.floor(keepLen * 0.4);

  const front = base.slice(0, frontLen);
  const back = base.slice(-backLen);

  return `${front}...${back}${ext}`;
}

/**
 * Truncate filename at the end only.
 *
 * @param name - Original filename
 * @param maxLen - Maximum length
 * @returns Truncated filename
 */
export function truncateFilenameEnd(name: string, maxLen = 30): string {
  if (!name || name.length <= maxLen) {
    return name;
  }

  const lastDotIndex = name.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < name.length - 1 && (name.length - lastDotIndex) <= 6;

  if (hasExtension) {
    const ext = name.slice(lastDotIndex);
    const baseMax = maxLen - ext.length - 1;
    if (baseMax > 0) {
      return name.slice(0, baseMax) + "…" + ext;
    }
  }

  return name.slice(0, maxLen - 1) + "…";
}

/**
 * Split a filename into base name + extension (extension includes the leading dot).
 * Only treats a trailing segment as an extension when it is short (<= 8 chars incl. dot),
 * so dots inside a long descriptive name are not mistaken for an extension.
 *
 * Example: "Tea Leaf Disease Classification.pdf" -> { base: "Tea Leaf Disease Classification", ext: ".pdf" }
 */
export function splitFileName(name: string): { base: string; ext: string } {
  const lastDotIndex = name.lastIndexOf(".");
  if (
    lastDotIndex > 0 &&
    lastDotIndex < name.length - 1 &&
    name.length - lastDotIndex <= 8
  ) {
    return { base: name.slice(0, lastDotIndex), ext: name.slice(lastDotIndex) };
  }
  return { base: name, ext: "" };
}

/**
 * Get filename without extension.
 */
export function getFilenameWithoutExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex > 0) {
    return filename.slice(0, lastDotIndex);
  }
  return filename;
}

/**
 * Get file extension (without dot).
 */
export function getExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex > 0 && lastDotIndex < filename.length - 1) {
    return filename.slice(lastDotIndex + 1).toUpperCase();
  }
  return "";
}

/**
 * Sanitize filename for display (remove dangerous characters).
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and control characters
  return filename.replace(/[/\\]/g, "_").trim();
}
