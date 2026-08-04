package observability

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMetricsUseOnlyBoundedLabels(t *testing.T) {
	m := NewMetrics()
	m.RecordSearch("user-id", "boom", 20*time.Millisecond)
	m.RecordQuotaRequest("item-id", "boom")
	m.RecordAdminReview("actor-id", "boom")
	w := httptest.NewRecorder()
	m.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := w.Body.String()
	if strings.Contains(body, "user-id") || strings.Contains(body, "item-id") || strings.Contains(body, "actor-id") {
		t.Fatal("unbounded label leaked")
	}
}
