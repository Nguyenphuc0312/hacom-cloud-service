package cloudadmin

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/auth"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	requestIDHeader   = "X-Request-ID"
	idempotencyHeader = "Idempotency-Key"
	defaultLimit      = 25
	maxLimit          = 100
)

type quotaService interface {
	AdminList(context.Context, quotarequest.AdminListFilter) (quotarequest.AdminPage, error)
	Review(context.Context, quotarequest.ReviewCommand) (quotarequest.ReviewResult, error)
}

type trashService interface {
	Restore(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error)
	DeleteImmediately(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error)
}

type ObservabilityConfig struct {
	CloudAPIMetricsURL string
	PrometheusURL      string
	GrafanaURL         string
	WorkerMetricsURL   string
	HTTPTimeout        time.Duration
	UserDirectory      UserDirectory
}

type UserDirectory interface {
	ResolveUsers(context.Context, []uuid.UUID) (map[uuid.UUID]auth.UserIdentity, error)
}

type Handler struct {
	pool                *pgxpool.Pool
	quotaRequests       quotaService
	trash               trashService
	authenticator       auth.Authenticator
	logger              *slog.Logger
	observabilityConfig ObservabilityConfig
	httpClient          *http.Client
	userDirectory       UserDirectory
}

func New(pool *pgxpool.Pool, quotaRequests quotaService, trash trashService, authenticator auth.Authenticator, logger *slog.Logger, observability ...ObservabilityConfig) (http.Handler, error) {
	if pool == nil || quotaRequests == nil || trash == nil || authenticator == nil || logger == nil {
		return nil, errors.New("Cloud Admin pool, services, authenticator and logger are required")
	}
	observabilityConfig := ObservabilityConfig{
		CloudAPIMetricsURL: "http://localhost:8080/metrics",
		PrometheusURL:      "http://localhost:9090",
		GrafanaURL:         "http://localhost:3001",
		WorkerMetricsURL:   "http://localhost:9091/metrics",
		HTTPTimeout:        2 * time.Second,
	}
	if len(observability) > 0 {
		observabilityConfig = observability[0]
	}
	if observabilityConfig.HTTPTimeout <= 0 {
		observabilityConfig.HTTPTimeout = 2 * time.Second
	}
	h := &Handler{
		pool:                pool,
		quotaRequests:       quotaRequests,
		trash:               trash,
		authenticator:       authenticator,
		logger:              logger,
		observabilityConfig: observabilityConfig,
		httpClient:          &http.Client{Timeout: observabilityConfig.HTTPTimeout},
		userDirectory:       observabilityConfig.UserDirectory,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /overview", h.overview)
	mux.HandleFunc("GET /observability", h.observability)
	mux.HandleFunc("GET /users", h.users)
	mux.HandleFunc("GET /drives", h.drives)
	mux.HandleFunc("GET /items", h.items)
	mux.HandleFunc("GET /trash", h.trashItems)
	mux.HandleFunc("POST /items/{itemID}/restore", h.restoreItem)
	mux.HandleFunc("POST /items/{itemID}/purge", h.purgeItem)
	mux.HandleFunc("GET /jobs", h.jobs)
	mux.HandleFunc("GET /jobs/{jobID}", h.job)
	mux.HandleFunc("POST /jobs/{jobID}/retry", h.retryJob)
	mux.HandleFunc("POST /jobs/{jobID}/cancel", h.cancelJob)
	mux.HandleFunc("GET /audit", h.audit)
	mux.HandleFunc("GET /quota-requests", h.quotaList)
	mux.HandleFunc("POST /quota-requests/{requestID}/approve", h.quotaApprove)
	mux.HandleFunc("POST /quota-requests/{requestID}/reject", h.quotaReject)
	mux.HandleFunc("/", h.notFound)
	return h.requestIDMiddleware(h.authenticator.Middleware(mux)), nil
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeData(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": data})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "error": apiError{Code: code, Message: message}})
}

func (h *Handler) requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.Header.Get(requestIDHeader))
		if id == "" {
			id = uuid.NewString()
		}
		w.Header().Set(requestIDHeader, id)
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) notFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotFound, "CLOUD_RESOURCE_NOT_FOUND", "Cloud Admin resource not found")
}

func parseLimit(r *http.Request) (int, error) {
	limit := defaultLimit
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return 0, errors.New("limit must be an integer")
		}
		limit = parsed
	}
	if limit < 1 || limit > maxLimit {
		return 0, fmt.Errorf("limit must be between 1 and %d", maxLimit)
	}
	return limit, nil
}

type pageCursor struct {
	Sort, Order, Value string
	ID                 uuid.UUID
}

func encodeCursor(sort, order, value string, id uuid.UUID) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strings.Join([]string{sort, order, value, id.String()}, "|")))
}

func decodeCursor(raw, sort, order string) (pageCursor, error) {
	if raw == "" {
		return pageCursor{}, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return pageCursor{}, errors.New("cursor is invalid")
	}
	parts := strings.Split(string(decoded), "|")
	if len(parts) != 4 || parts[0] != sort || parts[1] != order {
		return pageCursor{}, errors.New("cursor does not match the requested sort")
	}
	id, err := uuid.Parse(parts[3])
	if err != nil || id == uuid.Nil || parts[2] == "" {
		return pageCursor{}, errors.New("cursor is invalid")
	}
	return pageCursor{Sort: parts[0], Order: parts[1], Value: parts[2], ID: id}, nil
}

func order(value string) string {
	if strings.EqualFold(value, "asc") {
		return "asc"
	}
	return "desc"
}

func cursorPredicate(order, valueExpression, idExpression string, parameter int) string {
	op := "<"
	if order == "asc" {
		op = ">"
	}
	return fmt.Sprintf(" AND (%s, %s) %s ($%d, $%d)", valueExpression, idExpression, op, parameter, parameter+1)
}

func optionalTime(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	result := value.Time.UTC()
	return &result
}
func optionalUUID(value pgtype.UUID) *string {
	if !value.Valid {
		return nil
	}
	result := uuid.UUID(value.Bytes).String()
	return &result
}
func parseUUID(value, field string) (uuid.UUID, error) {
	parsed, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil || parsed == uuid.Nil {
		return uuid.Nil, fmt.Errorf("%s must be a valid UUID", field)
	}
	return parsed, nil
}
func mustUUID(value string) uuid.UUID { parsed, _ := uuid.Parse(value); return parsed }
func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

