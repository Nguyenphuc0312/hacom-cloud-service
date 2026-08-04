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

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/google/uuid"
)

type fakeTrashService struct {
	move    func(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error)
	restore func(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error)
	delete  func(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error)
	list    func(context.Context, uuid.UUID, string, int) (trashdomain.Page, error)
}

func (f fakeTrashService) MoveToTrash(ctx context.Context, owner, item uuid.UUID, key string) (trashdomain.Result, error) {
	return f.move(ctx, owner, item, key)
}
func (f fakeTrashService) Restore(ctx context.Context, owner, item uuid.UUID, key string) (trashdomain.Result, error) {
	return f.restore(ctx, owner, item, key)
}
func (f fakeTrashService) DeleteImmediately(ctx context.Context, owner, item uuid.UUID, key string) (trashdomain.Result, error) {
	return f.delete(ctx, owner, item, key)
}
func (f fakeTrashService) List(ctx context.Context, owner uuid.UUID, cursor string, limit int) (trashdomain.Page, error) {
	return f.list(ctx, owner, cursor, limit)
}

func newTrashHandler(t *testing.T, service TrashService) http.Handler {
	t.Helper()
	handler, err := New(
		fakeService{}, 100_000_000,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		WithTrashService(service),
	)
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func lifecycleRequestFor(method, path string, owner uuid.UUID, key string) *http.Request {
	request := requestWithUser(method, path, "", owner)
	request.Header.Del("Content-Type")
	request.Header.Set(idempotencyKeyHeader, key)
	return request
}

func TestTrashEndpointsPreserveOwnerAndIdempotencyContract(t *testing.T) {
	ownerID, itemID := uuid.New(), uuid.New()
	now := time.Now().UTC()
	trashed := trashdomain.ItemStateTrashed
	calls := 0
	service := fakeTrashService{
		move: func(_ context.Context, owner, item uuid.UUID, key string) (trashdomain.Result, error) {
			calls++
			if owner != ownerID || item != itemID || key != "operation-1" {
				t.Fatalf("unexpected move input: %s %s %q", owner, item, key)
			}
			return trashdomain.Result{ItemID: itemID, CurrentState: &trashed, DeletedAt: &now, PurgeAfter: timePointerForTest(now.Add(24 * time.Hour)), Applied: calls == 1}, nil
		},
	}
	handler := newTrashHandler(t, service)
	for attempt := 0; attempt < 2; attempt++ {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, lifecycleRequestFor(http.MethodPost, "/items/"+itemID.String()+"/trash", ownerID, "operation-1"))
		if response.Code != http.StatusOK {
			t.Fatalf("attempt %d status=%d body=%s", attempt, response.Code, response.Body.String())
		}
		var payload trashLifecycleResponse
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload.ItemID != itemID.String() || payload.Status != string(trashed) || payload.Applied != (attempt == 0) {
			t.Fatalf("attempt %d payload=%+v", attempt, payload)
		}
	}
}

func TestTrashListAndDeleteResponsesDoNotExposeStorageInternals(t *testing.T) {
	ownerID, itemID := uuid.New(), uuid.New()
	now := time.Now().UTC()
	service := fakeTrashService{
		list: func(_ context.Context, owner uuid.UUID, cursor string, limit int) (trashdomain.Page, error) {
			if owner != ownerID || cursor != "cursor" || limit != 5 {
				t.Fatalf("unexpected list input: %s %q %d", owner, cursor, limit)
			}
			return trashdomain.Page{Items: []cloud.Item{{ID: itemID, Type: cloud.ItemTypeFile, Status: cloud.ItemStatusTrashed, SizeBytes: 42, DeletedAt: &now, PurgeAfter: timePointerForTest(now.Add(24 * time.Hour))}}, NextCursor: "next"}, nil
		},
		delete: func(_ context.Context, owner, item uuid.UUID, key string) (trashdomain.Result, error) {
			if owner != ownerID || item != itemID || key != "delete-1" {
				t.Fatal("delete input was not preserved")
			}
			return trashdomain.Result{ItemID: itemID, StorageDeletion: true}, nil
		},
	}
	handler := newTrashHandler(t, service)

	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, requestWithUser(http.MethodGet, "/trash?cursor=cursor&limit=5", "", ownerID))
	if listResponse.Code != http.StatusOK || strings.Contains(listResponse.Body.String(), "bucket") || strings.Contains(listResponse.Body.String(), "objectKey") {
		t.Fatalf("list status=%d body=%s", listResponse.Code, listResponse.Body.String())
	}

	deleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, lifecycleRequestFor(http.MethodDelete, "/items/"+itemID.String(), ownerID, "delete-1"))
	if deleteResponse.Code != http.StatusAccepted {
		t.Fatalf("delete status=%d body=%s", deleteResponse.Code, deleteResponse.Body.String())
	}
	var payload permanentDeleteResponse
	if err := json.NewDecoder(deleteResponse.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Status != "delete_pending" || !payload.Async {
		t.Fatalf("delete payload=%+v", payload)
	}
}

