package cloudapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/auth"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/fileaccess"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/upload"
	"github.com/google/uuid"
)

type fakeService struct {
	createText func(context.Context, uuid.UUID, string) (cloud.Item, error)
	createLink func(context.Context, uuid.UUID, string, string) (cloud.Item, error)
	getItem    func(context.Context, uuid.UUID, uuid.UUID) (cloud.Item, error)
	listItems  func(context.Context, uuid.UUID, string, int) (cloud.Page, error)
	getQuota   func(context.Context, uuid.UUID) (cloud.Quota, error)
}

type fakeUploadService struct {
	initiate func(context.Context, upload.InitiateRequest) (upload.InitiateResult, error)
	complete func(context.Context, upload.CompleteRequest) (upload.CompleteResult, error)
}

type principalAuthenticator struct {
	principal auth.Principal
}

func (value principalAuthenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		ctx := auth.WithPrincipal(request.Context(), value.principal)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

type fakeFileAccessService struct {
	createAccess func(
		context.Context,
		uuid.UUID,
		uuid.UUID,
	) (fileaccess.Access, error)
}

func (s fakeFileAccessService) CreateAccess(
	ctx context.Context,
	ownerID uuid.UUID,
	itemID uuid.UUID,
) (fileaccess.Access, error) {
	return s.createAccess(ctx, ownerID, itemID)
}

func (s fakeUploadService) Initiate(
	ctx context.Context,
	request upload.InitiateRequest,
) (upload.InitiateResult, error) {
	return s.initiate(ctx, request)
}

func (s fakeUploadService) Complete(
	ctx context.Context,
	request upload.CompleteRequest,
) (upload.CompleteResult, error) {
	return s.complete(ctx, request)
}

func (s fakeService) CreateText(
	ctx context.Context,
	ownerID uuid.UUID,
	content string,
) (cloud.Item, error) {
	return s.createText(ctx, ownerID, content)
}

func (s fakeService) CreateLink(
	ctx context.Context,
	ownerID uuid.UUID,
	rawURL string,
	title string,
) (cloud.Item, error) {
	return s.createLink(ctx, ownerID, rawURL, title)
}

func (s fakeService) GetItem(
	ctx context.Context,
	ownerID, itemID uuid.UUID,
) (cloud.Item, error) {
	return s.getItem(ctx, ownerID, itemID)
}

func (s fakeService) ListItems(
	ctx context.Context,
	ownerID uuid.UUID,
	cursor string,
	limit int,
) (cloud.Page, error) {
	return s.listItems(ctx, ownerID, cursor, limit)
}

func (s fakeService) GetQuota(
	ctx context.Context,
	ownerID uuid.UUID,
) (cloud.Quota, error) {
	return s.getQuota(ctx, ownerID)
}

func newTestHandler(t *testing.T, service Service) http.Handler {
	t.Helper()
	handler, err := New(
		service,
		100_000_000,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func newTestHandlerWithUploads(
	t *testing.T,
	uploads UploadService,
) http.Handler {
	t.Helper()
	handler, err := New(
		fakeService{},
		100_000_000,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		WithUploadService(uploads),
	)
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func newTestHandlerWithFileAccess(
	t *testing.T,
	fileAccess FileAccessService,
) http.Handler {
	t.Helper()
	handler, err := New(
		fakeService{},
		100_000_000,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		WithFileAccessService(fileAccess),
	)
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func requestWithUser(
	method, target, body string,
	userID uuid.UUID,
) *http.Request {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if userID != uuid.Nil {
		request.Header.Set(auth.DemoUserHeader, userID.String())
	}
	return request
}

func TestCreateTextReturnsCreatedItem(t *testing.T) {
	ownerID := uuid.New()
	itemID := uuid.New()
	now := time.Now().UTC()
	content := "Ghi chú Hacom Cloud"
	service := fakeService{
		createText: func(
			_ context.Context,
			gotOwnerID uuid.UUID,
			gotContent string,
		) (cloud.Item, error) {
			if gotOwnerID != ownerID || gotContent != content {
				t.Fatalf("owner = %s, content = %q", gotOwnerID, gotContent)
			}
			return cloud.Item{
				ID:          itemID,
				Type:        cloud.ItemTypeText,
				Status:      cloud.ItemStatusReady,
				TextContent: &content,
				SizeBytes:   cloud.UTF8Bytes(content),
				CreatedAt:   now,
				UpdatedAt:   now,
			}, nil
		},
	}
	handler := newTestHandler(t, service)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, requestWithUser(
		http.MethodPost,
		"/texts",
		`{"content":"Ghi chú Hacom Cloud"}`,
		ownerID,
	))

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var payload itemResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.ID != itemID.String() || payload.Content == nil || *payload.Content != content {
		t.Fatalf("payload = %+v", payload)
	}
}

func TestGetFileAccessReturnsShortLivedOwnerScopedURL(t *testing.T) {
	ownerID := uuid.New()
	itemID := uuid.New()
	expiresAt := time.Date(2026, 7, 31, 4, 15, 0, 0, time.UTC)
	handler := newTestHandlerWithFileAccess(t, fakeFileAccessService{
		createAccess: func(
			_ context.Context,
			gotOwnerID uuid.UUID,
			gotItemID uuid.UUID,
		) (fileaccess.Access, error) {
			if gotOwnerID != ownerID || gotItemID != itemID {
				t.Fatalf("owner/item = %s/%s", gotOwnerID, gotItemID)
			}
			return fileaccess.Access{
				ItemID:      itemID,
				URL:         "http://minio.local/signed",
				ExpiresAt:   expiresAt,
				FileName:    "bao-cao.pdf",
				ContentType: "application/pdf",
				SizeBytes:   42,
			}, nil
		},
	})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodGet,
		"/items/"+itemID.String()+"/access",
		"",
		ownerID,
	))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
	var payload fileAccessResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.ItemID != itemID.String() ||
		payload.URL != "http://minio.local/signed" ||
		payload.ExpiresAt != expiresAt ||
		payload.FileName != "bao-cao.pdf" ||
		payload.ContentType != "application/pdf" ||
		payload.SizeBytes != 42 {
		t.Fatalf("payload = %+v", payload)
	}
}

func TestGetFileAccessHidesOtherUsersItems(t *testing.T) {
	itemID := uuid.New()
	handler := newTestHandlerWithFileAccess(t, fakeFileAccessService{
		createAccess: func(
			context.Context,
			uuid.UUID,
			uuid.UUID,
		) (fileaccess.Access, error) {
			return fileaccess.Access{}, fileaccess.ErrNotFound
		},
	})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodGet,
		"/items/"+itemID.String()+"/access",
		"",
		uuid.New(),
	))

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	assertErrorCode(t, response, "ITEM_NOT_FOUND")
}