type overviewResponse struct {
	GeneratedAt     time.Time `json:"generatedAt"`
	ActiveDrives    int64     `json:"activeDrives"`
	UsedBytes       int64     `json:"usedBytes"`
	ReservedBytes   int64     `json:"reservedBytes"`
	TrashBytes      int64     `json:"trashBytes"`
	PendingQuota    int64     `json:"pendingQuotaRequests"`
	ProcessingItems int64     `json:"processingItems"`
	FailedItems     int64     `json:"failedItems"`
	DeadJobs        int64     `json:"deadJobs"`
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	var response overviewResponse
	err := h.pool.QueryRow(r.Context(), `SELECT (SELECT COUNT(*) FROM cloud.drives WHERE status='active'), COALESCE((SELECT SUM(used_bytes) FROM cloud.quotas),0), COALESCE((SELECT SUM(reserved_bytes) FROM cloud.quotas),0), COALESCE((SELECT SUM(trash_bytes) FROM cloud.quotas),0), (SELECT COUNT(*) FROM cloud.quota_requests WHERE status='pending'), (SELECT COUNT(*) FROM cloud.items WHERE status='processing'), (SELECT COUNT(*) FROM cloud.items WHERE status='failed'), (SELECT COUNT(*) FROM cloud.jobs WHERE status='dead')`).Scan(&response.ActiveDrives, &response.UsedBytes, &response.ReservedBytes, &response.TrashBytes, &response.PendingQuota, &response.ProcessingItems, &response.FailedItems, &response.DeadJobs)
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	response.GeneratedAt = time.Now().UTC()
	writeData(w, http.StatusOK, response)
}

type prometheusQueryResponse struct {
	Status    string `json:"status"`
	Error     string `json:"error"`
	ErrorType string `json:"errorType"`
	Data      struct {
		Result []struct {
			Value []json.RawMessage `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

func (h *Handler) probe(ctx context.Context, endpoint string) error {
	if strings.TrimSpace(endpoint) == "" {
		return errors.New("endpoint is not configured")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	response, err := h.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("received HTTP %d", response.StatusCode)
	}
	return nil
}

func (h *Handler) queryPrometheus(ctx context.Context, expression string) ([]float64, error) {
	endpoint := strings.TrimRight(h.observabilityConfig.PrometheusURL, "/") + "/api/v1/query?query=" + url.QueryEscape(expression)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	response, err := h.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	var payload prometheusQueryResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&payload); err != nil {
		return nil, err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("received HTTP %d", response.StatusCode)
	}
	if payload.Status != "success" {
		if payload.Error != "" {
			return nil, errors.New(payload.Error)
		}
		return nil, errors.New("Prometheus query failed")
	}
	values := make([]float64, 0, len(payload.Data.Result))
	for _, result := range payload.Data.Result {
		if len(result.Value) < 2 {
			continue
		}
		var rawValue string
		if err := json.Unmarshal(result.Value[1], &rawValue); err != nil {
			continue
		}
		value, err := strconv.ParseFloat(rawValue, 64)
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			continue
		}
		values = append(values, value)
	}
	return values, nil
}

func firstPrometheusValue(values []float64) any {
	if len(values) == 0 {
		return nil
	}
	return values[0]
}

func hasUpTarget(values []float64) bool {
	for _, value := range values {
		if value >= 1 {
			return true
		}
	}
	return false
}

func (h *Handler) observability(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	warnings := make([]string, 0, 5)

	prometheusStatus := "unavailable"
	if err := h.probe(ctx, strings.TrimRight(h.observabilityConfig.PrometheusURL, "/")+"/-/ready"); err != nil {
		warnings = append(warnings, "Prometheus chưa sẵn sàng: "+err.Error())
	} else {
		prometheusStatus = "available"
	}

	apiStatus := "unavailable"
	if err := h.probe(ctx, h.observabilityConfig.CloudAPIMetricsURL); err != nil {
		warnings = append(warnings, "Cloud API metrics chưa sẵn sàng: "+err.Error())
	} else {
		apiStatus = "available"
	}

	workerStatus := "unavailable"
	if err := h.probe(ctx, h.observabilityConfig.WorkerMetricsURL); err != nil {
		warnings = append(warnings, "Cloud worker metrics chưa sẵn sàng: "+err.Error())
	} else {
		workerStatus = "available"
	}

	grafanaStatus := "unavailable"
	if err := h.probe(ctx, strings.TrimRight(h.observabilityConfig.GrafanaURL, "/")+"/api/health"); err != nil {
		warnings = append(warnings, "Grafana chưa sẵn sàng: "+err.Error())
	} else {
		grafanaStatus = "available"
	}

	signals := map[string]any{
		"searchP95Ms":               nil,
		"quotaRequestRatePerMinute": nil,
		"reviewErrorRatePerMinute":  nil,
		"workerDeadJobsIncrease":    nil,
		"workerRetryRatePerMinute":  nil,
	}
	if prometheusStatus == "available" {
		queries := map[string]string{
			"searchP95Ms":               "histogram_quantile(0.95, sum(rate(hacom_cloud_search_latency_seconds_bucket[5m])) by (le)) * 1000",
			"quotaRequestRatePerMinute": "sum(rate(hacom_cloud_quota_request_total[5m])) * 60",
			"reviewErrorRatePerMinute":  "sum(rate(hacom_cloud_admin_review_total{outcome=\"error\"}[5m])) * 60",
			"workerDeadJobsIncrease":    "sum(increase(hacom_cloud_worker_dead_jobs_total[5m]))",
			"workerRetryRatePerMinute":  "sum(rate(hacom_cloud_worker_job_retries_total[5m])) * 60",
		}
		for signal, expression := range queries {
			values, err := h.queryPrometheus(ctx, expression)
			if err != nil {
				warnings = append(warnings, "Prometheus signal "+signal+" unavailable: "+err.Error())
				continue
			}
			signals[signal] = firstPrometheusValue(values)
		}

		apiTarget, err := h.queryPrometheus(ctx, `up{job="cloud-api"}`)
		if err != nil || !hasUpTarget(apiTarget) {
			apiStatus = "degraded"
			warnings = append(warnings, "Prometheus chưa scrape được cloud-api.")
		}
		workerTarget, err := h.queryPrometheus(ctx, `up{job="cloud-worker"}`)
		if err != nil || !hasUpTarget(workerTarget) {
			workerStatus = "degraded"
			warnings = append(warnings, "Prometheus chưa scrape được cloud-worker.")
		}
	}

	sources := map[string]any{
		"prometheus":         prometheusStatus,
		"cloudApiMetrics":    apiStatus,
		"cloudWorkerMetrics": workerStatus,
		"grafana": map[string]any{
			"status":               grafanaStatus,
			"url":                  h.observabilityConfig.GrafanaURL,
			"isPubliclyAccessible": false,
		},
	}
	allAvailable := prometheusStatus == "available" && apiStatus == "available" && workerStatus == "available" && grafanaStatus == "available"
	allUnavailable := prometheusStatus == "unavailable" && apiStatus == "unavailable" && workerStatus == "unavailable" && grafanaStatus == "unavailable"
	freshness := "partial"
	if allAvailable {
		freshness = "live"
	} else if allUnavailable {
		freshness = "unavailable"
	}
	writeData(w, http.StatusOK, map[string]any{
		"generatedAt": time.Now().UTC(),
		"freshness":   freshness,
		"sources":     sources,
		"signals":     signals,
		"warnings":    warnings,
	})
}

type userReadModel struct {
	UserID         string    `json:"userId"`
	Status         string    `json:"status"`
	DriveCount     int64     `json:"driveCount"`
	QuotaBytes     int64     `json:"quotaBytes"`
	UsedBytes      int64     `json:"usedBytes"`
	ReservedBytes  int64     `json:"reservedBytes"`
	TrashBytes     int64     `json:"trashBytes"`
	ItemCount      int64     `json:"itemCount"`
	LastActivityAt time.Time `json:"lastActivityAt"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}
type driveReadModel struct {
	DriveID        string    `json:"driveId"`
	OwnerUserID    string    `json:"ownerUserId"`
	Status         string    `json:"status"`
	QuotaBytes     int64     `json:"quotaBytes"`
	UsedBytes      int64     `json:"usedBytes"`
	ReservedBytes  int64     `json:"reservedBytes"`
	TrashBytes     int64     `json:"trashBytes"`
	ItemCount      int64     `json:"itemCount"`
	LastActivityAt time.Time `json:"lastActivityAt"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}
type itemReadModel struct {
	ItemID      string     `json:"itemId"`
	DriveID     string     `json:"driveId"`
	OwnerUserID string     `json:"ownerUserId"`
	Type        string     `json:"type"`
	Status      string     `json:"status"`
	SizeBytes   int64      `json:"sizeBytes"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	DeletedAt   *time.Time `json:"deletedAt"`
	PurgeAfter  *time.Time `json:"purgeAfter"`
}

func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	limit, err := parseLimit(r)
	if err != nil {
		writeError(w, 400, "INVALID_FILTER", err.Error())
		return
	}
	sortValue := r.URL.Query().Get("sortBy")
	if sortValue == "" {
		sortValue = "updatedAt"
	}
	orderValue := order(r.URL.Query().Get("sortOrder"))
	sortExpression := map[string]string{"updatedAt": "updated_at", "usedBytes": "used_bytes"}[sortValue]
	if sortExpression == "" {
		writeError(w, 400, "INVALID_FILTER", "sortBy is invalid")
		return
	}
	cursor, err := decodeCursor(r.URL.Query().Get("cursor"), sortValue, orderValue)
	if err != nil {
		writeError(w, 400, "INVALID_CURSOR", err.Error())
		return
	}
	args := []any{}
	where := []string{"1=1"}
	if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		args = append(args, value)
		where = append(where, fmt.Sprintf("d.status::text=$%d", len(args)))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("q")); value != "" {
		args = append(args, "%"+value+"%")
		where = append(where, fmt.Sprintf("d.owner_user_id::text ILIKE $%d", len(args)))
	}
	if cursor.ID != uuid.Nil {
		value, e := parseCursorValue(cursor.Value, sortValue)
		if e != nil {
			writeError(w, 400, "INVALID_CURSOR", e.Error())
			return
		}
		args = append(args, value, cursor.ID)
		where = append(where, cursorPredicate(orderValue, sortExpression, "user_id", len(args)-1))
	}
	args = append(args, limit+1)
	query := fmt.Sprintf(`WITH users AS (SELECT d.owner_user_id AS user_id,d.status::text AS status,COUNT(DISTINCT d.id)::bigint AS drive_count,COALESCE(SUM(q.quota_bytes),0)::bigint AS quota_bytes,COALESCE(SUM(q.used_bytes),0)::bigint AS used_bytes,COALESCE(SUM(q.reserved_bytes),0)::bigint AS reserved_bytes,COALESCE(SUM(q.trash_bytes),0)::bigint AS trash_bytes,COUNT(i.id)::bigint AS item_count,GREATEST(d.updated_at,COALESCE(MAX(i.updated_at),d.updated_at)) AS last_activity_at,MIN(d.created_at) AS created_at,MAX(d.updated_at) AS updated_at FROM cloud.drives d JOIN cloud.quotas q ON q.drive_id=d.id LEFT JOIN cloud.items i ON i.drive_id=d.id WHERE %s GROUP BY d.owner_user_id,d.status,d.updated_at) SELECT user_id,status,drive_count,quota_bytes,used_bytes,reserved_bytes,trash_bytes,item_count,last_activity_at,created_at,updated_at FROM users ORDER BY %s %s,user_id %s LIMIT $%d`, strings.Join(where, " AND "), sortExpression, orderValue, orderValue, len(args))
	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	defer rows.Close()
	items := make([]userReadModel, 0, limit)
	for rows.Next() {
		var item userReadModel
		var id uuid.UUID
		if err := rows.Scan(&id, &item.Status, &item.DriveCount, &item.QuotaBytes, &item.UsedBytes, &item.ReservedBytes, &item.TrashBytes, &item.ItemCount, &item.LastActivityAt, &item.CreatedAt, &item.UpdatedAt); err != nil {
			h.internalError(w, r, err)
			return
		}
		item.UserID = id.String()
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		h.internalError(w, r, err)
		return
	}
	next := ""
	if len(items) > limit {
		last := items[limit-1]
		items = items[:limit]
		next = encodeCursor(sortValue, orderValue, cursorValue(last, sortValue), mustUUID(last.UserID))
	}
	writeData(w, 200, map[string]any{"items": items, "nextCursor": nullableString(next)})
}