func TestTrashMissingAndCrossOwnerHaveIdenticalNotFoundResponse(t *testing.T) {
	service := fakeTrashService{restore: func(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error) {
		return trashdomain.Result{}, trashdomain.ErrNotFound
	}}
	handler := newTrashHandler(t, service)
	var bodies []string
	for _, owner := range []uuid.UUID{uuid.New(), uuid.New()} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, lifecycleRequestFor(http.MethodPost, "/items/"+uuid.NewString()+"/restore", owner, "restore-1"))
		if response.Code != http.StatusNotFound {
			t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
		}
		bodies = append(bodies, response.Body.String())
	}
	if bodies[0] != bodies[1] {
		t.Fatalf("not-found responses differ: %q / %q", bodies[0], bodies[1])
	}
}

func TestTrashErrorCatalog(t *testing.T) {
	tests := []struct {
		err    error
		status int
		code   string
	}{
		{trashdomain.ErrInvalidInput, 400, "INVALID_TRASH_REQUEST"},
		{trashdomain.ErrInvalidState, 409, "INVALID_ITEM_STATE"},
		{trashdomain.ErrRestoreExpired, 409, "RESTORE_EXPIRED"},
		{trashdomain.ErrDeletePending, 409, "DELETE_PENDING"},
		{trashdomain.ErrIdempotencyConflict, 409, "IDEMPOTENCY_CONFLICT"},
	}
	for _, test := range tests {
		t.Run(test.code, func(t *testing.T) {
			handler := newTrashHandler(t, fakeTrashService{move: func(context.Context, uuid.UUID, uuid.UUID, string) (trashdomain.Result, error) {
				return trashdomain.Result{}, test.err
			}})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, lifecycleRequestFor(http.MethodPost, "/items/"+uuid.NewString()+"/trash", uuid.New(), "key"))
			if response.Code != test.status {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
			assertErrorCode(t, response, test.code)
		})
	}
}

func TestTrashActionsRejectBodyAndUnsupportedMethod(t *testing.T) {
	handler := newTrashHandler(t, fakeTrashService{})
	request := lifecycleRequestFor(http.MethodPost, "/items/"+uuid.NewString()+"/trash", uuid.New(), "key")
	request.Body = io.NopCloser(strings.NewReader(`{}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("body status=%d", response.Code)
	}
	assertErrorCode(t, response, "INVALID_JSON")

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, lifecycleRequestFor(http.MethodGet, "/items/"+uuid.NewString()+"/trash", uuid.New(), "key"))
	if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("method status=%d allow=%q", response.Code, response.Header().Get("Allow"))
	}
}

func TestTrashListMapsInvalidCursor(t *testing.T) {
	handler := newTrashHandler(t, fakeTrashService{list: func(context.Context, uuid.UUID, string, int) (trashdomain.Page, error) {
		return trashdomain.Page{}, cloud.ErrInvalidCursor
	}})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, requestWithUser(http.MethodGet, "/trash?cursor=bad", "", uuid.New()))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d", response.Code)
	}
	assertErrorCode(t, response, "INVALID_CURSOR")
}

func timePointerForTest(value time.Time) *time.Time { return &value }