func TestInitiateUploadPassesOwnerMetadataAndIdempotencyKey(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	itemID := uuid.New()
	var received upload.InitiateRequest
	handler := newTestHandlerWithUploads(t, fakeUploadService{
		initiate: func(
			_ context.Context,
			request upload.InitiateRequest,
		) (upload.InitiateResult, error) {
			received = request
			return upload.InitiateResult{
				Session: upload.Session{
					ID:            sessionID,
					ItemID:        itemID,
					Status:        upload.SessionInitiated,
					DeclaredBytes: 4,
					ExpiresAt:     time.Now().Add(time.Minute),
				},
				UploadURL: "http://minio/upload",
				RequiredHeaders: map[string]string{
					"Content-Type": "text/plain",
				},
				Created: true,
			}, nil
		},
	})
	request := requestWithUser(
		http.MethodPost,
		"/uploads",
		`{"fileName":"a.txt","contentType":"text/plain","sizeBytes":4}`,
		ownerID,
	)
	request.Header.Set("Idempotency-Key", "upload-1")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body=%s", response.Code, response.Body.String())
	}
	if received.OwnerUserID != ownerID ||
		received.FileName != "a.txt" ||
		received.ContentType != "text/plain" ||
		received.DeclaredBytes != 4 ||
		received.IdempotencyKey != "upload-1" {
		t.Fatalf("initiate request = %+v", received)
	}
	var payload initiateUploadResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.UploadSessionID != sessionID.String() ||
		payload.ItemID != itemID.String() ||
		payload.UploadURL != "http://minio/upload" {
		t.Fatalf("response = %+v", payload)
	}
}

