package cloudapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
)

type createQuotaRequestBody struct {
	RequestedQuotaBytes int64   `json:"requestedQuotaBytes"`
	Reason              *string `json:"reason,omitempty"`
}

type quotaRequestResponse struct {
	ID                  string              `json:"id"`
	Status              quotarequest.Status `json:"status"`
	CurrentQuotaBytes   int64               `json:"currentQuotaBytes"`
	RequestedQuotaBytes int64               `json:"requestedQuotaBytes"`
	Reason              *string             `json:"reason,omitempty"`
	CreatedAt           time.Time           `json:"createdAt"`
	UpdatedAt           time.Time           `json:"updatedAt"`
	Applied             *bool               `json:"applied,omitempty"`
}

func (h *Handler) createQuotaRequest(writer http.ResponseWriter, request *http.Request) {
	if request.URL.RawQuery != "" {
		writeError(writer, http.StatusBadRequest, "INVALID_QUOTA_REQUEST", "quota request does not accept query parameters")
		return
	}
	var input createQuotaRequestBody
	if err := h.decodeJSON(writer, request, &input); err != nil {
		h.writeDecodeError(writer, err)
		return
	}
	result, err := h.quotaRequests.Create(request.Context(), quotarequest.CreateCommand{
		OwnerUserID:         ownerUserID(request.Context()),
		RequestedQuotaBytes: input.RequestedQuotaBytes,
		IdempotencyKey:      request.Header.Get(idempotencyKeyHeader),
		Reason:              input.Reason,
	})
	if err != nil {
		if h.metrics != nil {
			h.metrics.RecordQuotaRequest("create", quotaRequestMetricOutcome(err))
		}
		h.writeQuotaRequestError(writer, request, err)
		return
	}
	if h.metrics != nil {
		if result.Applied {
			h.metrics.RecordQuotaRequest("create", "applied")
		} else {
			h.metrics.RecordQuotaRequest("create", "idempotent")
		}
	}
	status := http.StatusCreated
	if !result.Applied {
		status = http.StatusOK
	}
	response := quotaRequestResponseFrom(result.Request)
	response.Applied = &result.Applied
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, status, response)
}

func (h *Handler) getCurrentQuotaRequest(writer http.ResponseWriter, request *http.Request) {
	if request.URL.RawQuery != "" {
		writeError(writer, http.StatusBadRequest, "INVALID_QUOTA_REQUEST", "current quota request does not accept query parameters")
		return
	}
	current, err := h.quotaRequests.Current(request.Context(), ownerUserID(request.Context()))
	if err != nil {
		if h.metrics != nil {
			h.metrics.RecordQuotaRequest("current", quotaRequestMetricOutcome(err))
		}
		h.writeQuotaRequestError(writer, request, err)
		return
	}
	if h.metrics != nil {
		h.metrics.RecordQuotaRequest("current", "applied")
	}
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, http.StatusOK, quotaRequestResponseFrom(current))
}

func quotaRequestMetricOutcome(err error) string {
	for _, expected := range []error{quotarequest.ErrInvalidTier, quotarequest.ErrInvalidInput, quotarequest.ErrPendingExists, quotarequest.ErrIdempotencyConflict, quotarequest.ErrNotFound, cloud.ErrDriveNotActive} {
		if errors.Is(err, expected) {
			return "rejected"
		}
	}
	return "error"
}

func quotaRequestResponseFrom(request quotarequest.Request) quotaRequestResponse {
	return quotaRequestResponse{
		ID:                  request.ID.String(),
		Status:              request.Status,
		CurrentQuotaBytes:   request.CurrentQuotaBytes,
		RequestedQuotaBytes: request.RequestedQuotaBytes,
		Reason:              request.Reason,
		CreatedAt:           request.CreatedAt,
		UpdatedAt:           request.UpdatedAt,
	}
}

func (h *Handler) writeQuotaRequestError(writer http.ResponseWriter, request *http.Request, err error) {
	switch {
	case errors.Is(err, quotarequest.ErrInvalidTier):
		writeError(writer, http.StatusBadRequest, "INVALID_QUOTA_TIER", "requested quota tier is not allowed")
	case errors.Is(err, quotarequest.ErrInvalidInput):
		writeError(writer, http.StatusBadRequest, "INVALID_QUOTA_REQUEST", err.Error())
	case errors.Is(err, quotarequest.ErrPendingExists):
		writeError(writer, http.StatusConflict, "QUOTA_REQUEST_PENDING", "a pending quota request already exists")
	case errors.Is(err, quotarequest.ErrIdempotencyConflict):
		writeError(writer, http.StatusConflict, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with different quota-request input")
	case errors.Is(err, quotarequest.ErrNotFound):
		writeError(writer, http.StatusNotFound, "QUOTA_REQUEST_NOT_FOUND", "quota request not found")
	case errors.Is(err, cloud.ErrDriveNotActive):
		writeError(writer, http.StatusConflict, "DRIVE_NOT_ACTIVE", "cloud drive is not active")
	default:
		h.logger.Error("quota-request operation failed", "error", err, "path", request.URL.Path)
		writeError(writer, http.StatusInternalServerError, "INTERNAL_ERROR", "internal server error")
	}
}
