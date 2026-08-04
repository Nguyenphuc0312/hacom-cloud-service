package cloudapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/auth"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	"github.com/google/uuid"
)

type fakeAdminQuotaService struct {
	list   func(context.Context, quotarequest.AdminListFilter) (quotarequest.AdminPage, error)
	review func(context.Context, quotarequest.ReviewCommand) (quotarequest.ReviewResult, error)
}

func (f fakeAdminQuotaService) AdminList(ctx context.Context, filter quotarequest.AdminListFilter) (quotarequest.AdminPage, error) {
	return f.list(ctx, filter)
}

func (f fakeAdminQuotaService) Review(ctx context.Context, command quotarequest.ReviewCommand) (quotarequest.ReviewResult, error) {
	return f.review(ctx, command)
}

func newAdminQuotaTestHandler(t *testing.T, service adminQuotaService) http.Handler {
	t.Helper()
	handler, err := NewAdminQuotaHandler(
		service,
		auth.DemoServiceAuthenticator{Token: "valid-service-token"},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func TestAdminQuotaRequiresServiceToken(t *testing.T) {
	handler := newAdminQuotaTestHandler(t, fakeAdminQuotaService{list: func(context.Context, quotarequest.AdminListFilter) (quotarequest.AdminPage, error) {
		t.Fatal("service must not be called")
		return quotarequest.AdminPage{}, nil
	}})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/admin/quota/requests", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	assertErrorCode(t, response, "INVALID_SERVICE_TOKEN")
}

func TestAdminQuotaListRejectsUnknownOrRepeatedFilters(t *testing.T) {
	handler := newAdminQuotaTestHandler(t, fakeAdminQuotaService{list: func(context.Context, quotarequest.AdminListFilter) (quotarequest.AdminPage, error) {
		t.Fatal("service must not be called")
		return quotarequest.AdminPage{}, nil
	}})
	for _, target := range []string{
		"/admin/quota/requests?unknown=value",
		"/admin/quota/requests?status=pending&status=approved",
	} {
		request := httptest.NewRequest(http.MethodGet, target, nil)
		request.Header.Set("Authorization", "Bearer valid-service-token")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("target=%s status=%d body=%s", target, response.Code, response.Body.String())
		}
		assertErrorCode(t, response, "INVALID_QUOTA_ADMIN_FILTER")
	}
}

func TestAdminQuotaApproveForwardsTrustedActorAndIdempotency(t *testing.T) {
	requestID, actorID, ownerID := uuid.New(), uuid.New(), uuid.New()
	now := time.Now().UTC()
	handler := newAdminQuotaTestHandler(t, fakeAdminQuotaService{review: func(_ context.Context, command quotarequest.ReviewCommand) (quotarequest.ReviewResult, error) {
		if command.RequestID != requestID || command.ActorUserID != actorID || command.Decision != quotarequest.StatusApproved ||
			command.OperationID != "review-op-1" || command.RequestIDTrace != "trace-1" || command.Note == nil || *command.Note != "capacity checked" {
			t.Fatalf("command=%+v", command)
		}
		return quotarequest.ReviewResult{Applied: true, Item: quotarequest.AdminListItem{
			Request:     quotarequest.Request{ID: requestID, Status: quotarequest.StatusApproved, RequestedQuotaBytes: 10_000_000_000, CreatedAt: now, UpdatedAt: now},
			OwnerUserID: ownerID, QuotaBytes: 10_000_000_000,
		}}, nil
	}})
	request := httptest.NewRequest(http.MethodPost, "/admin/quota/requests/"+requestID.String()+"/approve", strings.NewReader(`{"note":"capacity checked"}`))
	request.Header.Set("Authorization", "Bearer valid-service-token")
	request.Header.Set(adminActorHeader, actorID.String())
	request.Header.Set(idempotencyKeyHeader, "review-op-1")
	request.Header.Set(requestIDHeader, "trace-1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var payload adminQuotaResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.ID != requestID.String() || payload.Applied == nil || !*payload.Applied {
		t.Fatalf("payload=%+v", payload)
	}
}

func TestAdminQuotaRejectsUntrustedActorAndUnknownBody(t *testing.T) {
	handler := newAdminQuotaTestHandler(t, fakeAdminQuotaService{review: func(context.Context, quotarequest.ReviewCommand) (quotarequest.ReviewResult, error) {
		t.Fatal("service must not be called")
		return quotarequest.ReviewResult{}, nil
	}})
	for _, test := range []struct {
		actor string
		body  string
	}{
		{"not-a-uuid", `{}`},
		{uuid.NewString(), `{"decision":"approved"}`},
	} {
		request := httptest.NewRequest(http.MethodPost, "/admin/quota/requests/"+uuid.NewString()+"/reject", strings.NewReader(test.body))
		request.Header.Set("Authorization", "Bearer valid-service-token")
		request.Header.Set(adminActorHeader, test.actor)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
		}
	}
}
