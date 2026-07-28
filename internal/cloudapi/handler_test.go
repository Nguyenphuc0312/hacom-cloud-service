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

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/google/uuid"
)

type fakeService struct {
	createText func(context.Context, uuid.UUID, string) (cloud.Item, error)
	createLink func(context.Context, uuid.UUID, string, string) (cloud.Item, error)
	getItem    func(context.Context, uuid.UUID, uuid.UUID) (cloud.Item, error)
	listItems  func(context.Context, uuid.UUID, string, int) (cloud.Page, error)
	getQuota   func(context.Context, uuid.UUID) (cloud.Quota, error)
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

func requestWithUser(
	method, target, body string,
	userID uuid.UUID,
) *http.Request {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if userID != uuid.Nil {
		request.Header.Set(demoUserHeader, userID.String())
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
	service := fakeService{
		getQuota: func(context.Context, uuid.UUID) (cloud.Quota, error) {
			return cloud.Quota{}, errors.New("database unavailable")
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
		"database unavailable",
		requestID,
		ownerID.String(),
		`"method":"GET"`,
		`"path":"/quota"`,
	} {
		if !strings.Contains(logs.String(), expected) {
			t.Fatalf("log %q does not contain %q", logs.String(), expected)
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
