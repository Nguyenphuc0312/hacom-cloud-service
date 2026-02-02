/**
 * Format file size to human readable string
 * Examples: "1.5 KB", "2.3 MB", "1 GB"
 */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  if (i === 0) {
    return `${bytes} ${units[i]}`;
  }

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()?.toUpperCase() || "" : "";
}

/**
 * Get file type category from mime type
 */
export function getFileCategory(
  mimeType: string,
): "document" | "image" | "video" | "audio" | "archive" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("document") ||
    mimeType.includes("text")
  )
    return "document";
  if (
    mimeType.includes("zip") ||
    mimeType.includes("rar") ||
    mimeType.includes("tar")
  )
    return "archive";
  return "other";
}

/**
 * Get file icon emoji based on extension
 */
export function getFileIcon(fileName: string): string {
  const ext = getFileExtension(fileName).toLowerCase();

  const iconMap: Record<string, string> = {
    // Documents
    pdf: "📕",
    doc: "📄",
    docx: "📄",
    txt: "📝",
    rtf: "📝",

    // Spreadsheets
    xls: "📊",
    xlsx: "📊",
    csv: "📊",

    // Presentations
    ppt: "📽️",
    pptx: "📽️",

    // Images
    jpg: "🖼️",
    jpeg: "🖼️",
    png: "🖼️",
    gif: "🖼️",
    svg: "🖼️",
    webp: "🖼️",

    // Videos
    mp4: "🎬",
    avi: "🎬",
    mov: "🎬",
    mkv: "🎬",
    webm: "🎬",

    // Audio
    mp3: "🎵",
    wav: "🎵",
    ogg: "🎵",
    flac: "🎵",

    // Archives
    zip: "📦",
    rar: "📦",
    "7z": "📦",
    tar: "📦",
    gz: "📦",

    // Code
    js: "💻",
    ts: "💻",
    py: "💻",
    java: "💻",
    html: "💻",
    css: "💻",
    json: "💻",

    // Others
    exe: "⚙️",
    apk: "📱",
  };

  return iconMap[ext] || "📄";
}

/**
 * Check if file type is previewable
 */
export function isPreviewable(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/") ||
    mimeType === "application/pdf"
  );
}
