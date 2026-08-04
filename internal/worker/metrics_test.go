package worker

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMetricsHandlerExportsPurgeAndDeadJobCounters(t *testing.T) {
	metrics := NewMetrics()
	metrics.RecordPurgeScanned(2)
	metrics.RecordPurgeCompleted(false)
	metrics.RecordPurgeCompleted(true)
	metrics.RecordPurgeFailed()
	metrics.RecordDeadJobs(3)

	response := httptest.NewRecorder()
	metrics.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d", response.Code)
	}
	for _, value := range []string{
		"hacom_cloud_trash_purge_scanned_total 2",
		"hacom_cloud_trash_purge_completed_total 2",
		"hacom_cloud_trash_purge_missing_object_total 1",
		"hacom_cloud_trash_purge_failed_total 1",
		"hacom_cloud_worker_dead_jobs_total 3",
	} {
		if !strings.Contains(response.Body.String(), value) {
			t.Fatalf("metrics body missing %q: %s", value, response.Body.String())
		}
	}
}

func TestMetricsHandlerRejectsMutationMethods(t *testing.T) {
	response := httptest.NewRecorder()
	NewMetrics().Handler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/metrics", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status=%d", response.Code)
	}
}
