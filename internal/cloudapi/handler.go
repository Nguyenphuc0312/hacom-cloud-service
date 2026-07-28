package cloudapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/google/uuid"
)

const (
	demoUserHeader  = "X-Demo-User-ID"
	requestIDHeader = "X-Request-ID"
)

var errUnsupportedMediaType = errors.New("content type must be application/json")

type Service interface {
	CreateText(ctx context.Context, ownerUserID uuid.UUID, content string) (cloud.Item, error)
	CreateLink(
		ctx context.Context,
		ownerUserID uuid.UUID,
		rawURL string,
		title string,
	) (cloud.Item, error)
	GetItem(ctx context.Context, ownerUserID, itemID uuid.UUID) (cloud.Item, error)
	ListItems(
		ctx context.Context,
		ownerUserID uuid.UUID,
		cursor string,
		limit int,
	) (cloud.Page, error)
	GetQuota(ctx context.Context, ownerUserID uuid.UUID) (cloud.Quota, error)
}

type Handler struct {
	service      Service
	maxBodyBytes int64
	logger       *slog.Logger
}

func New(
	service Service,
	maxContentBytes int64,
	logger *slog.Logger,
) (http.Handler, error) {
	if service == nil {
		return nil, errors.New("cloud API service is required")
	}
	if maxContentBytes <= 0 {
		return nil, errors.New("maximum content size must be positive")
	}
	if logger == nil {
		return nil, errors.New("cloud API logger is required")
	}

	handler := &Handler{
		service:      service,
		maxBodyBytes: maxContentBytes + 64*1024,
		logger:       logger,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /texts", handler.createText)
	mux.HandleFunc("/texts", methodNotAllowed(http.MethodPost))
	mux.HandleFunc("POST /links", handler.createLink)
	mux.HandleFunc("/links", methodNotAllowed(http.MethodPost))
	mux.HandleFunc("GET /items", handler.listItems)
	mux.HandleFunc("/items", methodNotAllowed(http.MethodGet))
	mux.HandleFunc("GET /items/{itemID}", handler.getItem)
	mux.HandleFunc("/items/{itemID}", methodNotAllowed(http.MethodGet))
	mux.HandleFunc("GET /quota", handler.getQuota)
	mux.HandleFunc("/quota", methodNotAllowed(http.MethodGet))
	mux.HandleFunc("/", handler.notFound)

	return handler.requestIDMiddleware(handler.demoUserMiddleware(mux)), nil
}

type createTextRequest struct {
	Content string `json:"content"`
}

func (h *Handler) createText(writer http.ResponseWriter, request *http.Request) {
	var input createTextRequest
	if err := h.decodeJSON(writer, request, &input); err != nil {
		h.writeDecodeError(writer, err)
		return
	}

	item, err := h.service.CreateText(
		request.Context(),
		ownerUserID(request.Context()),
		input.Content,
	)
	if err != nil {
		h.writeServiceError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusCreated, itemResponseFrom(item))
}

type createLinkRequest struct {
	URL   string `json:"url"`
	Title string `json:"title"`
}

func (h *Handler) createLink(writer http.ResponseWriter, request *http.Request) {
	var input createLinkRequest
	if err := h.decodeJSON(writer, request, &input); err != nil {
		h.writeDecodeError(writer, err)
		return
	}

	item, err := h.service.CreateLink(
		request.Context(),
		ownerUserID(request.Context()),
		input.URL,
		input.Title,
	)
	if err != nil {
		h.writeServiceError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusCreated, itemResponseFrom(item))
}

func (h *Handler) getItem(writer http.ResponseWriter, request *http.Request) {
	itemID, err := uuid.Parse(request.PathValue("itemID"))
	if err != nil || itemID == uuid.Nil {
		writeError(
			writer,
			http.StatusBadRequest,
			"INVALID_ITEM_ID",
			"item ID must be a valid UUID",
		)
		return
	}

	item, err := h.service.GetItem(
		request.Context(),
		ownerUserID(request.Context()),
		itemID,
	)
	if err != nil {
		h.writeServiceError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, itemResponseFrom(item))
}

func (h *Handler) listItems(writer http.ResponseWriter, request *http.Request) {
	limit := 0
	if rawLimit := request.URL.Query().Get("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed < 1 || parsed > cloud.MaxPageSize {
			writeError(
				writer,
				http.StatusBadRequest,
				"INVALID_LIMIT",
				"limit must be an integer between 1 and 100",
			)
			return
		}
		limit = parsed
	}

	page, err := h.service.ListItems(
		request.Context(),
		ownerUserID(request.Context()),
		request.URL.Query().Get("cursor"),
		limit,
	)
	if err != nil {
		h.writeServiceError(writer, request, err)
		return
	}

	items := make([]itemResponse, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, itemResponseFrom(item))
	}
	writeJSON(writer, http.StatusOK, listItemsResponse{
		Items:      items,
		NextCursor: page.NextCursor,
	})
}

