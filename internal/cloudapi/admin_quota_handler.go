package cloudapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/auth"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	"github.com/google/uuid"
)

const adminActorHeader = "X-Admin-Actor-ID"

type adminQuotaService interface {
	AdminList(context.Context, quotarequest.AdminListFilter) (quotarequest.AdminPage, error)
	Review(context.Context, quotarequest.ReviewCommand) (quotarequest.ReviewResult, error)
}

type adminQuotaHandler struct {
	service       adminQuotaService
	authenticator auth.Authenticator
	logger        *slog.Logger
	metrics       APIMetrics
}

type quotaReviewBody struct {
	Note *string `json:"note,omitempty"`
}

type adminQuotaResponse struct {
	ID                  string              `json:"id"`
	OwnerUserID         string              `json:"ownerUserId"`
	Status              quotarequest.Status `json:"status"`
	CurrentQuotaBytes   int64               `json:"currentQuotaBytes"`
	RequestedQuotaBytes int64               `json:"requestedQuotaBytes"`
	QuotaBytes          int64               `json:"quotaBytes"`
	UsedBytes           int64               `json:"usedBytes"`
	ReservedBytes       int64               `json:"reservedBytes"`
	TrashBytes          int64               `json:"trashBytes"`
	Reason              *string             `json:"reason,omitempty"`
	ReviewedByUserID    *string             `json:"reviewedByUserId,omitempty"`
	ReviewedAt          *time.Time          `json:"reviewedAt,omitempty"`
	ReviewNote          *string             `json:"reviewNote,omitempty"`
	CreatedAt           time.Time           `json:"createdAt"`
	UpdatedAt           time.Time           `json:"updatedAt"`
	Applied             *bool               `json:"applied,omitempty"`
}

