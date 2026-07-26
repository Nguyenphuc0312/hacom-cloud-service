package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/health"
)

func TestHomePage(t *testing.T) {
	handler := New(health.NewService(0))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
	if !strings.Contains(response.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("expected HTML content type, got %q", response.Header().Get("Content-Type"))
	}
	if !strings.Contains(response.Body.String(), "Hacom Cloud API") {
		t.Fatal("expected home page content")
	}
}

func TestUnknownRoute(t *testing.T) {
	handler := New(health.NewService(0))
	request := httptest.NewRequest(http.MethodGet, "/unknown", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", response.Code)
	}
}

func TestHomeRejectsPost(t *testing.T) {
	handler := New(health.NewService(0))
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status 405, got %d", response.Code)
	}
}