func TestIdempotentInitiateReturnsOK(t *testing.T) {
	handler := newTestHandlerWithUploads(t, fakeUploadService{
		initiate: func(
			context.Context,
			upload.InitiateRequest,
		) (upload.InitiateResult, error) {
			return upload.InitiateResult{
				Session: upload.Session{
					ID:        uuid.New(),
					ItemID:    uuid.New(),
					ExpiresAt: time.Now().Add(time.Minute),
				},
				Created: false,
			}, nil
		},
	})
	request := requestWithUser(
		http.MethodPost,
		"/uploads",
		`{"fileName":"a.txt","contentType":"text/plain","sizeBytes":4}`,
		uuid.New(),
	)
	request.Header.Set("Idempotency-Key", "same")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.Code)
	}
}

func TestCompleteUploadUsesPathSessionAndOwner(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	itemID := uuid.New()
	jobID := uuid.New()
	var received upload.CompleteRequest
	handler := newTestHandlerWithUploads(t, fakeUploadService{
		complete: func(
			_ context.Context,
			request upload.CompleteRequest,
		) (upload.CompleteResult, error) {
			received = request
			return upload.CompleteResult{
				Item: cloud.Item{
					ID:        itemID,
					Type:      cloud.ItemTypeFile,
					Status:    cloud.ItemStatusProcessing,
					SizeBytes: 4,
				},
				Job: upload.Job{
					ID:     jobID,
					Type:   "hash_file",
					Status: "pending",
				},
			}, nil
		},
	})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodPost,
		"/uploads/"+sessionID.String()+"/complete",
		"",
		ownerID,
	))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", response.Code, response.Body.String())
	}
	if received.OwnerUserID != ownerID || received.SessionID != sessionID {
		t.Fatalf("complete request = %+v", received)
	}
	var payload completeUploadResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Item.ID != itemID.String() ||
		payload.Job.ID != jobID.String() ||
		payload.Job.Status != "pending" {
		t.Fatalf("response = %+v", payload)
	}
}

func TestUploadErrorsMapToStableResponses(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{"invalid", upload.ErrInvalidUpload, 400, "INVALID_UPLOAD"},
		{"too large", upload.ErrFileTooLarge, 413, "FILE_TOO_LARGE"},
		{"quota", cloud.ErrQuotaExceeded, 409, "QUOTA_EXCEEDED"},
		{"drive", cloud.ErrDriveNotActive, 403, "DRIVE_NOT_ACTIVE"},
		{"idempotency", upload.ErrIdempotencyConflict, 409, "IDEMPOTENCY_CONFLICT"},
		{"session missing", upload.ErrSessionNotFound, 404, "UPLOAD_SESSION_NOT_FOUND"},
		{"object missing", upload.ErrObjectNotFound, 409, "UPLOAD_OBJECT_NOT_FOUND"},
		{"expired", upload.ErrSessionExpired, 409, "UPLOAD_SESSION_EXPIRED"},
		{"size mismatch", upload.ErrObjectSizeMismatch, 422, "UPLOAD_SIZE_MISMATCH"},
		{"type mismatch", upload.ErrObjectTypeMismatch, 422, "UPLOAD_CONTENT_TYPE_MISMATCH"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := newTestHandlerWithUploads(t, fakeUploadService{
				initiate: func(
					context.Context,
					upload.InitiateRequest,
				) (upload.InitiateResult, error) {
					return upload.InitiateResult{}, test.err
				},
			})
			request := requestWithUser(
				http.MethodPost,
				"/uploads",
				`{"fileName":"a.txt","contentType":"text/plain","sizeBytes":4}`,
				uuid.New(),
			)
			request.Header.Set("Idempotency-Key", "key")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
			assertErrorCode(t, response, test.wantCode)
		})
	}
}

func TestCloudAPIRequiresDemoUser(t *testing.T) {
	service := fakeService{}
	handler := newTestHandler(t, service)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/quota", nil))

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.Code)
	}
	assertErrorCode(t, response, "DEMO_USER_REQUIRED")
}

func TestCloudAPIRejectsInvalidDemoUser(t *testing.T) {
	handler := newTestHandler(t, fakeService{})
	request := httptest.NewRequest(http.MethodGet, "/quota", nil)
	request.Header.Set(auth.DemoUserHeader, "not-a-uuid")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.Code)
	}
	assertErrorCode(t, response, "DEMO_USER_REQUIRED")
}

