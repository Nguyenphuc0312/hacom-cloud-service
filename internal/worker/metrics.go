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
	jobsClaimed        atomic.Uint64
	jobsCompleted      atomic.Uint64
	jobsFailed         atomic.Uint64
	jobretries         atomic.Uint64
	staleRecovered     atomic.Uint64
}

type MetricsSnapshot struct {
	PurgeScanned       uint64
	PurgeCompleted     uint64
	PurgeMissingObject uint64
	PurgeFailed        uint64
	DeadJobs           uint64
	JobsClaimed        uint64
	JobsCompleted      uint64
	JobsFailed         uint64
	JobRetries         uint64
	StaleRecovered     uint64
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

func (m *Metrics) RecordJobClaimed(stale bool) {
	if m == nil {
		return
	}
	m.jobsClaimed.Add(1)
	if stale {
		m.staleRecovered.Add(1)
	}
}

func (m *Metrics) RecordJobCompleted() {
	if m != nil {
		m.jobsCompleted.Add(1)
	}
}

func (m *Metrics) RecordJobFailed(retry bool) {
	if m == nil {
		return
	}
	m.jobsFailed.Add(1)
	if retry {
		m.jobretries.Add(1)
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
		JobsClaimed:        m.jobsClaimed.Load(),
		JobsCompleted:      m.jobsCompleted.Load(),
		JobsFailed:         m.jobsFailed.Load(),
		JobRetries:         m.jobretries.Load(),
		StaleRecovered:     m.staleRecovered.Load(),
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
# TYPE hacom_cloud_worker_jobs_claimed_total counter
hacom_cloud_worker_jobs_claimed_total %d
# TYPE hacom_cloud_worker_jobs_completed_total counter
hacom_cloud_worker_jobs_completed_total %d
# TYPE hacom_cloud_worker_jobs_failed_total counter
hacom_cloud_worker_jobs_failed_total %d
# TYPE hacom_cloud_worker_job_retries_total counter
hacom_cloud_worker_job_retries_total %d
# TYPE hacom_cloud_worker_stale_recovered_total counter
hacom_cloud_worker_stale_recovered_total %d
`, snapshot.PurgeScanned, snapshot.PurgeCompleted, snapshot.PurgeMissingObject, snapshot.PurgeFailed, snapshot.DeadJobs,
			snapshot.JobsClaimed, snapshot.JobsCompleted, snapshot.JobsFailed, snapshot.JobRetries, snapshot.StaleRecovered)
	})
}