func (h *Handler) getQuota(writer http.ResponseWriter, request *http.Request) {
	quota, err := h.service.GetQuota(
		request.Context(),
		ownerUserID(request.Context()),
	)
	if err != nil {
		h.writeServiceError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, quotaResponse{
		LimitBytes:     quota.LimitBytes,
		UsedBytes:      quota.UsedBytes,
		ReservedBytes:  quota.ReservedBytes,
		AvailableBytes: quota.AvailableBytes(),
		UpdatedAt:      quota.UpdatedAt,
	})
}

func (h *Handler) notFound(writer http.ResponseWriter, _ *http.Request) {
	writeError(writer, http.StatusNotFound, "ROUTE_NOT_FOUND", "route not found")
}

func (h *Handler) decodeJSON(
	writer http.ResponseWriter,
	request *http.Request,
	target any,
) error {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return errUnsupportedMediaType
	}

	request.Body = http.MaxBytesReader(writer, request.Body, h.maxBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("request body must contain one JSON object")
		}
		return err
	}
	return nil
}

func (h *Handler) writeDecodeError(writer http.ResponseWriter, err error) {
	if errors.Is(err, errUnsupportedMediaType) {
		writeError(
			writer,
			http.StatusUnsupportedMediaType,
			"UNSUPPORTED_MEDIA_TYPE",
			"Content-Type must be application/json",
		)
		return
	}
	var maxBytesError *http.MaxBytesError
	if errors.As(err, &maxBytesError) {
		writeError(
			writer,
			http.StatusRequestEntityTooLarge,
			"BODY_TOO_LARGE",
			"request body is too large",
		)
		return
	}
	writeError(writer, http.StatusBadRequest, "INVALID_JSON", "request body must be valid JSON")
}

func (h *Handler) writeServiceError(
	writer http.ResponseWriter,
	request *http.Request,
	err error,
) {
	switch {
	case errors.Is(err, cloud.ErrNotFound):
		writeError(writer, http.StatusNotFound, "ITEM_NOT_FOUND", "cloud item not found")
	case errors.Is(err, cloud.ErrQuotaExceeded):
		writeError(writer, http.StatusConflict, "QUOTA_EXCEEDED", "cloud quota exceeded")
	case errors.Is(err, cloud.ErrDriveNotActive):
		writeError(
			writer,
			http.StatusForbidden,
			"DRIVE_NOT_ACTIVE",
			"cloud drive does not allow new content",
		)
	case errors.Is(err, cloud.ErrInvalidCursor):
		writeError(writer, http.StatusBadRequest, "INVALID_CURSOR", "pagination cursor is invalid")
	case errors.Is(err, cloud.ErrInvalidContent):
		writeError(writer, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
	default:
		h.logger.ErrorContext(
			request.Context(),
			"cloud API request failed",
			"error", err,
			"request_id", requestID(request.Context()),
			"method", request.Method,
			"path", request.URL.Path,
			"owner_user_id", ownerUserID(request.Context()),
		)
		writeError(
			writer,
			http.StatusInternalServerError,
			"INTERNAL_ERROR",
			"an internal error occurred",
		)
	}
}

type contextKey string

const ownerUserIDKey contextKey = "cloud-owner-user-id"
const requestIDKey contextKey = "cloud-request-id"

func (h *Handler) requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		id := uuid.NewString()
		writer.Header().Set(requestIDHeader, id)
		ctx := context.WithValue(request.Context(), requestIDKey, id)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

func (h *Handler) demoUserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		rawUserID := strings.TrimSpace(request.Header.Get(demoUserHeader))
		userID, err := uuid.Parse(rawUserID)
		if err != nil || userID == uuid.Nil {
			writeError(
				writer,
				http.StatusUnauthorized,
				"DEMO_USER_REQUIRED",
				"X-Demo-User-ID must be a valid UUID",
			)
			return
		}
		ctx := context.WithValue(request.Context(), ownerUserIDKey, userID)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

func ownerUserID(ctx context.Context) uuid.UUID {
	value, _ := ctx.Value(ownerUserIDKey).(uuid.UUID)
	return value
}

func requestID(ctx context.Context) string {
	value, _ := ctx.Value(requestIDKey).(string)
	return value
}

func methodNotAllowed(allowedMethod string) http.HandlerFunc {
	return func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Allow", allowedMethod)
		writeError(
			writer,
			http.StatusMethodNotAllowed,
			"METHOD_NOT_ALLOWED",
			"method not allowed",
		)
	}
}
