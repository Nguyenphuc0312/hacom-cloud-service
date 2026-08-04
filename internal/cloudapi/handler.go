package cloudapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/auth"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/fileaccess"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/upload"
	"github.com/google/uuid"
)

const (
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
		request cloud.ListRequest,
	) (cloud.Page, error)
	GetQuota(ctx context.Context, ownerUserID uuid.UUID) (cloud.Quota, error)
}

type UploadService interface {
	Initiate(
		ctx context.Context,
		request upload.InitiateRequest,
	) (upload.InitiateResult, error)
	Complete(
		ctx context.Context,
		request upload.CompleteRequest,
	) (upload.CompleteResult, error)
}

type FileAccessService interface {
	CreateAccess(
		ctx context.Context,
		ownerUserID uuid.UUID,
		itemID uuid.UUID,
	) (fileaccess.Access, error)
}

type TrashService interface {
	MoveToTrash(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error)
	Restore(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error)
	DeleteImmediately(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error)
	List(context.Context, uuid.UUID, cloud.ListRequest) (trashdomain.Page, error)
}

type QuotaRequestService interface {
	Create(context.Context, quotarequest.CreateCommand) (quotarequest.CreateResult, error)
	Current(context.Context, uuid.UUID) (quotarequest.Request, error)
}

type Handler struct {
	service       Service
	uploads       UploadService
	fileAccess    FileAccessService
	trash         TrashService
	quotaRequests QuotaRequestService
	maxBodyBytes  int64
	logger        *slog.Logger
	authenticator auth.Authenticator
}

func WithTrashService(service TrashService) Option {
	return func(handler *Handler) error {
		if service == nil {
			return errors.New("Trash service is required")
		}
		handler.trash = service
		return nil
	}
}

func WithQuotaRequestService(service QuotaRequestService) Option {
	return func(handler *Handler) error {
		if service == nil {
			return errors.New("quota-request service is required")
		}
		handler.quotaRequests = service
		return nil
	}
}

type Option func(*Handler) error

func WithUploadService(service UploadService) Option {
	return func(handler *Handler) error {
		if service == nil {
			return errors.New("upload service is required")
		}
		handler.uploads = service
		return nil
	}
}

func WithFileAccessService(service FileAccessService) Option {
	return func(handler *Handler) error {
		if service == nil {
			return errors.New("file access service is required")
		}
		handler.fileAccess = service
		return nil
	}
}

func WithAuthenticator(authenticator auth.Authenticator) Option {
	return func(handler *Handler) error {
		if authenticator == nil {
			return errors.New("Cloud API authenticator is required")
		}
		handler.authenticator = authenticator
		return nil
	}
}

func New(
	service Service,
	maxContentBytes int64,
	logger *slog.Logger,
	options ...Option,
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
		service:       service,
		maxBodyBytes:  maxContentBytes + 64*1024,
		logger:        logger,
		authenticator: auth.DemoAuthenticator{},
	}
	for _, option := range options {
		if err := option(handler); err != nil {
			return nil, err
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /texts", handler.createText)
	mux.HandleFunc("/texts", methodNotAllowed(http.MethodPost))
	mux.HandleFunc("POST /links", handler.createLink)
	mux.HandleFunc("/links", methodNotAllowed(http.MethodPost))
	mux.HandleFunc("GET /items", handler.listItems)
	mux.HandleFunc("/items", methodNotAllowed(http.MethodGet))
	mux.HandleFunc("GET /items/{itemID}", handler.getItem)
	if handler.trash != nil {
		mux.HandleFunc("POST /items/{itemID}/trash", handler.moveToTrash)
		mux.HandleFunc("/items/{itemID}/trash", methodNotAllowed(http.MethodPost))
		mux.HandleFunc("POST /items/{itemID}/restore", handler.restoreTrashItem)
		mux.HandleFunc("/items/{itemID}/restore", methodNotAllowed(http.MethodPost))
		mux.HandleFunc("DELETE /items/{itemID}", handler.deleteItemImmediately)
		mux.HandleFunc("GET /trash", handler.listTrash)
		mux.HandleFunc("/trash", methodNotAllowed(http.MethodGet))
		mux.HandleFunc("/items/{itemID}", methodNotAllowed(http.MethodGet+", "+http.MethodDelete))
	} else {
		mux.HandleFunc("/items/{itemID}", methodNotAllowed(http.MethodGet))
	}
	if handler.fileAccess != nil {
		mux.HandleFunc("GET /items/{itemID}/access", handler.getFileAccess)
		mux.HandleFunc(
			"/items/{itemID}/access",
			methodNotAllowed(http.MethodGet),
		)
	}
	mux.HandleFunc("GET /quota", handler.getQuota)
	mux.HandleFunc("/quota", methodNotAllowed(http.MethodGet))
	if handler.quotaRequests != nil {
		mux.HandleFunc("POST /quota/requests", handler.createQuotaRequest)
		mux.HandleFunc("/quota/requests", methodNotAllowed(http.MethodPost))
		mux.HandleFunc("GET /quota/requests/current", handler.getCurrentQuotaRequest)
		mux.HandleFunc("/quota/requests/current", methodNotAllowed(http.MethodGet))
	}
	if handler.uploads != nil {
		mux.HandleFunc("POST /uploads", handler.initiateUpload)
		mux.HandleFunc("/uploads", methodNotAllowed(http.MethodPost))
		mux.HandleFunc(
			"POST /uploads/{sessionID}/complete",
			handler.completeUpload,
		)
		mux.HandleFunc(
			"/uploads/{sessionID}/complete",
			methodNotAllowed(http.MethodPost),
		)
	}
	mux.HandleFunc("/", handler.notFound)

	return handler.requestIDMiddleware(handler.authenticator.Middleware(mux)), nil
}

func (h *Handler) getFileAccess(
	writer http.ResponseWriter,
	request *http.Request,
) {
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

	access, err := h.fileAccess.CreateAccess(
		request.Context(),
		ownerUserID(request.Context()),
		itemID,
	)
	if err != nil {
		h.writeFileAccessError(writer, request, err)
		return
	}

	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, http.StatusOK, fileAccessResponse{
		ItemID:      access.ItemID.String(),
		URL:         access.URL,
		ExpiresAt:   access.ExpiresAt,
		FileName:    access.FileName,
		ContentType: access.ContentType,
		SizeBytes:   access.SizeBytes,
	})
}

