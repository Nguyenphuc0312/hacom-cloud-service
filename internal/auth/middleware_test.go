package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestMiddlewareRejectsDemoModeOutsideLocal(t *testing.T) {
	if _, err := Middleware(MiddlewareConfig{Mode: ModeDemo, AppEnv: "production"}, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})); err == nil {
		t.Fatal("expected demo mode to be rejected outside local/test")
	}
}

func TestRateLimiterReturns429AfterLimit(t *testing.T) {
	limiter, err := NewRateLimiter(1, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := Middleware(MiddlewareConfig{Mode: ModeDemo, AppEnv: "local", RateLimiter: limiter}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("X-Demo-User-ID", "00000000-0000-0000-0000-000000000001")
	request.RemoteAddr = "192.0.2.10:1234"
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, request)
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, request)
	if first.Code != http.StatusNoContent || second.Code != http.StatusTooManyRequests {
		t.Fatalf("codes = %d/%d", first.Code, second.Code)
	}
}
