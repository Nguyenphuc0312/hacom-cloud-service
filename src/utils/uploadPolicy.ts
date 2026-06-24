import { FileType } from "../types";

export const UPLOAD_VALIDATION_CODES = {
  UNSUPPORTED_MIME_TYPE: "UNSUPPORTED_MIME_TYPE",
  MIME_EXTENSION_MISMATCH: "MIME_EXTENSION_MISMATCH",
} as const;

export type UploadValidationCode =
  (typeof UPLOAD_VALIDATION_CODES)[keyof typeof UPLOAD_VALIDATION_CODES];

export type UploadFileCategory =
  | typeof FileType.IMAGE
  | typeof FileType.VIDEO
  | typeof FileType.AUDIO
  | typeof FileType.DOCUMENT
  | typeof FileType.ARCHIVE
  | "generic";

export interface AllowedUploadFileType {
  extensions: readonly string[];
  category: UploadFileCategory;
}

export const ALLOWED_UPLOAD_FILE_TYPES: Record<string, AllowedUploadFileType> = {
  "image/jpeg": { extensions: [".jpg", ".jpeg"], category: FileType.IMAGE },
  "image/png": { extensions: [".png"], category: FileType.IMAGE },
  "image/gif": { extensions: [".gif"], category: FileType.IMAGE },
  "image/webp": { extensions: [".webp"], category: FileType.IMAGE },
  "image/bmp": { extensions: [".bmp"], category: FileType.IMAGE },
  "video/mp4": { extensions: [".mp4"], category: FileType.VIDEO },
  "video/webm": { extensions: [".webm"], category: FileType.VIDEO },
  "video/quicktime": { extensions: [".mov"], category: FileType.VIDEO },
  "video/x-msvideo": { extensions: [".avi"], category: FileType.VIDEO },
  "video/x-matroska": { extensions: [".mkv"], category: FileType.VIDEO },
  "audio/mpeg": { extensions: [".mp3"], category: FileType.AUDIO },
  "audio/wav": { extensions: [".wav"], category: FileType.AUDIO },
  "audio/x-wav": { extensions: [".wav"], category: FileType.AUDIO },
  "audio/ogg": { extensions: [".ogg"], category: FileType.AUDIO },
  "audio/webm": { extensions: [".webm", ".weba"], category: FileType.AUDIO },
  "audio/mp4": { extensions: [".m4a"], category: FileType.AUDIO },
  "application/pdf": { extensions: [".pdf"], category: FileType.DOCUMENT },
  "text/plain": { extensions: [".txt"], category: FileType.DOCUMENT },
  "text/csv": { extensions: [".csv"], category: FileType.DOCUMENT },
  "application/csv": { extensions: [".csv"], category: FileType.DOCUMENT },
  "application/msword": { extensions: [".doc"], category: FileType.DOCUMENT },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: [".docx"],
    category: FileType.DOCUMENT,
  },
  "application/vnd.ms-excel": { extensions: [".xls"], category: FileType.DOCUMENT },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    extensions: [".xlsx"],
    category: FileType.DOCUMENT,
  },
  "application/vnd.ms-powerpoint": { extensions: [".ppt"], category: FileType.DOCUMENT },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    extensions: [".pptx"],
    category: FileType.DOCUMENT,
  },
  "application/vnd.oasis.opendocument.text": {
    extensions: [".odt"],
    category: FileType.DOCUMENT,
  },
  "application/vnd.oasis.opendocument.spreadsheet": {
    extensions: [".ods"],
    category: FileType.DOCUMENT,
  },
  "application/vnd.oasis.opendocument.presentation": {
    extensions: [".odp"],
    category: FileType.DOCUMENT,
  },
  "application/zip": { extensions: [".zip"], category: FileType.ARCHIVE },
  "application/x-zip-compressed": { extensions: [".zip"], category: FileType.ARCHIVE },
  "application/x-7z-compressed": { extensions: [".7z"], category: FileType.ARCHIVE },
  "application/vnd.rar": { extensions: [".rar"], category: FileType.ARCHIVE },
  "application/x-rar-compressed": { extensions: [".rar"], category: FileType.ARCHIVE },
  "application/x-tar": { extensions: [".tar"], category: FileType.ARCHIVE },
  "application/gzip": { extensions: [".gz", ".tgz", ".tar.gz"], category: FileType.ARCHIVE },
  "application/x-gzip": { extensions: [".gz", ".tgz", ".tar.gz"], category: FileType.ARCHIVE },
};

