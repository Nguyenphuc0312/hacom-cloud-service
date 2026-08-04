package cloudapi

import (
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/google/uuid"
)

const idempotencyKeyHeader = "Idempotency-Key"

type trashLifecycleResponse struct {
	ItemID     string     `json:"itemId"`
	Status     string     `json:"status"`
	DeletedAt  *time.Time `json:"deletedAt,omitempty"`
	PurgeAfter *time.Time `json:"purgeAfter,omitempty"`
	Applied    bool       `json:"applied"`
}

type permanentDeleteResponse struct {
	ItemID string `json:"itemId"`
	Status string `json:"status"`
	Async  bool   `json:"async"`
}

func (h *Handler) moveToTrash(writer http.ResponseWriter, request *http.Request) {
	itemID, ok := h.lifecycleRequest(writer, request)
	if !ok {
		return
	}
	result, err := h.trash.MoveToTrash(
		request.Context(), ownerUserID(request.Context()), itemID,
		request.Header.Get(idempotencyKeyHeader),
	)
	if err != nil {
		h.writeTrashError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, trashLifecycleResponse{
		ItemID: result.ItemID.String(), Status: stringValue(result.CurrentState),
		DeletedAt: result.DeletedAt, PurgeAfter: result.PurgeAfter, Applied: result.Applied,
	})
}

func (h *Handler) restoreTrashItem(writer http.ResponseWriter, request *http.Request) {
	itemID, ok := h.lifecycleRequest(writer, request)
	if !ok {
		return
	}
	result, err := h.trash.Restore(
		request.Context(), ownerUserID(request.Context()), itemID,
		request.Header.Get(idempotencyKeyHeader),
	)
	if err != nil {
		h.writeTrashError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, trashLifecycleResponse{
		ItemID: result.ItemID.String(), Status: stringValue(result.CurrentState),
		Applied: result.Applied,
	})
}

func (h *Handler) deleteItemImmediately(writer http.ResponseWriter, request *http.Request) {
	itemID, ok := h.lifecycleRequest(writer, request)
	if !ok {
		return
	}
	result, err := h.trash.DeleteImmediately(
		request.Context(), ownerUserID(request.Context()), itemID,
		request.Header.Get(idempotencyKeyHeader),
	)
	if err != nil {
		h.writeTrashError(writer, request, err)
		return
	}
	status := "deleted"
	if result.StorageDeletion {
		status = "delete_pending"
	}
	writeJSON(writer, http.StatusAccepted, permanentDeleteResponse{
		ItemID: result.ItemID.String(), Status: status, Async: result.StorageDeletion,
	})
}

func (h *Handler) listTrash(writer http.ResponseWriter, request *http.Request) {
	listRequest, ok := parseListRequest(writer, request)
	if !ok {
		return
	}
	page, err := h.trash.List(
		request.Context(), ownerUserID(request.Context()),
		listRequest,
	)
	if err != nil {
		h.writeTrashError(writer, request, err)
		return
	}
	items := make([]itemResponse, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, itemResponseFrom(item))
	}
	writeJSON(writer, http.StatusOK, listItemsResponse{Items: items, NextCursor: page.NextCursor})
}

func (h *Handler) lifecycleRequest(
	writer http.ResponseWriter,
	request *http.Request,
) (uuid.UUID, bool) {
	itemID, err := uuid.Parse(request.PathValue("itemID"))
	if err != nil || itemID == uuid.Nil {
		writeError(writer, http.StatusBadRequest, "INVALID_ITEM_ID", "item ID must be a valid UUID")
		return uuid.Nil, false
	}
	request.Body = http.MaxBytesReader(writer, request.Body, h.maxBodyBytes)
	body, err := io.ReadAll(request.Body)
	if err != nil {
		h.writeDecodeError(writer, err)
		return uuid.Nil, false
	}
	if len(body) != 0 {
		writeError(writer, http.StatusBadRequest, "INVALID_JSON", "request body must be empty")
		return uuid.Nil, false
	}
	return itemID, true
}

func (h *Handler) writeTrashError(
	writer http.ResponseWriter,
	request *http.Request,
	err error,
) {
	switch {
	case errors.Is(err, trashdomain.ErrInvalidInput):
		writeError(writer, http.StatusBadRequest, "INVALID_TRASH_REQUEST", err.Error())
	case errors.Is(err, trashdomain.ErrNotFound):
		writeError(writer, http.StatusNotFound, "ITEM_NOT_FOUND", "cloud item not found")
	case errors.Is(err, cloud.ErrInvalidCursor):
		writeError(writer, http.StatusBadRequest, "INVALID_CURSOR", "pagination cursor is invalid")
	case errors.Is(err, cloud.ErrInvalidFilter):
		writeError(writer, http.StatusBadRequest, "INVALID_FILTER", err.Error())
	case errors.Is(err, trashdomain.ErrInvalidState):
		writeError(writer, http.StatusConflict, "INVALID_ITEM_STATE", "item state does not allow this operation")
	case errors.Is(err, trashdomain.ErrRestoreExpired):
		writeError(writer, http.StatusConflict, "RESTORE_EXPIRED", "Trash restore window has expired")
	case errors.Is(err, trashdomain.ErrDeletePending):
		writeError(writer, http.StatusConflict, "DELETE_PENDING", "permanent delete is already pending")
	case errors.Is(err, trashdomain.ErrIdempotencyConflict):
		writeError(writer, http.StatusConflict, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was used for another Trash operation")
	default:
		h.logInternalError(request, err)
		writeError(writer, http.StatusInternalServerError, "INTERNAL_ERROR", "an internal error occurred")
	}
}

func stringValue(value *trashdomain.ItemState) string {
	if value == nil {
		return ""
	}
	return string(*value)
}
