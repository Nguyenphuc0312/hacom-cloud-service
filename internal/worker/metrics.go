package worker

import (
	"fmt"
	"net/http"
	"sync/atomic"
)

type Metrics struct {
	purgeScanned       atomic.Uint64
	purgeCompleted     atomic.Uint64
	purgeMissingObject atomic.Uint64
	purgeFailed        atomic.Uint64
	deadJobs           atomic.Uint64
}

type MetricsSnapshot struct {
	PurgeScanned       uint64
	PurgeCompleted     uint64
	PurgeMissingObject uint64
	PurgeFailed        uint64
	DeadJobs           uint64
}

func NewMetrics() *Metrics { return &Metrics{} }

func (m *Metrics) RecordPurgeScanned(count int) {
	if m != nil && count > 0 {
		m.purgeScanned.Add(uint64(count))
	}
}

func (m *Metrics) RecordPurgeCompleted(missingObject bool) {
	if m == nil {
		return
	}
	m.purgeCompleted.Add(1)
	if missingObject {
		m.purgeMissingObject.Add(1)
	}
}

func (m *Metrics) RecordPurgeFailed() {
	if m != nil {
		m.purgeFailed.Add(1)
	}
}

func (m *Metrics) RecordDeadJobs(count int64) {
	if m != nil && count > 0 {
		m.deadJobs.Add(uint64(count))
	}
}

func (m *Metrics) Snapshot() MetricsSnapshot {
	if m == nil {
		return MetricsSnapshot{}
	}
	return MetricsSnapshot{
		PurgeScanned:       m.purgeScanned.Load(),
		PurgeCompleted:     m.purgeCompleted.Load(),
		PurgeMissingObject: m.purgeMissingObject.Load(),
		PurgeFailed:        m.purgeFailed.Load(),
		DeadJobs:           m.deadJobs.Load(),
	}
}

func (m *Metrics) Handler() http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writer.Header().Set("Allow", http.MethodGet)
			http.Error(writer, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}
		snapshot := m.Snapshot()
		writer.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = fmt.Fprintf(writer, `# TYPE hacom_cloud_trash_purge_scanned_total counter
hacom_cloud_trash_purge_scanned_total %d
# TYPE hacom_cloud_trash_purge_completed_total counter
hacom_cloud_trash_purge_completed_total %d
# TYPE hacom_cloud_trash_purge_missing_object_total counter
hacom_cloud_trash_purge_missing_object_total %d
# TYPE hacom_cloud_trash_purge_failed_total counter
hacom_cloud_trash_purge_failed_total %d
# TYPE hacom_cloud_worker_dead_jobs_total counter
hacom_cloud_worker_dead_jobs_total %d
`, snapshot.PurgeScanned, snapshot.PurgeCompleted, snapshot.PurgeMissingObject, snapshot.PurgeFailed, snapshot.DeadJobs)
	})
}