func TestCloudAPIUsesVerifiedPrincipalInsteadOfDemoHeader(t *testing.T) {
	verifiedUserID := uuid.New()
	forgedUserID := uuid.New()
	service := fakeService{
		getQuota: func(_ context.Context, ownerID uuid.UUID) (cloud.Quota, error) {
			if ownerID != verifiedUserID {
				t.Fatalf("owner ID = %s, want verified subject %s", ownerID, verifiedUserID)
			}
			return cloud.Quota{LimitBytes: 5_000_000_000}, nil
		},
	}
	handler, err := New(
		service,
		100_000_000,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		WithAuthenticator(principalAuthenticator{principal: auth.Principal{Subject: verifiedUserID}}),
	)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/quota", nil)
	request.Header.Set(auth.DemoUserHeader, forgedUserID.String())
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCreateTextRejectsUnknownJSONField(t *testing.T) {
	service := fakeService{
		createText: func(context.Context, uuid.UUID, string) (cloud.Item, error) {
			t.Fatal("service must not be called")
			return cloud.Item{}, nil
		},
	}
	handler := newTestHandler(t, service)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodPost,
		"/texts",
		`{"content":"hello","unexpected":true}`,
		uuid.New(),
	))

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.Code)
	}
	assertErrorCode(t, response, "INVALID_JSON")
}

func TestCreateTextRejectsTrailingJSON(t *testing.T) {
	service := fakeService{
		createText: func(context.Context, uuid.UUID, string) (cloud.Item, error) {
			t.Fatal("service must not be called")
			return cloud.Item{}, nil
		},
	}
	handler := newTestHandler(t, service)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodPost,
		"/texts",
		`{"content":"hello"} {"content":"second"}`,
		uuid.New(),
	))

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.Code)
	}
	assertErrorCode(t, response, "INVALID_JSON")
}

func TestCreateTextRejectsOversizedBody(t *testing.T) {
	service := fakeService{
		createText: func(context.Context, uuid.UUID, string) (cloud.Item, error) {
			t.Fatal("service must not be called")
			return cloud.Item{}, nil
		},
	}
	handler, err := New(
		service,
		8,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodPost,
		"/texts",
		`{"content":"`+strings.Repeat("x", 70_000)+`"}`,
		uuid.New(),
	))

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", response.Code)
	}
	assertErrorCode(t, response, "BODY_TOO_LARGE")
}

func TestCreateTextRejectsUnsupportedMediaType(t *testing.T) {
	service := fakeService{
		createText: func(context.Context, uuid.UUID, string) (cloud.Item, error) {
			t.Fatal("service must not be called")
			return cloud.Item{}, nil
		},
	}
	handler := newTestHandler(t, service)
	request := requestWithUser(
		http.MethodPost,
		"/texts",
		`{"content":"hello"}`,
		uuid.New(),
	)
	request.Header.Set("Content-Type", "text/plain")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, want 415", response.Code)
	}
	assertErrorCode(t, response, "UNSUPPORTED_MEDIA_TYPE")
}

func TestListItemsRejectsExplicitZeroLimit(t *testing.T) {
	service := fakeService{
		listItems: func(
			context.Context,
			uuid.UUID,
			string,
			int,
		) (cloud.Page, error) {
			t.Fatal("service must not be called")
			return cloud.Page{}, nil
		},
	}
	handler := newTestHandler(t, service)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodGet,
		"/items?limit=0",
		"",
		uuid.New(),
	))

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.Code)
	}
	assertErrorCode(t, response, "INVALID_LIMIT")
}

func TestKnownRouteRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandler(t, fakeService{})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodDelete,
		"/quota",
		"",
		uuid.New(),
	))

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", response.Code)
	}
	if response.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("Allow = %q, want GET", response.Header().Get("Allow"))
	}
	assertErrorCode(t, response, "METHOD_NOT_ALLOWED")
}

func TestGetItemHidesOtherUsersItemsAsNotFound(t *testing.T) {
	service := fakeService{
		getItem: func(context.Context, uuid.UUID, uuid.UUID) (cloud.Item, error) {
			return cloud.Item{}, cloud.ErrNotFound
		},
	}
	handler := newTestHandler(t, service)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodGet,
		"/items/"+uuid.NewString(),
		"",
		uuid.New(),
	))

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", response.Code)
	}
	assertErrorCode(t, response, "ITEM_NOT_FOUND")
}