func NewAdminQuotaHandler(service adminQuotaService, authenticator auth.Authenticator, logger *slog.Logger, metrics ...APIMetrics) (http.Handler, error) {
	if service == nil || authenticator == nil || logger == nil {
		return nil, errors.New("admin quota service, authenticator and logger are required")
	}
	h := &adminQuotaHandler{service: service, authenticator: authenticator, logger: logger}
	if len(metrics) > 0 {
		h.metrics = metrics[0]
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/quota/requests", h.list)
	mux.HandleFunc("/admin/quota/requests", methodNotAllowed(http.MethodGet))
	mux.HandleFunc("POST /admin/quota/requests/{requestID}/approve", h.approve)
	mux.HandleFunc("/admin/quota/requests/{requestID}/approve", methodNotAllowed(http.MethodPost))
	mux.HandleFunc("POST /admin/quota/requests/{requestID}/reject", h.reject)
	mux.HandleFunc("/admin/quota/requests/{requestID}/reject", methodNotAllowed(http.MethodPost))
	mux.HandleFunc("/", h.notFound)
	return h.authenticator.Middleware(mux), nil
}

func (h *adminQuotaHandler) list(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	for key, values := range query {
		if key != "status" && key != "limit" && key != "cursor" {
			writeError(w, 400, "INVALID_QUOTA_ADMIN_FILTER", "only status, limit and cursor are supported")
			return
		}
		if len(values) != 1 {
			writeError(w, 400, "INVALID_QUOTA_ADMIN_FILTER", "each filter must be supplied exactly once")
			return
		}
	}
	limit := 25
	var err error
	if raw := query.Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil {
			writeError(w, 400, "INVALID_QUOTA_ADMIN_FILTER", "limit must be an integer")
			return
		}
	}
	page, err := h.service.AdminList(r.Context(), quotarequest.AdminListFilter{Status: quotarequest.Status(query.Get("status")), Limit: limit, Cursor: query.Get("cursor")})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	items := make([]adminQuotaResponse, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, adminQuotaResponseFrom(item))
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"items": items, "nextCursor": page.NextCursor})
}
func (h *adminQuotaHandler) approve(w http.ResponseWriter, r *http.Request) {
	h.review(w, r, quotarequest.StatusApproved)
}
func (h *adminQuotaHandler) reject(w http.ResponseWriter, r *http.Request) {
	h.review(w, r, quotarequest.StatusRejected)
}
func (h *adminQuotaHandler) review(w http.ResponseWriter, r *http.Request, decision quotarequest.Status) {
	if r.URL.RawQuery != "" {
		writeError(w, 400, "INVALID_QUOTA_REVIEW", "review does not accept query parameters")
		return
	}
	id, err := uuid.Parse(r.PathValue("requestID"))
	if err != nil || id == uuid.Nil {
		writeError(w, 400, "INVALID_QUOTA_REVIEW", "request ID must be a valid UUID")
		return
	}
	actor, err := uuid.Parse(strings.TrimSpace(r.Header.Get(adminActorHeader)))
	if err != nil || actor == uuid.Nil {
		writeError(w, 400, "INVALID_ADMIN_ACTOR", "X-Admin-Actor-ID must be a valid UUID")
		return
	}
	var body quotaReviewBody
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&body); err != nil {
		writeError(w, 400, "INVALID_QUOTA_REVIEW", "body must be a JSON object")
		return
	}
	if err = decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, 400, "INVALID_QUOTA_REVIEW", "body must contain one JSON object")
		return
	}
	result, err := h.service.Review(r.Context(), quotarequest.ReviewCommand{RequestID: id, ActorUserID: actor, Decision: decision, OperationID: r.Header.Get(idempotencyKeyHeader), Note: body.Note, RequestIDTrace: r.Header.Get(requestIDHeader)})
	if err != nil {
		if h.metrics != nil {
			h.metrics.RecordAdminReview(reviewDecisionLabel(decision), adminReviewMetricOutcome(err))
		}
		h.writeError(w, r, err)
		return
	}
	if h.metrics != nil {
		outcome := "idempotent"
		if result.Applied {
			outcome = "applied"
		}
		h.metrics.RecordAdminReview(reviewDecisionLabel(decision), outcome)
	}
	response := adminQuotaResponseFrom(result.Item)
	response.Applied = &result.Applied
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, response)
}
func adminReviewMetricOutcome(err error) string {
	for _, expected := range []error{quotarequest.ErrInvalidInput, quotarequest.ErrNotFound, quotarequest.ErrInvalidState, quotarequest.ErrQuotaBelowUsage, quotarequest.ErrReviewConflict} {
		if errors.Is(err, expected) {
			return "rejected"
		}
	}
	return "error"
}
func reviewDecisionLabel(decision quotarequest.Status) string {
	if decision == quotarequest.StatusApproved {
		return "approve"
	}
	if decision == quotarequest.StatusRejected {
		return "reject"
	}
	return "unknown"
}
func adminQuotaResponseFrom(item quotarequest.AdminListItem) adminQuotaResponse {
	var reviewer *string
	if item.ReviewedByUserID != nil {
		value := item.ReviewedByUserID.String()
		reviewer = &value
	}
	return adminQuotaResponse{ID: item.ID.String(), OwnerUserID: item.OwnerUserID.String(), Status: item.Status, CurrentQuotaBytes: item.CurrentQuotaBytes, RequestedQuotaBytes: item.RequestedQuotaBytes, QuotaBytes: item.QuotaBytes, UsedBytes: item.UsedBytes, ReservedBytes: item.ReservedBytes, TrashBytes: item.TrashBytes, Reason: item.Reason, ReviewedByUserID: reviewer, ReviewedAt: item.ReviewedAt, ReviewNote: item.ReviewNote, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}
}
func (h *adminQuotaHandler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, quotarequest.ErrInvalidInput):
		writeError(w, 400, "INVALID_QUOTA_REVIEW", err.Error())
	case errors.Is(err, quotarequest.ErrNotFound):
		writeError(w, 404, "QUOTA_REQUEST_NOT_FOUND", "quota request not found")
	case errors.Is(err, quotarequest.ErrInvalidState):
		writeError(w, 409, "QUOTA_REQUEST_INVALID_STATE", "quota request is no longer pending")
	case errors.Is(err, quotarequest.ErrQuotaBelowUsage):
		writeError(w, 409, "QUOTA_BELOW_CONSUMPTION", "requested quota is below used plus reserved bytes")
	case errors.Is(err, quotarequest.ErrReviewConflict):
		writeError(w, 409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with a different decision")
	default:
		h.logger.Error("admin quota operation failed", "error", err, "path", r.URL.Path)
		writeError(w, 500, "INTERNAL_ERROR", "internal server error")
	}
}
func (h *adminQuotaHandler) notFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, 404, "NOT_FOUND", "resource not found")
}