func (h *Handler) drives(w http.ResponseWriter, r *http.Request) {
	limit, err := parseLimit(r)
	if err != nil {
		writeError(w, 400, "INVALID_FILTER", err.Error())
		return
	}
	sortValue := r.URL.Query().Get("sortBy")
	if sortValue == "" {
		sortValue = "updatedAt"
	}
	orderValue := order(r.URL.Query().Get("sortOrder"))
	sortExpression := map[string]string{"updatedAt": "updated_at", "usedBytes": "used_bytes", "createdAt": "created_at"}[sortValue]
	if sortExpression == "" {
		writeError(w, 400, "INVALID_FILTER", "sortBy is invalid")
		return
	}
	cursor, err := decodeCursor(r.URL.Query().Get("cursor"), sortValue, orderValue)
	if err != nil {
		writeError(w, 400, "INVALID_CURSOR", err.Error())
		return
	}
	args := []any{}
	where := []string{"1=1"}
	if value := strings.TrimSpace(r.URL.Query().Get("ownerUserId")); value != "" {
		id, e := parseUUID(value, "ownerUserId")
		if e != nil {
			writeError(w, 400, "INVALID_FILTER", e.Error())
			return
		}
		args = append(args, id)
		where = append(where, fmt.Sprintf("d.owner_user_id=$%d", len(args)))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		args = append(args, value)
		where = append(where, fmt.Sprintf("d.status::text=$%d", len(args)))
	}
	if cursor.ID != uuid.Nil {
		value, e := parseCursorValue(cursor.Value, sortValue)
		if e != nil {
			writeError(w, 400, "INVALID_CURSOR", e.Error())
			return
		}
		args = append(args, value, cursor.ID)
		where = append(where, cursorPredicate(orderValue, sortExpression, "id", len(args)-1))
	}
	args = append(args, limit+1)
	query := fmt.Sprintf(`WITH drives AS (SELECT d.id,d.owner_user_id,d.status::text,q.quota_bytes,q.used_bytes,q.reserved_bytes,q.trash_bytes,COUNT(i.id)::bigint AS item_count,GREATEST(d.updated_at,COALESCE(MAX(i.updated_at),d.updated_at)) AS last_activity_at,d.created_at,d.updated_at FROM cloud.drives d JOIN cloud.quotas q ON q.drive_id=d.id LEFT JOIN cloud.items i ON i.drive_id=d.id WHERE %s GROUP BY d.id,d.owner_user_id,d.status,q.quota_bytes,q.used_bytes,q.reserved_bytes,q.trash_bytes,d.created_at,d.updated_at) SELECT id,owner_user_id,status,quota_bytes,used_bytes,reserved_bytes,trash_bytes,item_count,last_activity_at,created_at,updated_at FROM drives ORDER BY %s %s,id %s LIMIT $%d`, strings.Join(where, " AND "), sortExpression, orderValue, orderValue, len(args))
	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	defer rows.Close()
	items := make([]driveReadModel, 0, limit)
	for rows.Next() {
		var item driveReadModel
		var id, ownerID uuid.UUID
		if err := rows.Scan(&id, &ownerID, &item.Status, &item.QuotaBytes, &item.UsedBytes, &item.ReservedBytes, &item.TrashBytes, &item.ItemCount, &item.LastActivityAt, &item.CreatedAt, &item.UpdatedAt); err != nil {
			h.internalError(w, r, err)
			return
		}
		item.DriveID = id.String()
		item.OwnerUserID = ownerID.String()
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		h.internalError(w, r, err)
		return
	}
	next := ""
	if len(items) > limit {
		last := items[limit-1]
		items = items[:limit]
		next = encodeCursor(sortValue, orderValue, cursorValue(last, sortValue), mustUUID(last.DriveID))
	}
	writeData(w, 200, map[string]any{"items": items, "nextCursor": nullableString(next)})
}