type initiateUploadRequest struct {
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	SizeBytes   int64  `json:"sizeBytes"`
}

func (h *Handler) initiateUpload(
	writer http.ResponseWriter,
	request *http.Request,
) {
	var input initiateUploadRequest
	if err := h.decodeJSON(writer, request, &input); err != nil {
		h.writeDecodeError(writer, err)
		return
	}

	result, err := h.uploads.Initiate(request.Context(), upload.InitiateRequest{
		OwnerUserID:    ownerUserID(request.Context()),
		FileName:       input.FileName,
		ContentType:    input.ContentType,
		DeclaredBytes:  input.SizeBytes,
		IdempotencyKey: request.Header.Get("Idempotency-Key"),
	})
	if err != nil {
		h.writeUploadError(writer, request, err)
		return
	}

	status := http.StatusCreated
	if !result.Created {
		status = http.StatusOK
	}
	writeJSON(writer, status, initiateUploadResponse{
		UploadSessionID: result.Session.ID.String(),
		ItemID:          result.Session.ItemID.String(),
		Status:          result.Session.Status,
		UploadURL:       result.UploadURL,
		Method:          http.MethodPut,
		RequiredHeaders: result.RequiredHeaders,
		SizeBytes:       result.Session.DeclaredBytes,
		ExpiresAt:       result.Session.ExpiresAt,
	})
}

