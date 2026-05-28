import { useCallback, useEffect, useRef } from "react";
import {
  listPersonalDocuments,
  uploadPersonalDocument,
  deletePersonalDocument,
  selectPersonalSources,
  PersonalAiError,
} from "../api/personalAiApi";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useAuthStore } from "../../../stores/authStore";
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
    createConversation,
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

  const user = useAuthStore((s) => s.user);
  const employeeCode = user?.employeeCode ?? user?.employee_code ?? "";
  const activeConversationId = usePersonalAiStore(
    (s) => s.activeConversationId,
  );

  // Track session đã load để tránh fetch trùng khi component re-render
  // nhưng vẫn fetch lại khi user chuyển conversation.
  const loadedSessionRef = useRef<string | null>(null);

  /**
   * Resolve current session id, creating a conversation if none exists.
   * Ensures upload and chat share the same session_id so BE can find docs.
   */
  const ensureSessionId = useCallback((): string => {
    const current = usePersonalAiStore.getState().activeConversationId;
    if (current) return current;
    return createConversation();
  }, [createConversation]);

  /** Load document list cho session hiện tại. Reload khi conversation đổi. */
  const loadDocuments = useCallback(
    async (force = false) => {
      // KHÔNG tạo conversation khi chỉ tải danh sách tài liệu lúc mount —
      // nếu không, mỗi lần reload sẽ sinh ra một "Cuộc trò chuyện mới" rỗng
      // và đè lên hội thoại đã khôi phục từ localStorage. Chỉ load khi đã có
      // session; việc tạo session để dành cho action upload/hỏi.
      const sessionId = usePersonalAiStore.getState().activeConversationId;
      if (!sessionId) {
        setDocuments([]);
        setDocumentsLoaded(true);
        return;
      }
      if (loadedSessionRef.current === sessionId && !force) return;
      loadedSessionRef.current = sessionId;
      try {
        const docs = await listPersonalDocuments({
          employeeCode,
          sessionId,
        });
        setDocuments(docs);
        setDocumentsLoaded(true);
      } catch {
        setDocumentsLoaded(true);
      }
    },
    [employeeCode, setDocuments, setDocumentsLoaded],
  );

  // Reload mỗi khi activeConversationId thay đổi để doc list khớp session.
  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments, activeConversationId]);

  /** Upload a single document file */
  const uploadDocument = useCallback(
    async (
      file: File,
      options?: { onProgress?: (pct: number) => void },
    ): Promise<boolean> => {
      // BE định danh tài liệu theo employee_code. Thiếu mã NV (user chưa link HR)
      // thì request lên sẽ thiếu field này → BE lỗi / tra sai phòng ban-công ty.
      // Chặn sớm và báo rõ thay vì gửi request rỗng.
      if (!employeeCode) {
        toast.error(
          "Tài khoản chưa có mã nhân viên (chưa liên kết HR). Không thể tải tài liệu lên.",
        );
        return false;
      }
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
          employeeCode,
          sessionId: ensureSessionId(),
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
    [employeeCode, ensureSessionId, addDocument, removeDocument],
  );

  /** Remove a document from the knowledge base */
  const deleteDocument = useCallback(
    async (documentId: string) => {
      const doc = documents.find((d) => d.id === documentId);
      removeDocument(documentId);
      try {
        await deletePersonalDocument(documentId, { employeeCode });
      } catch {
        // Restore on failure
        if (doc) addDocument(doc);
        toast.error("Không thể xóa tài liệu. Vui lòng thử lại.");
      }
    },
    [documents, employeeCode, removeDocument, addDocument],
  );

  /** Toggle source selection and sync with backend */
  const handleToggleSource = useCallback(
    async (documentId: string) => {
      toggleDocumentSelection(documentId);

      const state = usePersonalAiStore.getState();
      // Only send IDs that exist in the currently loaded documents list.
      // This prevents stale IDs (persisted from old sessions in localStorage)
      // from being included, which causes the backend to 404.
      const validIds = new Set(state.documents.map((d) => d.id));
      const next = state.selectedDocumentIds.filter((id) => validIds.has(id));

      try {
        await selectPersonalSources(next, {
          employeeCode,
          sessionId: ensureSessionId(),
        });
        // Silently remove stale IDs from store if any were filtered out
        if (next.length !== state.selectedDocumentIds.length) {
          setSelectedDocumentIds(next);
        }
      } catch (err) {
        // Revert toggle on failure
        toggleDocumentSelection(documentId);
        if (err instanceof PersonalAiError && err.status === 404) {
          // One or more document IDs are no longer valid for this session
          // (backend inconsistency: listed but not accepted as source).
          // Force reload to get the canonical list and clean up stale state.
          toast.error("Tài liệu không còn hợp lệ trong phiên này. Đang làm mới danh sách…");
          void loadDocuments(true);
        } else {
          toast.error("Không thể cập nhật nguồn. Vui lòng thử lại.");
        }
      }
    },
    [employeeCode, ensureSessionId, toggleDocumentSelection, setSelectedDocumentIds, loadDocuments],
  );

  /** Sync selected sources with backend */
  const syncSelectedSources = useCallback(
    async (ids: string[]) => {
      setSelectedDocumentIds(ids);
      try {
        await selectPersonalSources(ids, {
          employeeCode,
          sessionId: ensureSessionId(),
        });
      } catch {
        toast.error("Đồng bộ nguồn thất bại.");
      }
    },
    [employeeCode, ensureSessionId, setSelectedDocumentIds],
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