func (h *Handler) items(w http.ResponseWriter, r *http.Request)      { h.listItems(w, r, false) }
func (h *Handler) trashItems(w http.ResponseWriter, r *http.Request) { h.listItems(w, r, true) }
func (h *Handler) listItems(w http.ResponseWriter, r *http.Request, onlyTrash bool) {
	limit, err := parseLimit(r)
	if err != nil {
		writeError(w, 400, "INVALID_FILTER", err.Error())
		return
	}
	sortValue := r.URL.Query().Get("sortBy")
	if sortValue == "" {
		if onlyTrash {
			sortValue = "deletedAt"
		} else {
			sortValue = "updatedAt"
		}
	}
	orderValue := order(r.URL.Query().Get("sortOrder"))
	sortExpression := map[string]string{"updatedAt": "updated_at", "createdAt": "created_at", "sizeBytes": "size_bytes", "deletedAt": "deleted_at", "purgeAfter": "purge_after"}[sortValue]
	valid := sortExpression != "" && ((onlyTrash && (sortValue == "deletedAt" || sortValue == "purgeAfter" || sortValue == "sizeBytes")) || (!onlyTrash && (sortValue == "updatedAt" || sortValue == "createdAt" || sortValue == "sizeBytes")))
	if !valid {
		writeError(w, 400, "INVALID_FILTER", "sortBy is invalid")
		return
	}
	cursor, err := decodeCursor(r.URL.Query().Get("cursor"), sortValue, orderValue)
	if err != nil {
		writeError(w, 400, "INVALID_CURSOR", err.Error())
		return
	}
	args := []any{}
	where := []string{}
	if onlyTrash {
		where = append(where, "i.status='trashed'")
	} else if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		if value == "deleted" {
			value = "trashed"
		}
		args = append(args, value)
		where = append(where, fmt.Sprintf("i.status::text=$%d", len(args)))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("driveId")); value != "" {
		id, e := parseUUID(value, "driveId")
		if e != nil {
			writeError(w, 400, "INVALID_FILTER", e.Error())
			return
		}
		args = append(args, id)
		where = append(where, fmt.Sprintf("i.drive_id=$%d", len(args)))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("ownerUserId")); value != "" {
		id, e := parseUUID(value, "ownerUserId")
		if e != nil {
			writeError(w, 400, "INVALID_FILTER", e.Error())
			return
		}
		args = append(args, id)
		where = append(where, fmt.Sprintf("d.owner_user_id=$%d", len(args)))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("type")); value != "" {
		args = append(args, value)
		where = append(where, fmt.Sprintf("i.item_type::text=$%d", len(args)))
	}
	if cursor.ID != uuid.Nil {
		value, e := parseCursorValue(cursor.Value, sortValue)
		if e != nil {
			writeError(w, 400, "INVALID_CURSOR", e.Error())
			return
		}
		args = append(args, value, cursor.ID)
		where = append(where, cursorPredicate(orderValue, "i."+sortExpression, "i.id", len(args)-1))
	}
	if len(where) == 0 {
		where = append(where, "1=1")
	}
	args = append(args, limit+1)
	query := fmt.Sprintf(`SELECT i.id,i.drive_id,d.owner_user_id,i.item_type::text,i.status::text,i.size_bytes,i.created_at,i.updated_at,i.deleted_at,i.purge_after FROM cloud.items i JOIN cloud.drives d ON d.id=i.drive_id WHERE %s ORDER BY i.%s %s,i.id %s LIMIT $%d`, strings.Join(where, " AND "), sortExpression, orderValue, orderValue, len(args))
	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	defer rows.Close()
	items := make([]itemReadModel, 0, limit)
	for rows.Next() {
		var item itemReadModel
		var id, driveID, ownerID uuid.UUID
		var deletedAt, purgeAfter pgtype.Timestamptz
		if err := rows.Scan(&id, &driveID, &ownerID, &item.Type, &item.Status, &item.SizeBytes, &item.CreatedAt, &item.UpdatedAt, &deletedAt, &purgeAfter); err != nil {
			h.internalError(w, r, err)
			return
		}
		item.ItemID = id.String()
		item.DriveID = driveID.String()
		item.OwnerUserID = ownerID.String()
		item.DeletedAt = optionalTime(deletedAt)
		item.PurgeAfter = optionalTime(purgeAfter)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		h.internalError(w, r, err)
		return
	}
	next := ""
	if len(items) > limit {
		last := items[limit-1]
		items = items[:limit]
		next = encodeCursor(sortValue, orderValue, cursorValue(last, sortValue), mustUUID(last.ItemID))
	}
	writeData(w, 200, map[string]any{"items": items, "nextCursor": nullableString(next)})
}