func TestListItemsPassesCursorAndLimit(t *testing.T) {
	ownerID := uuid.New()
	itemID := uuid.New()
	service := fakeService{
		listItems: func(
			_ context.Context,
			gotOwnerID uuid.UUID,
			cursor string,
			limit int,
		) (cloud.Page, error) {
			if gotOwnerID != ownerID || cursor != "cursor-value" || limit != 5 {
				t.Fatalf("owner = %s, cursor = %q, limit = %d", gotOwnerID, cursor, limit)
			}
			return cloud.Page{
				Items: []cloud.Item{{
					ID:        itemID,
					Type:      cloud.ItemTypeLink,
					Status:    cloud.ItemStatusReady,
					SizeBytes: 10,
				}},
				NextCursor: "next",
			}, nil
		},
	}
	handler := newTestHandler(t, service)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodGet,
		"/items?cursor=cursor-value&limit=5",
		"",
		ownerID,
	))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var payload listItemsResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Items) != 1 || payload.NextCursor != "next" {
		t.Fatalf("payload = %+v", payload)
	}
}

func TestServiceErrorsMapToStableAPIResponses(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{
			name:       "quota",
			err:        cloud.ErrQuotaExceeded,
			wantStatus: http.StatusConflict,
			wantCode:   "QUOTA_EXCEEDED",
		},
		{
			name:       "drive not active",
			err:        cloud.ErrDriveNotActive,
			wantStatus: http.StatusForbidden,
			wantCode:   "DRIVE_NOT_ACTIVE",
		},
		{
			name:       "validation",
			err:        cloud.ErrInvalidContent,
			wantStatus: http.StatusBadRequest,
			wantCode:   "VALIDATION_ERROR",
		},
		{
			name:       "internal",
			err:        errors.New("database unavailable"),
			wantStatus: http.StatusInternalServerError,
			wantCode:   "INTERNAL_ERROR",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := fakeService{
				getQuota: func(context.Context, uuid.UUID) (cloud.Quota, error) {
					return cloud.Quota{}, test.err
				},
			}
			handler := newTestHandler(t, service)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, requestWithUser(
				http.MethodGet,
				"/quota",
				"",
				uuid.New(),
			))

			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
			assertErrorCode(t, response, test.wantCode)
		})
	}
}

func TestCloudAPIAddsRequestID(t *testing.T) {
	handler := newTestHandler(t, fakeService{})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/quota", nil))

	if _, err := uuid.Parse(response.Header().Get(requestIDHeader)); err != nil {
		t.Fatalf("X-Request-ID must be a UUID: %v", err)
	}
}

func TestInternalErrorIsLoggedWithRequestContext(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	sensitiveError := "database unavailable: " +
		"http://localhost:9000/bucket/object?X-Amz-Signature=top-secret " +
		"access_key=minioadmin secret_key=minioadmin"
	service := fakeService{
		getQuota: func(context.Context, uuid.UUID) (cloud.Quota, error) {
			return cloud.Quota{}, errors.New(sensitiveError)
		},
	}
	handler, err := New(service, 100_000_000, logger)
	if err != nil {
		t.Fatal(err)
	}
	ownerID := uuid.New()
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, requestWithUser(
		http.MethodGet,
		"/quota",
		"",
		ownerID,
	))

	requestID := response.Header().Get(requestIDHeader)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", response.Code)
	}
	for _, expected := range []string{
		"internal dependency failure",
		requestID,
		ownerID.String(),
		`"method":"GET"`,
		`"path":"/quota"`,
	} {
		if !strings.Contains(logs.String(), expected) {
			t.Fatalf("log %q does not contain %q", logs.String(), expected)
		}
	}
	for _, forbidden := range []string{
		"database unavailable",
		"X-Amz-Signature",
		"top-secret",
		"minioadmin",
		"access_key",
		"secret_key",
	} {
		if strings.Contains(logs.String(), forbidden) {
			t.Fatalf("log contains sensitive value %q: %s", forbidden, logs.String())
		}
	}
}

func assertErrorCode(
	t *testing.T,
	response *httptest.ResponseRecorder,
	want string,
) {
	t.Helper()
	var payload errorEnvelope
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Error.Code != want {
		t.Fatalf("error code = %q, want %q", payload.Error.Code, want)
	}
}