export const DEFAULT_ALLOWED_UPLOAD_MIME_TYPES = Object.freeze(
  Object.keys(ALLOWED_UPLOAD_FILE_TYPES),
);

export const UPLOAD_INPUT_ACCEPT = DEFAULT_ALLOWED_UPLOAD_MIME_TYPES.join(",");

export const PHOTO_UPLOAD_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
].join(",");

export const DOCUMENT_UPLOAD_ACCEPT = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
].join(",");

export const UPLOAD_LIMITS = {
  maxFilesPerMessage: 10,
  maxTotalSizePerMessage: 471_859_200,
  maxBytesByCategory: {
    image: 39_321_600,
    video: 104_857_600,
    audio: 104_857_600,
    document: 104_857_600,
    archive: 104_857_600,
    generic: 78_643_200,
    avatar: 10_485_760,
    group_avatar: 10_485_760,
  },
} as const;

const PREFERRED_MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/x-rar-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".tgz": "application/gzip",
  ".tar.gz": "application/gzip",
};

export const normalizeUploadMimeType = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const getUploadFileExtension = (fileName: string): string => {
  const trimmed = fileName.trim();
  if (trimmed.toLowerCase().endsWith(".tar.gz")) {
    return ".tar.gz";
  }
  const dotIndex = trimmed.lastIndexOf(".");
  return dotIndex >= 0 ? trimmed.slice(dotIndex).toLowerCase() : "";
};

export const inferUploadMimeTypeFromFileName = (
  fileName: string,
): string | undefined => PREFERRED_MIME_BY_EXTENSION[getUploadFileExtension(fileName)];

export const resolveUploadFileCategory = (
  mimeType: string,
): UploadFileCategory | undefined =>
  ALLOWED_UPLOAD_FILE_TYPES[normalizeUploadMimeType(mimeType)]?.category;

export const resolveUploadCategoryForMimeType = (
  mimeType: string,
): UploadFileCategory => resolveUploadFileCategory(mimeType) ?? "generic";

export const resolveUploadFileType = (mimeType: string): FileType =>
  (resolveUploadFileCategory(mimeType) as FileType | undefined) ?? FileType.OTHER;

export const resolveUploadMimeTypeForFile = (
  file: Pick<File, "name" | "type">,
): string | undefined => {
  const normalizedType = normalizeUploadMimeType(file.type);
  if (normalizedType) {
    return normalizedType;
  }

  return inferUploadMimeTypeFromFileName(file.name);
};

export const resolveUploadMaxBytesForMimeType = (mimeType: string): number => {
  const category = resolveUploadCategoryForMimeType(mimeType);
  return UPLOAD_LIMITS.maxBytesByCategory[category];
};

export const resolveUploadMaxBytesForFile = (
  file: Pick<File, "name" | "type">,
): number => {
  const mimeType = resolveUploadMimeTypeForFile(file) ?? "";
  return resolveUploadMaxBytesForMimeType(mimeType);
};

export type UploadFileTypeValidationResult =
  | {
      ok: true;
      mimeType: string;
      extension: string;
      category: UploadFileCategory;
    }
  | {
      ok: false;
      code: UploadValidationCode;
      mimeType: string;
      extension: string;
      expectedExtensions: string[];
    };

export const validateUploadFileType = (input: {
  fileName: string;
  mimeType: string;
}): UploadFileTypeValidationResult => {
  const mimeType = normalizeUploadMimeType(input.mimeType);
  const extension = getUploadFileExtension(input.fileName);
  const definition = ALLOWED_UPLOAD_FILE_TYPES[mimeType];

  if (!definition) {
    return {
      ok: false,
      code: UPLOAD_VALIDATION_CODES.UNSUPPORTED_MIME_TYPE,
      mimeType,
      extension,
      expectedExtensions: [],
    };
  }

  if (!extension || !definition.extensions.includes(extension)) {
    return {
      ok: false,
      code: UPLOAD_VALIDATION_CODES.MIME_EXTENSION_MISMATCH,
      mimeType,
      extension,
      expectedExtensions: [...definition.extensions],
    };
  }

  return {
    ok: true,
    mimeType,
    extension,
    category: definition.category,
  };
};