func (h *Handler) loadItemOwner(ctx context.Context, itemID uuid.UUID) (uuid.UUID, error) {
	var owner uuid.UUID
	err := h.pool.QueryRow(ctx, `SELECT d.owner_user_id FROM cloud.items i JOIN cloud.drives d ON d.id=i.drive_id WHERE i.id=$1`, itemID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, trashdomain.ErrNotFound
	}
	return owner, err
}
func (h *Handler) restoreItem(w http.ResponseWriter, r *http.Request) { h.lifecycle(w, r, false) }
func (h *Handler) purgeItem(w http.ResponseWriter, r *http.Request)   { h.lifecycle(w, r, true) }
func (h *Handler) lifecycle(w http.ResponseWriter, r *http.Request, purge bool) {
	itemID, err := parseUUID(r.PathValue("itemID"), "item ID")
	if err != nil {
		writeError(w, 400, "INVALID_ITEM_ID", err.Error())
		return
	}
	operationID := strings.TrimSpace(r.Header.Get(idempotencyHeader))
	if operationID == "" || len(operationID) > 128 {
		writeError(w, 400, "VALIDATION_ERROR", "Idempotency-Key must contain 1 to 128 characters")
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if decodeBody(w, r, &body) != nil {
		return
	}
	if strings.TrimSpace(body.Reason) == "" || len([]rune(body.Reason)) > 500 {
		writeError(w, 400, "VALIDATION_ERROR", "reason must contain 1 to 500 characters")
		return
	}
	owner, err := h.loadItemOwner(r.Context(), itemID)
	if err != nil {
		if errors.Is(err, trashdomain.ErrNotFound) {
			writeError(w, 404, "ITEM_NOT_FOUND", "cloud item not found")
			return
		}
		h.internalError(w, r, err)
		return
	}
	var result trashdomain.Result
	if purge {
		result, err = h.trash.DeleteImmediately(r.Context(), owner, itemID, operationID)
	} else {
		result, err = h.trash.Restore(r.Context(), owner, itemID, operationID)
	}
	if err != nil {
		h.lifecycleError(w, r, err)
		return
	}
	response := map[string]any{"itemId": result.ItemID.String(), "driveId": result.DriveID.String(), "ownerUserId": owner.String(), "status": string(result.PreviousState), "sizeBytes": result.BillableBytes, "deletedAt": result.DeletedAt, "purgeAfter": result.PurgeAfter, "applied": result.Applied}
	if !purge {
		if current, e := h.readItem(r.Context(), itemID); e == nil {
			response = map[string]any{"itemId": current.ItemID, "driveId": current.DriveID, "ownerUserId": current.OwnerUserID, "type": current.Type, "status": current.Status, "sizeBytes": current.SizeBytes, "createdAt": current.CreatedAt, "updatedAt": current.UpdatedAt, "deletedAt": current.DeletedAt, "purgeAfter": current.PurgeAfter, "applied": result.Applied}
		}
	}
	writeData(w, 200, response)
}
func (h *Handler) readItem(ctx context.Context, id uuid.UUID) (itemReadModel, error) {
	var item itemReadModel
	var itemID, driveID, ownerID uuid.UUID
	var deletedAt, purgeAfter pgtype.Timestamptz
	err := h.pool.QueryRow(ctx, `SELECT i.id,i.drive_id,d.owner_user_id,i.item_type::text,i.status::text,i.size_bytes,i.created_at,i.updated_at,i.deleted_at,i.purge_after FROM cloud.items i JOIN cloud.drives d ON d.id=i.drive_id WHERE i.id=$1`, id).Scan(&itemID, &driveID, &ownerID, &item.Type, &item.Status, &item.SizeBytes, &item.CreatedAt, &item.UpdatedAt, &deletedAt, &purgeAfter)
	if err != nil {
		return item, err
	}
	item.ItemID = itemID.String()
	item.DriveID = driveID.String()
	item.OwnerUserID = ownerID.String()
	item.DeletedAt = optionalTime(deletedAt)
	item.PurgeAfter = optionalTime(purgeAfter)
	return item, nil
}

type jobResponse struct {
	JobID         string     `json:"jobId"`
	Type          string     `json:"type"`
	Status        string     `json:"status"`
	ResourceType  string     `json:"resourceType"`
	ResourceID    string     `json:"resourceId"`
	Attempts      int        `json:"attempts"`
	MaxAttempts   int        `json:"maxAttempts"`
	CreatedAt     time.Time  `json:"createdAt"`
	StartedAt     *time.Time `json:"startedAt"`
	FinishedAt    *time.Time `json:"finishedAt"`
	NextRetryAt   *time.Time `json:"nextRetryAt"`
	LastErrorCode *string    `json:"lastErrorCode"`
	UpdatedAt     *time.Time `json:"updatedAt"`
}

func jobStatus(value string) string {
	switch value {
	case "pending":
		return "queued"
	case "processing":
		return "running"
	case "completed":
		return "succeeded"
	default:
		return value
	}
}
func jobResource(itemID, objectID, uploadID pgtype.UUID, driveID uuid.UUID) (string, string) {
	if value := optionalUUID(itemID); value != nil {
		return "item", *value
	}
	if value := optionalUUID(objectID); value != nil {
		return "storage_object", *value
	}
	if value := optionalUUID(uploadID); value != nil {
		return "upload_session", *value
	}
	return "drive", driveID.String()
}

func (h *Handler) jobs(w http.ResponseWriter, r *http.Request) {
	limit, err := parseLimit(r)
	if err != nil {
		writeError(w, 400, "INVALID_FILTER", err.Error())
		return
	}
	sortValue := r.URL.Query().Get("sortBy")
	if sortValue == "" {
		sortValue = "createdAt"
	}
	orderValue := order(r.URL.Query().Get("sortOrder"))
	sortExpression := map[string]string{"createdAt": "created_at", "updatedAt": "updated_at", "nextRetryAt": "run_after"}[sortValue]
	if sortExpression == "" {
		writeError(w, 400, "INVALID_FILTER", "sortBy is invalid")
		return
	}
	cursor, err := decodeCursor(r.URL.Query().Get("cursor"), sortValue, orderValue)
	if err != nil {
		writeError(w, 400, "INVALID_CURSOR", err.Error())
		return
	}
	args := []any{}
	where := []string{"1=1"}
	if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		switch value {
		case "queued":
			value = "pending"
		case "running":
			value = "processing"
		case "succeeded":
			value = "completed"
		}
		args = append(args, value)
		where = append(where, fmt.Sprintf("j.status::text=$%d", len(args)))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("type")); value != "" {
		args = append(args, value)
		where = append(where, fmt.Sprintf("j.job_type::text=$%d", len(args)))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("resourceType")); value != "" {
		args = append(args, value)
		where = append(where, fmt.Sprintf(`CASE WHEN j.item_id IS NOT NULL THEN 'item' WHEN j.storage_object_id IS NOT NULL THEN 'storage_object' WHEN j.upload_session_id IS NOT NULL THEN 'upload_session' ELSE 'drive' END=$%d`, len(args)))
	}
	if cursor.ID != uuid.Nil {
		value, e := parseCursorValue(cursor.Value, sortValue)
		if e != nil {
			writeError(w, 400, "INVALID_CURSOR", e.Error())
			return
		}
		args = append(args, value, cursor.ID)
		where = append(where, cursorPredicate(orderValue, "j."+sortExpression, "j.id", len(args)-1))
	}
	args = append(args, limit+1)
	query := fmt.Sprintf(`SELECT j.id,j.job_type::text,j.status::text,j.drive_id,j.item_id,j.storage_object_id,j.upload_session_id,j.attempts,j.max_attempts,j.created_at,j.locked_at,j.completed_at,j.run_after,j.last_error,j.updated_at FROM cloud.jobs j WHERE %s ORDER BY j.%s %s,j.id %s LIMIT $%d`, strings.Join(where, " AND "), sortExpression, orderValue, orderValue, len(args))
	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	defer rows.Close()
	items := make([]jobResponse, 0, limit)
	for rows.Next() {
		item, e := h.scanJob(rows)
		if e != nil {
			h.internalError(w, r, e)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		h.internalError(w, r, err)
		return
	}
	next := ""
	if len(items) > limit {
		last := items[limit-1]
		items = items[:limit]
		next = encodeCursor(sortValue, orderValue, cursorValue(last, sortValue), mustUUID(last.JobID))
	}
	writeData(w, 200, map[string]any{"items": items, "nextCursor": nullableString(next)})
}

type rowScanner interface{ Scan(...any) error }

func (h *Handler) scanJob(row rowScanner) (jobResponse, error) {
	var response jobResponse
	var id, driveID uuid.UUID
	var jobType, status string
	var lastError pgtype.Text
	var itemID, objectID, uploadID pgtype.UUID
	var lockedAt, completedAt, runAfter, updatedAt pgtype.Timestamptz
	err := row.Scan(&id, &jobType, &status, &driveID, &itemID, &objectID, &uploadID, &response.Attempts, &response.MaxAttempts, &response.CreatedAt, &lockedAt, &completedAt, &runAfter, &lastError, &updatedAt)
	if err != nil {
		return response, err
	}
	response.JobID = id.String()
	response.Type = jobType
	response.Status = jobStatus(status)
	response.ResourceType, response.ResourceID = jobResource(itemID, objectID, uploadID, driveID)
	response.StartedAt, response.FinishedAt, response.UpdatedAt = optionalTime(lockedAt), optionalTime(completedAt), optionalTime(updatedAt)
	if status == "pending" || status == "failed" {
		response.NextRetryAt = optionalTime(runAfter)
	}
	if lastError.Valid && lastError.String != "" {
		value := lastError.String
		response.LastErrorCode = &value
	}
	return response, nil
}
func (h *Handler) job(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(r.PathValue("jobID"), "job ID")
	if err != nil {
		writeError(w, 400, "INVALID_JOB_ID", err.Error())
		return
	}
	row := h.pool.QueryRow(r.Context(), `SELECT j.id,j.job_type::text,j.status::text,j.drive_id,j.item_id,j.storage_object_id,j.upload_session_id,j.attempts,j.max_attempts,j.created_at,j.locked_at,j.completed_at,j.run_after,j.last_error,j.updated_at FROM cloud.jobs j WHERE j.id=$1`, id)
	response, err := h.scanJob(row)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "JOB_NOT_FOUND", "job not found")
		return
	}
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	writeData(w, 200, response)
}
func (h *Handler) retryJob(w http.ResponseWriter, r *http.Request)  { h.mutateJob(w, r, false) }
func (h *Handler) cancelJob(w http.ResponseWriter, r *http.Request) { h.mutateJob(w, r, true) }
func (h *Handler) mutateJob(w http.ResponseWriter, r *http.Request, cancel bool) {
	id, err := parseUUID(r.PathValue("jobID"), "job ID")
	if err != nil {
		writeError(w, 400, "INVALID_JOB_ID", err.Error())
		return
	}
	operationID := strings.TrimSpace(r.Header.Get(idempotencyHeader))
	if operationID == "" || len(operationID) > 128 {
		writeError(w, 400, "VALIDATION_ERROR", "Idempotency-Key must contain 1 to 128 characters")
		return
	}
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, 401, "AUTH_REQUIRED", "authenticated admin identity is required")
		return
	}
	action := "cloud.admin.job.retry"
	if cancel {
		action = "cloud.admin.job.cancel"
	}
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	var existing uuid.UUID
	if err = tx.QueryRow(r.Context(), `SELECT id FROM cloud.audit_logs WHERE request_id=$1 AND action=$2 LIMIT 1`, operationID, action).Scan(&existing); err == nil {
		if err = tx.Commit(r.Context()); err != nil {
			h.internalError(w, r, err)
			return
		}
		response, e := h.readJob(r.Context(), id)
		if e != nil {
			h.internalError(w, r, e)
			return
		}
		writeData(w, 200, withApplied(response, false))
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		h.internalError(w, r, err)
		return
	}
	var previousStatus, jobType string
	var driveID uuid.UUID
	var itemID, objectID, uploadID pgtype.UUID
	if err = tx.QueryRow(r.Context(), `SELECT job_type::text,status::text,drive_id,item_id,storage_object_id,upload_session_id FROM cloud.jobs WHERE id=$1 FOR UPDATE`, id).Scan(&jobType, &previousStatus, &driveID, &itemID, &objectID, &uploadID); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "JOB_NOT_FOUND", "job not found")
		return
	} else if err != nil {
		h.internalError(w, r, err)
		return
	}
	if cancel {
		if previousStatus == "completed" {
			writeError(w, 409, "JOB_ALREADY_COMPLETED", "completed jobs cannot be cancelled")
			return
		}
		if previousStatus != "cancelled" {
			if _, err = tx.Exec(r.Context(), `UPDATE cloud.jobs SET status='cancelled',locked_by=NULL,locked_at=NULL,last_error=NULL WHERE id=$1`, id); err != nil {
				h.internalError(w, r, err)
				return
			}
		}
	} else {
		if previousStatus != "failed" && previousStatus != "dead" {
			writeError(w, 409, "JOB_INVALID_STATE", "only failed or dead jobs can be retried")
			return
		}
		if _, err = tx.Exec(r.Context(), `UPDATE cloud.jobs SET status='pending',run_after=NOW(),locked_by=NULL,locked_at=NULL,last_error=NULL WHERE id=$1`, id); err != nil {
			h.internalError(w, r, err)
			return
		}
	}
	resourceType, resourceID := jobResource(itemID, objectID, uploadID, driveID)
	metadata, _ := json.Marshal(map[string]any{"operationId": operationID, "previousStatus": previousStatus, "resourceType": resourceType, "resourceId": resourceID, "outcome": "success"})
	if _, err = tx.Exec(r.Context(), `INSERT INTO cloud.audit_logs(actor_user_id,actor_type,request_id,action,entity_type,entity_id,drive_id,metadata) VALUES($1,'admin',$2,$3,'job',$4,$5,$6::jsonb)`, principal.Subject, operationID, action, id, driveID, metadata); err != nil {
		h.internalError(w, r, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		h.internalError(w, r, err)
		return
	}
	response, err := h.readJob(r.Context(), id)
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	writeData(w, 200, withApplied(response, true))
}
func (h *Handler) readJob(ctx context.Context, id uuid.UUID) (jobResponse, error) {
	row := h.pool.QueryRow(ctx, `SELECT j.id,j.job_type::text,j.status::text,j.drive_id,j.item_id,j.storage_object_id,j.upload_session_id,j.attempts,j.max_attempts,j.created_at,j.locked_at,j.completed_at,j.run_after,j.last_error,j.updated_at FROM cloud.jobs j WHERE j.id=$1`, id)
	return h.scanJob(row)
}

