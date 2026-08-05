export type CloudItemType =
  "text" | "link" | "file" | "image" | "video" | "audio";

export type CloudItemStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "trashed"
  | "deleting"
  | "deleted";

export interface CloudItem {
  id: string;
  type: CloudItemType;
  status: CloudItemStatus;
  title?: string;
  content?: string;
  url?: string;
  sizeBytes: number;
  deletedAt?: string;
  purgeAfter?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudPage {
  items: CloudItem[];
  nextCursor?: string;
}

export interface CloudQuota {
  limitBytes: number;
  usedBytes: number;
  activeBytes: number;
  trashBytes: number;
  reservedBytes: number;
  availableBytes: number;
  updatedAt: string;
}

export interface CloudUploadSession {
  uploadSessionId: string;
  itemId: string;
  status: "initiated";
  uploadUrl: string;
  method: "PUT";
  requiredHeaders: Record<string, string>;
  sizeBytes: number;
  expiresAt: string;
}

export interface CloudUploadJob {
  id: string;
  type: "hash_file";
  status: "pending" | "processing" | "completed" | "failed" | "dead";
}

export interface CloudUploadComplete {
  item: CloudItem;
  job: CloudUploadJob;
}

export interface CloudDeleteResult {
  itemId: string;
  status: "delete_pending" | "deleted";
  async: boolean;
}

export interface CloudTrashLifecycle {
  itemId: string;
  status: "ready" | "trashed";
  deletedAt?: string;
  purgeAfter?: string;
  applied: boolean;
}

export interface CloudQuotaRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  currentQuotaBytes: number;
  requestedQuotaBytes: number;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  applied?: boolean;
}

export type CloudViewMode = "active" | "trash";

export interface CloudHealth {
  status: "UP" | "DOWN";
  service: string;
  checks?: Record<
    string,
    {
      status: "UP" | "DOWN";
      latencyMs: number;
      error?: string;
    }
  >;
}

export type CloudFilter = "all" | "text" | "image" | "file" | "link";

export type CloudComposerMode = "upload" | "text" | "link";

export interface CloudUploadProgress {
  fileName: string;
  percent: number;
  stage: "reserving" | "uploading" | "finalizing" | "processing";
}
