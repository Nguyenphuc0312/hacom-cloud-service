package health

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeChecker struct {
	name string
	err  error
}

func (c fakeChecker) Name() string {
	return c.name
}

func (c fakeChecker) Check(context.Context) error {
	return c.err
}

func TestReadinessReturnsOKWhenDependenciesAreUp(t *testing.T) {
	handler := NewHandler(NewService(
		time.Second,
		fakeChecker{name: "postgres"},
		fakeChecker{name: "minio"},
	))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	handler.Readiness(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var payload Response
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != StatusUp {
		t.Fatalf("payload status = %q, want %q", payload.Status, StatusUp)
	}
	if payload.Checks["postgres"].Status != StatusUp {
		t.Fatalf("postgres status = %q, want %q", payload.Checks["postgres"].Status, StatusUp)
	}
	if payload.Checks["minio"].Status != StatusUp {
		t.Fatalf("minio status = %q, want %q", payload.Checks["minio"].Status, StatusUp)
	}
}

func TestReadinessReturnsUnavailableWhenDependencyIsDown(t *testing.T) {
	handler := NewHandler(NewService(
		time.Second,
		fakeChecker{name: "postgres"},
		fakeChecker{name: "minio", err: errors.New("connection refused")},
	))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	handler.Readiness(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf(
			"status = %d, want %d",
			response.Code,
			http.StatusServiceUnavailable,
		)
	}

	var payload Response
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != StatusDown {
		t.Fatalf("payload status = %q, want %q", payload.Status, StatusDown)
	}
	if payload.Checks["minio"].Error != "unavailable" {
		t.Fatalf("health response leaked or omitted safe dependency error")
	}
}

func TestLivenessDoesNotCheckDependencies(t *testing.T) {
	handler := NewHandler(NewService(
		time.Second,
		fakeChecker{name: "postgres", err: errors.New("down")},
	))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	handler.Liveness(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
}

func TestReadinessRejectsUnsupportedMethod(t *testing.T) {
	handler := NewHandler(NewService(time.Second))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/health", nil)
	handler.Readiness(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf(
			"status = %d, want %d",
			response.Code,
			http.StatusMethodNotAllowed,
		)
	}
}