type auditResponse struct {
	AuditID      string         `json:"auditId"`
	ActorID      string         `json:"actorId"`
	Action       string         `json:"action"`
	ResourceType string         `json:"resourceType"`
	ResourceID   string         `json:"resourceId"`
	Outcome      string         `json:"outcome"`
	RequestID    string         `json:"requestId"`
	OperationID  string         `json:"operationId"`
	CreatedAt    time.Time      `json:"createdAt"`
	Metadata     map[string]any `json:"metadata"`
}

func (h *Handler) audit(w http.ResponseWriter, r *http.Request) {
	limit, err := parseLimit(r)
	if err != nil {
		writeError(w, 400, "INVALID_FILTER", err.Error())
		return
	}
	orderValue := order(r.URL.Query().Get("sortOrder"))
	cursor, err := decodeCursor(r.URL.Query().Get("cursor"), "createdAt", orderValue)
	if err != nil {
		writeError(w, 400, "INVALID_CURSOR", err.Error())
		return
	}
	args := []any{}
	where := []string{"1=1"}
	if value := strings.TrimSpace(r.URL.Query().Get("actorId")); value != "" {
		id, e := parseUUID(value, "actorId")
		if e != nil {
			writeError(w, 400, "INVALID_FILTER", e.Error())
			return
		}
		args = append(args, id)
		where = append(where, fmt.Sprintf("a.actor_user_id=$%d", len(args)))
	}
	for _, filter := range []struct{ key, expression string }{{"action", "a.action"}, {"resourceType", "a.entity_type"}} {
		if value := strings.TrimSpace(r.URL.Query().Get(filter.key)); value != "" {
			args = append(args, value)
			where = append(where, fmt.Sprintf("%s=$%d", filter.expression, len(args)))
		}
	}
	if value := strings.TrimSpace(r.URL.Query().Get("outcome")); value != "" {
		args = append(args, value)
		where = append(where, fmt.Sprintf("COALESCE(a.metadata->>'outcome','success')=$%d", len(args)))
	}
	for _, filter := range []struct{ key, op string }{{"from", ">="}, {"to", "<="}} {
		if value := strings.TrimSpace(r.URL.Query().Get(filter.key)); value != "" {
			parsed, e := time.Parse(time.RFC3339, value)
			if e != nil {
				writeError(w, 400, "INVALID_FILTER", filter.key+" must be RFC3339")
				return
			}
			args = append(args, parsed)
			where = append(where, fmt.Sprintf("a.occurred_at %s $%d", filter.op, len(args)))
		}
	}
	if cursor.ID != uuid.Nil {
		parsed, e := time.Parse(time.RFC3339Nano, cursor.Value)
		if e != nil {
			writeError(w, 400, "INVALID_CURSOR", "cursor is invalid")
			return
		}
		args = append(args, parsed, cursor.ID)
		where = append(where, cursorPredicate(orderValue, "a.occurred_at", "a.id", len(args)-1))
	}
	args = append(args, limit+1)
	query := fmt.Sprintf(`SELECT a.id,a.actor_user_id,a.actor_type,a.action,a.entity_type,a.entity_id,a.request_id,a.occurred_at,a.metadata FROM cloud.audit_logs a WHERE %s ORDER BY a.occurred_at %s,a.id %s LIMIT $%d`, strings.Join(where, " AND "), orderValue, orderValue, len(args))
	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		h.internalError(w, r, err)
		return
	}
	defer rows.Close()
	items := make([]auditResponse, 0, limit)
	for rows.Next() {
		var id, entityID uuid.UUID
		var actorID pgtype.UUID
		var actorType, action, entityType string
		var requestID pgtype.Text
		var created time.Time
		var metadata []byte
		if err := rows.Scan(&id, &actorID, &actorType, &action, &entityType, &entityID, &requestID, &created, &metadata); err != nil {
			h.internalError(w, r, err)
			return
		}
		decoded := map[string]any{}
		_ = json.Unmarshal(metadata, &decoded)
		actor := actorType
		if value := optionalUUID(actorID); value != nil {
			actor = *value
		}
		resourceID := ""
		if entityID != uuid.Nil {
			resourceID = entityID.String()
		}
		operationID, _ := decoded["operationId"].(string)
		if operationID == "" {
			operationID, _ = decoded["operation_id"].(string)
		}
		requestIDValue := ""
		if requestID.Valid {
			requestIDValue = requestID.String
		}
		items = append(items, auditResponse{AuditID: id.String(), ActorID: actor, Action: action, ResourceType: entityType, ResourceID: resourceID, Outcome: stringValue(decoded["outcome"], "success"), RequestID: requestIDValue, OperationID: operationID, CreatedAt: created.UTC(), Metadata: decoded})
	}
	if err := rows.Err(); err != nil {
		h.internalError(w, r, err)
		return
	}
	next := ""
	if len(items) > limit {
		last := items[limit-1]
		items = items[:limit]
		next = encodeCursor("createdAt", orderValue, last.CreatedAt.Format(time.RFC3339Nano), mustUUID(last.AuditID))
	}
	writeData(w, 200, map[string]any{"items": items, "nextCursor": nullableString(next)})
}