func (h *Handler) completeUpload(
	writer http.ResponseWriter,
	request *http.Request,
) {
	sessionID, err := uuid.Parse(request.PathValue("sessionID"))
	if err != nil || sessionID == uuid.Nil {
		writeError(
			writer,
			http.StatusBadRequest,
			"INVALID_UPLOAD_SESSION_ID",
			"upload session ID must be a valid UUID",
		)
		return
	}

	result, err := h.uploads.Complete(request.Context(), upload.CompleteRequest{
		OwnerUserID: ownerUserID(request.Context()),
		SessionID:   sessionID,
	})
	if err != nil {
		h.writeUploadError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, completeUploadResponse{
		Item: itemResponseFrom(result.Item),
		Job: uploadJobResponse{
			ID:     result.Job.ID.String(),
			Type:   result.Job.Type,
			Status: result.Job.Status,
		},
	})
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
	listRequest, ok := parseListRequest(writer, request)
	if !ok {
		return
	}

	page, err := h.service.ListItems(
		request.Context(),
		ownerUserID(request.Context()),
		listRequest,
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
		ActiveBytes:    quota.ActiveBytes(),
		TrashBytes:     quota.TrashBytes,
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
	case errors.Is(err, cloud.ErrInvalidFilter):
		writeError(writer, http.StatusBadRequest, "INVALID_FILTER", err.Error())
	case errors.Is(err, cloud.ErrInvalidContent):
		writeError(writer, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
	default:
		h.logInternalError(request, err)
		writeError(
			writer,
			http.StatusInternalServerError,
			"INTERNAL_ERROR",
			"an internal error occurred",
		)
	}
}

func (h *Handler) writeUploadError(
	writer http.ResponseWriter,
	request *http.Request,
	err error,
) {
	switch {
	case errors.Is(err, upload.ErrInvalidUpload):
		writeError(writer, http.StatusBadRequest, "INVALID_UPLOAD", err.Error())
	case errors.Is(err, upload.ErrFileTooLarge):
		writeError(
			writer,
			http.StatusRequestEntityTooLarge,
			"FILE_TOO_LARGE",
			"file exceeds maximum upload size",
		)
	case errors.Is(err, cloud.ErrQuotaExceeded):
		writeError(writer, http.StatusConflict, "QUOTA_EXCEEDED", "cloud quota exceeded")
	case errors.Is(err, cloud.ErrDriveNotActive):
		writeError(
			writer,
			http.StatusForbidden,
			"DRIVE_NOT_ACTIVE",
			"cloud drive does not allow new uploads",
		)
	case errors.Is(err, upload.ErrIdempotencyConflict):
		writeError(
			writer,
			http.StatusConflict,
			"IDEMPOTENCY_CONFLICT",
			err.Error(),
		)
	case errors.Is(err, upload.ErrSessionNotFound):
		writeError(
			writer,
			http.StatusNotFound,
			"UPLOAD_SESSION_NOT_FOUND",
			"upload session not found",
		)
	case errors.Is(err, upload.ErrObjectNotFound):
		writeError(
			writer,
			http.StatusConflict,
			"UPLOAD_OBJECT_NOT_FOUND",
			"upload file to the presigned URL before completing",
		)
	case errors.Is(err, upload.ErrSessionExpired):
		writeError(
			writer,
			http.StatusConflict,
			"UPLOAD_SESSION_EXPIRED",
			err.Error(),
		)
	case errors.Is(err, upload.ErrSessionRejected),
		errors.Is(err, upload.ErrSessionCompleted):
		writeError(
			writer,
			http.StatusConflict,
			"UPLOAD_SESSION_CONFLICT",
			err.Error(),
		)
	case errors.Is(err, upload.ErrObjectSizeMismatch):
		writeError(
			writer,
			http.StatusUnprocessableEntity,
			"UPLOAD_SIZE_MISMATCH",
			"uploaded object size does not match declared size",
		)
	case errors.Is(err, upload.ErrObjectTypeMismatch):
		writeError(
			writer,
			http.StatusUnprocessableEntity,
			"UPLOAD_CONTENT_TYPE_MISMATCH",
			"uploaded object content type does not match declared type",
		)
	default:
		h.logInternalError(request, err)
		writeError(
			writer,
			http.StatusInternalServerError,
			"INTERNAL_ERROR",
			"an internal error occurred",
		)
	}
}

func (h *Handler) writeFileAccessError(
	writer http.ResponseWriter,
	request *http.Request,
	err error,
) {
	switch {
	case errors.Is(err, fileaccess.ErrInvalidInput):
		writeError(
			writer,
			http.StatusBadRequest,
			"INVALID_ITEM_ID",
			"item ID must be a valid UUID",
		)
	case errors.Is(err, fileaccess.ErrNotFound):
		writeError(writer, http.StatusNotFound, "ITEM_NOT_FOUND", "cloud item not found")
	case errors.Is(err, fileaccess.ErrNotFile):
		writeError(
			writer,
			http.StatusConflict,
			"ITEM_NOT_FILE",
			"cloud item does not contain a file",
		)
	case errors.Is(err, fileaccess.ErrNotReady):
		writeError(
			writer,
			http.StatusConflict,
			"ITEM_NOT_READY",
			"cloud file is not ready",
		)
	case errors.Is(err, fileaccess.ErrDeletePending):
		writeError(
			writer,
			http.StatusConflict,
			"DELETE_PENDING",
			"cloud file permanent delete is pending",
		)
	case errors.Is(err, fileaccess.ErrObjectUnavailable):
		writeError(
			writer,
			http.StatusConflict,
			"FILE_OBJECT_UNAVAILABLE",
			"cloud file object is unavailable",
		)
	default:
		h.logInternalError(request, err)
		writeError(
			writer,
			http.StatusInternalServerError,
			"INTERNAL_ERROR",
			"an internal error occurred",
		)
	}
}

func (h *Handler) logInternalError(request *http.Request, err error) {
	h.logger.ErrorContext(
		request.Context(),
		"cloud API request failed",
		// Dependency errors can contain presigned URLs, credentials, SQL or
		// object keys. Keep the correlation context, but never serialize the
		// underlying error into application logs.
		"error", "internal dependency failure",
		"error_type", fmt.Sprintf("%T", err),
		"request_id", requestID(request.Context()),
		"method", request.Method,
		"path", request.URL.Path,
		"owner_user_id", ownerUserID(request.Context()),
	)
}

type contextKey string

const requestIDKey contextKey = "cloud-request-id"

func (h *Handler) requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		id := uuid.NewString()
		writer.Header().Set(requestIDHeader, id)
		ctx := context.WithValue(request.Context(), requestIDKey, id)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

func ownerUserID(ctx context.Context) uuid.UUID {
	return auth.OwnerUserID(ctx)
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
