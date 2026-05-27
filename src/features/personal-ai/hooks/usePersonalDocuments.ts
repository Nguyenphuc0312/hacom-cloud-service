import { useCallback, useEffect, useRef } from "react";
import {
  listPersonalDocuments,
  uploadPersonalDocument,
  deletePersonalDocument,
  selectPersonalSources,
  PersonalAiError,
} from "../api/personalAiApi";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { toast } from "../../../utils/toast";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function isAllowedFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) return true;
  // Fallback: check MIME (some OS/browsers report empty type)
  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) return true;
  return false;
}

export function usePersonalDocuments() {
  const {
    documents,
    selectedDocumentIds,
    documentsLoaded,
    setDocuments,
    addDocument,
    updateDocument,
    removeDocument,
    toggleDocumentSelection,
    setSelectedDocumentIds,
    selectAllDocuments,
    deselectAllDocuments,
    setDocumentsLoaded,
  } = usePersonalAiStore();

  const loadedRef = useRef(false);

  /** Load document list from backend on first mount */
  const loadDocuments = useCallback(
    async (force = false) => {
      if (loadedRef.current && !force) return;
      loadedRef.current = true;
      try {
        const docs = await listPersonalDocuments();
        setDocuments(docs);
        setDocumentsLoaded(true);
      } catch {
        setDocumentsLoaded(true);
      }
    },
    [setDocuments, setDocumentsLoaded],
  );

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  /** Upload a single document file */
  const uploadDocument = useCallback(
    async (
      file: File,
      options?: { onProgress?: (pct: number) => void },
    ): Promise<boolean> => {
      if (!isAllowedFile(file)) {
        toast.error(
          "Chỉ hỗ trợ PDF/DOC/DOCX/XLS/XLSX. Vui lòng chọn tệp hợp lệ.",
        );
        return false;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(
          `Tệp "${file.name}" quá lớn (tối đa 50 MB). Vui lòng chọn tệp nhỏ hơn.`,
        );
        return false;
      }

      // Add optimistic placeholder
      const tempId = `uploading-${crypto.randomUUID()}`;
      addDocument({
        id: tempId,
        name: file.name,
        size_bytes: file.size,
        uploaded_at: new Date().toISOString(),
        status: "uploading",
      });

      try {
        const doc = await uploadPersonalDocument(file, {
          onProgress: options?.onProgress,
        });
        // Replace optimistic entry with real doc
        removeDocument(tempId);
        addDocument({ ...doc, status: "indexed" });
        return true;
      } catch (err) {
        removeDocument(tempId);
        const msg =
          err instanceof PersonalAiError && err.status === 413
            ? "Tệp quá lớn với máy chủ."
            : err instanceof PersonalAiError && err.status === 415
              ? "Định dạng tệp không được hỗ trợ."
              : err instanceof PersonalAiError &&
                  err.kind === "http" &&
                  err.message &&
                  !err.message.startsWith("PersonalAI error")
                ? err.message
                : `Tải lên thất bại: "${file.name}".`;
        toast.error(msg);
        return false;
      }
    },
    [addDocument, removeDocument],
  );

  /** Remove a document from the knowledge base */
  const deleteDocument = useCallback(
    async (documentId: string) => {
      const doc = documents.find((d) => d.id === documentId);
      removeDocument(documentId);
      try {
        await deletePersonalDocument(documentId);
      } catch {
        // Restore on failure
        if (doc) addDocument(doc);
        toast.error("Không thể xóa tài liệu. Vui lòng thử lại.");
      }
    },
    [documents, removeDocument, addDocument],
  );

  /** Toggle source selection and sync with backend */
  const handleToggleSource = useCallback(
    async (documentId: string) => {
      toggleDocumentSelection(documentId);
      const current = usePersonalAiStore.getState().selectedDocumentIds;
      const next = current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId];

      try {
        await selectPersonalSources(next);
      } catch {
        // Revert toggle on failure
        toggleDocumentSelection(documentId);
        toast.error("Không thể cập nhật nguồn. Vui lòng thử lại.");
      }
    },
    [toggleDocumentSelection],
  );

  /** Sync selected sources with backend */
  const syncSelectedSources = useCallback(
    async (ids: string[]) => {
      setSelectedDocumentIds(ids);
      try {
        await selectPersonalSources(ids);
      } catch {
        toast.error("Đồng bộ nguồn thất bại.");
      }
    },
    [setSelectedDocumentIds],
  );

  const activeDocuments = documents.filter((d) =>
    selectedDocumentIds.includes(d.id),
  );

  const isRagMode = selectedDocumentIds.length > 0;

  return {
    documents,
    selectedDocumentIds,
    activeDocuments,
    isRagMode,
    documentsLoaded,
    loadDocuments,
    uploadDocument,
    deleteDocument,
    handleToggleSource,
    syncSelectedSources,
    selectAllDocuments,
    deselectAllDocuments,
    updateDocument,
  };
}