func (h *Handler) quotaList(w http.ResponseWriter, r *http.Request) {
	limit, err := parseLimit(r)
	if err != nil {
		writeError(w, 400, "INVALID_FILTER", err.Error())
		return
	}
	page, err := h.quotaRequests.AdminList(r.Context(), quotarequest.AdminListFilter{Status: quotarequest.Status(strings.TrimSpace(r.URL.Query().Get("status"))), Limit: limit, Cursor: r.URL.Query().Get("cursor")})
	if err != nil {
		if errors.Is(err, quotarequest.ErrInvalidInput) {
			writeError(w, 400, "INVALID_FILTER", "quota request filter is invalid")
			return
		}
		h.internalError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(page.Items))
	identities := h.resolveQuotaIdentities(r.Context(), page.Items)
	for _, item := range page.Items {
		items = append(items, quotaResponse(item, nil, identities))
	}
	writeData(w, 200, map[string]any{"items": items, "nextCursor": nullableString(page.NextCursor)})
}
func (h *Handler) quotaApprove(w http.ResponseWriter, r *http.Request) {
	h.reviewQuota(w, r, quotarequest.StatusApproved)
}
func (h *Handler) quotaReject(w http.ResponseWriter, r *http.Request) {
	h.reviewQuota(w, r, quotarequest.StatusRejected)
}
func (h *Handler) reviewQuota(w http.ResponseWriter, r *http.Request, decision quotarequest.Status) {
	requestID, err := parseUUID(r.PathValue("requestID"), "request ID")
	if err != nil {
		writeError(w, 400, "INVALID_QUOTA_REVIEW", err.Error())
		return
	}
	operationID := strings.TrimSpace(r.Header.Get(idempotencyHeader))
	if operationID == "" || len(operationID) > 128 {
		writeError(w, 400, "VALIDATION_ERROR", "Idempotency-Key must contain 1 to 128 characters")
		return
	}
	var body struct {
		Note *string `json:"note,omitempty"`
	}
	if decodeBody(w, r, &body) != nil {
		return
	}
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, 401, "AUTH_REQUIRED", "authenticated admin identity is required")
		return
	}
	result, err := h.quotaRequests.Review(r.Context(), quotarequest.ReviewCommand{RequestID: requestID, ActorUserID: principal.Subject, Decision: decision, OperationID: operationID, Note: body.Note, RequestIDTrace: r.Header.Get(requestIDHeader)})
	if err != nil {
		switch {
		case errors.Is(err, quotarequest.ErrNotFound):
			writeError(w, 404, "QUOTA_REQUEST_NOT_FOUND", "quota request not found")
		case errors.Is(err, quotarequest.ErrInvalidState), errors.Is(err, quotarequest.ErrQuotaBelowUsage), errors.Is(err, quotarequest.ErrReviewConflict):
			writeError(w, 409, "QUOTA_REQUEST_CONFLICT", err.Error())
		case errors.Is(err, quotarequest.ErrInvalidInput):
			writeError(w, 400, "INVALID_QUOTA_REVIEW", err.Error())
		default:
			h.internalError(w, r, err)
		}
		return
	}
	identities := h.resolveQuotaIdentities(r.Context(), []quotarequest.AdminListItem{result.Item})
	writeData(w, 200, quotaResponse(result.Item, &result.Applied, identities))
}
func quotaResponse(item quotarequest.AdminListItem, applied *bool, identities map[uuid.UUID]auth.UserIdentity) map[string]any {
	response := map[string]any{"id": item.ID.String(), "ownerUserId": item.OwnerUserID.String(), "requestedByUserId": item.RequestedByUserID.String(), "owner": quotaUserIdentity(item.OwnerUserID, identities), "requestedBy": quotaUserIdentity(item.RequestedByUserID, identities), "status": item.Status, "currentQuotaBytes": item.CurrentQuotaBytes, "requestedQuotaBytes": item.RequestedQuotaBytes, "quotaBytes": item.QuotaBytes, "usedBytes": item.UsedBytes, "reservedBytes": item.ReservedBytes, "trashBytes": item.TrashBytes, "reason": item.Reason, "reviewedAt": item.ReviewedAt, "reviewNote": item.ReviewNote, "createdAt": item.CreatedAt, "updatedAt": item.UpdatedAt}
	if item.ReviewedByUserID != nil {
		response["reviewedByUserId"] = item.ReviewedByUserID.String()
	}
	if applied != nil {
		response["applied"] = *applied
	}
	return response
}

