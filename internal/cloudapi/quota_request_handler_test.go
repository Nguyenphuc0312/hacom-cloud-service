package cloudapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	"github.com/google/uuid"
)

type fakeQuotaRequestService struct {
	create  func(context.Context, quotarequest.CreateCommand) (quotarequest.CreateResult, error)
	current func(context.Context, uuid.UUID) (quotarequest.Request, error)
}

func TestQuotaRequestMetricOutcomeSeparatesBusinessAndInternalErrors(t *testing.T) {
	if got := quotaRequestMetricOutcome(quotarequest.ErrPendingExists); got != "rejected" {
		t.Fatalf("business outcome=%q", got)
	}
	if got := quotaRequestMetricOutcome(errors.New("database unavailable")); got != "error" {
		t.Fatalf("internal outcome=%q", got)
	}
}

func (f fakeQuotaRequestService) Create(ctx context.Context, command quotarequest.CreateCommand) (quotarequest.CreateResult, error) {
	return f.create(ctx, command)
}

func (f fakeQuotaRequestService) Current(ctx context.Context, owner uuid.UUID) (quotarequest.Request, error) {
	return f.current(ctx, owner)
}

func newQuotaRequestHandler(t *testing.T, service QuotaRequestService) http.Handler {
	t.Helper()
	handler, err := New(
		fakeService{}, 100_000_000,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		WithQuotaRequestService(service),
	)
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func TestQuotaRequestCreateUsesIntegerBytesOwnerAndIdempotency(t *testing.T) {
	ownerID, requestID := uuid.New(), uuid.New()
	reason := "More project storage"
	now := time.Now().UTC()
	service := fakeQuotaRequestService{create: func(_ context.Context, command quotarequest.CreateCommand) (quotarequest.CreateResult, error) {
		if command.OwnerUserID != ownerID || command.RequestedQuotaBytes != 10_000_000_000 ||
			command.IdempotencyKey != "quota-key-1" || command.Reason == nil || *command.Reason != reason {
			t.Fatalf("command=%+v", command)
		}
		return quotarequest.CreateResult{Applied: true, Request: quotarequest.Request{
			ID: requestID, RequestedByUserID: ownerID, Status: quotarequest.StatusPending,
			CurrentQuotaBytes: 5_000_000_000, RequestedQuotaBytes: 10_000_000_000,
			Reason: &reason, CreatedAt: now, UpdatedAt: now,
		}}, nil
	}}
	handler := newQuotaRequestHandler(t, service)
	request := requestWithUser(http.MethodPost, "/quota/requests",
		`{"requestedQuotaBytes":10000000000,"reason":"More project storage"}`, ownerID)
	request.Header.Set(idempotencyKeyHeader, "quota-key-1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control=%q", response.Header().Get("Cache-Control"))
	}
	var payload quotaRequestResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.ID != requestID.String() || payload.RequestedQuotaBytes != 10_000_000_000 ||
		payload.Applied == nil || !*payload.Applied {
		t.Fatalf("payload=%+v", payload)
	}
}

func TestQuotaRequestCreateRejectsFloatUnknownFieldAndMissingKey(t *testing.T) {
	service := fakeQuotaRequestService{create: func(context.Context, quotarequest.CreateCommand) (quotarequest.CreateResult, error) {
		return quotarequest.CreateResult{}, quotarequest.ErrInvalidInput
	}}
	handler := newQuotaRequestHandler(t, service)
	ownerID := uuid.New()
	tests := []struct {
		body string
		key  string
	}{
		{`{"requestedQuotaBytes":10000000000.5}`, "key"},
		{`{"requestedQuotaBytes":10000000000,"quotaBytes":999}`, "key"},
		{`{"requestedQuotaBytes":10000000000}`, ""},
	}
	for index, test := range tests {
		request := requestWithUser(http.MethodPost, "/quota/requests", test.body, ownerID)
		request.Header.Set(idempotencyKeyHeader, test.key)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("case=%d status=%d body=%s", index, response.Code, response.Body.String())
		}
	}
}

func TestQuotaRequestCurrentAndNoCancelContract(t *testing.T) {
	ownerID, requestID := uuid.New(), uuid.New()
	service := fakeQuotaRequestService{current: func(_ context.Context, owner uuid.UUID) (quotarequest.Request, error) {
		if owner != ownerID {
			t.Fatalf("owner=%s", owner)
		}
		return quotarequest.Request{ID: requestID, Status: quotarequest.StatusPending}, nil
	}}
	handler := newQuotaRequestHandler(t, service)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, requestWithUser(http.MethodGet, "/quota/requests/current", "", ownerID))
	if response.Code != http.StatusOK {
		t.Fatalf("GET status=%d body=%s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, requestWithUser(http.MethodDelete, "/quota/requests/current", "", ownerID))
	if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("DELETE status=%d allow=%q", response.Code, response.Header().Get("Allow"))
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, requestWithUser(http.MethodPost, "/quota", `{}`, ownerID))
	if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("direct quota update status=%d allow=%q", response.Code, response.Header().Get("Allow"))
	}
}

func TestQuotaRequestErrorsHaveStableCatalog(t *testing.T) {
	tests := []struct {
		err  error
		code int
		name string
	}{
		{quotarequest.ErrInvalidTier, 400, "INVALID_QUOTA_TIER"},
		{quotarequest.ErrPendingExists, 409, "QUOTA_REQUEST_PENDING"},
		{quotarequest.ErrIdempotencyConflict, 409, "IDEMPOTENCY_CONFLICT"},
		{quotarequest.ErrNotFound, 404, "QUOTA_REQUEST_NOT_FOUND"},
	}
	for _, test := range tests {
		handler := newQuotaRequestHandler(t, fakeQuotaRequestService{current: func(context.Context, uuid.UUID) (quotarequest.Request, error) {
			return quotarequest.Request{}, test.err
		}})
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, requestWithUser(http.MethodGet, "/quota/requests/current", "", uuid.New()))
		if response.Code != test.code {
			t.Fatalf("error=%v status=%d", test.err, response.Code)
		}
		assertErrorCode(t, response, test.name)
	}
}
