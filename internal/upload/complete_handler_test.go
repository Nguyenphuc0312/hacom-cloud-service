package upload

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type completeUseCaseFunc func(context.Context, CompleteRequest) (CompleteResult, error)

func (function completeUseCaseFunc) Complete(
	ctx context.Context,
	request CompleteRequest,
) (CompleteResult, error) {
	return function(ctx, request)
}

func TestCompleteHandlerPassesAuthenticatedOwnerAndSession(t *testing.T) {
	var received CompleteRequest
	handler, err := NewCompleteHandler(
		completeUseCaseFunc(func(_ context.Context, request CompleteRequest) (CompleteResult, error) {
			received = request
			return CompleteResult{}, nil
		}),
		func(*http.Request) (string, error) { return "owner-1", nil },
	)
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/v1/cloud/uploads/complete", strings.NewReader(
		`{"session_id":"session-1"}`,
	))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", response.Code, response.Body.String())
	}
	if received.OwnerID != "owner-1" || received.SessionID != "session-1" {
		t.Fatalf("complete request = %+v", received)
	}
}

func TestCompleteHandlerMapsOwnershipFailure(t *testing.T) {
	handler, err := NewCompleteHandler(
		completeUseCaseFunc(func(context.Context, CompleteRequest) (CompleteResult, error) {
			return CompleteResult{}, ErrSessionForbidden
		}),
		func(*http.Request) (string, error) { return "owner-2", nil },
	)
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"session_id":"session-1"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403; body=%s", response.Code, response.Body.String())
	}
}

func TestCompleteHandlerRequiresAuthentication(t *testing.T) {
	handler, err := NewCompleteHandler(
		completeUseCaseFunc(func(context.Context, CompleteRequest) (CompleteResult, error) {
			t.Fatal("service must not be called")
			return CompleteResult{}, nil
		}),
		func(*http.Request) (string, error) { return "", errors.New("missing user") },
	)
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"session_id":"session-1"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.Code)
	}
}