func (h *Handler) resolveQuotaIdentities(ctx context.Context, items []quotarequest.AdminListItem) map[uuid.UUID]auth.UserIdentity {
	identities := make(map[uuid.UUID]auth.UserIdentity)
	if h.userDirectory == nil {
		return identities
	}
	userIDs := make([]uuid.UUID, 0, len(items)*2)
	for _, item := range items {
		userIDs = append(userIDs, item.OwnerUserID, item.RequestedByUserID)
	}
	resolved, err := h.userDirectory.ResolveUsers(ctx, userIDs)
	if err != nil {
		h.logger.Warn("resolve Cloud quota request user identities failed", "error", err, "request_count", len(items))
		return identities
	}
	return resolved
}

func quotaUserIdentity(id uuid.UUID, identities map[uuid.UUID]auth.UserIdentity) map[string]any {
	identity := map[string]any{"userId": id.String(), "username": nil, "displayName": nil, "email": nil}
	if resolved, ok := identities[id]; ok {
		identity["username"] = resolved.Username
		identity["displayName"] = resolved.DisplayName
		identity["email"] = resolved.Email
	}
	return identity
}

func decodeBody(w http.ResponseWriter, r *http.Request, target any) error {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json")
		return errors.New("unsupported media type")
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, 400, "INVALID_JSON", "request body must be valid JSON")
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, 400, "INVALID_JSON", "request body must contain one JSON object")
		return errors.New("multiple JSON values")
	}
	return nil
}
func (h *Handler) lifecycleError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, trashdomain.ErrNotFound):
		writeError(w, 404, "ITEM_NOT_FOUND", "cloud item not found")
	case errors.Is(err, trashdomain.ErrRestoreExpired):
		writeError(w, 409, "RESTORE_EXPIRED", "Trash retention has expired")
	case errors.Is(err, trashdomain.ErrInvalidState), errors.Is(err, trashdomain.ErrQuotaInvariant):
		writeError(w, 409, "ITEM_LIFECYCLE_CONFLICT", err.Error())
	case errors.Is(err, trashdomain.ErrIdempotencyConflict):
		writeError(w, 409, "IDEMPOTENCY_CONFLICT", err.Error())
	default:
		h.internalError(w, r, err)
	}
}
func (h *Handler) internalError(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.ErrorContext(r.Context(), "Cloud Admin request failed", "error_type", fmt.Sprintf("%T", err), "path", r.URL.Path)
	writeError(w, 500, "CLOUD_INTERNAL_ERROR", "Cloud Admin request failed")
}
func parseCursorValue(value, sort string) (any, error) {
	if sort == "sizeBytes" || sort == "usedBytes" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return nil, errors.New("cursor is invalid")
		}
		return parsed, nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return nil, errors.New("cursor is invalid")
	}
	return parsed, nil
}
func cursorValue(value any, sort string) string {
	switch item := value.(type) {
	case userReadModel:
		if sort == "usedBytes" {
			return strconv.FormatInt(item.UsedBytes, 10)
		}
		return item.UpdatedAt.UTC().Format(time.RFC3339Nano)
	case driveReadModel:
		switch sort {
		case "usedBytes":
			return strconv.FormatInt(item.UsedBytes, 10)
		case "createdAt":
			return item.CreatedAt.UTC().Format(time.RFC3339Nano)
		default:
			return item.UpdatedAt.UTC().Format(time.RFC3339Nano)
		}
	case itemReadModel:
		switch sort {
		case "sizeBytes":
			return strconv.FormatInt(item.SizeBytes, 10)
		case "createdAt":
			return item.CreatedAt.UTC().Format(time.RFC3339Nano)
		case "deletedAt":
			if item.DeletedAt != nil {
				return item.DeletedAt.UTC().Format(time.RFC3339Nano)
			}
		case "purgeAfter":
			if item.PurgeAfter != nil {
				return item.PurgeAfter.UTC().Format(time.RFC3339Nano)
			}
		default:
			return item.UpdatedAt.UTC().Format(time.RFC3339Nano)
		}
	case jobResponse:
		switch sort {
		case "nextRetryAt":
			if item.NextRetryAt != nil {
				return item.NextRetryAt.UTC().Format(time.RFC3339Nano)
			}
		case "updatedAt":
			if item.UpdatedAt != nil {
				return item.UpdatedAt.UTC().Format(time.RFC3339Nano)
			}
		default:
			return item.CreatedAt.UTC().Format(time.RFC3339Nano)
		}
	}
	return ""
}
func stringValue(value any, fallback string) string {
	if result, ok := value.(string); ok && result != "" {
		return result
	}
	return fallback
}
func withApplied(value any, applied bool) map[string]any {
	encoded, _ := json.Marshal(value)
	result := map[string]any{}
	_ = json.Unmarshal(encoded, &result)
	result["applied"] = applied
	return result
}
