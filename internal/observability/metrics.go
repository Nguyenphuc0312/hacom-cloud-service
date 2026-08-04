package observability

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

var latencyBuckets = [...]float64{0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2}

type Metrics struct {
	mu        sync.Mutex
	search    map[string]map[string][]uint64
	searchSum map[string]map[string]float64
	quota     map[string]map[string]uint64
	review    map[string]map[string]uint64
}

func NewMetrics() *Metrics {
	return &Metrics{search: map[string]map[string][]uint64{}, searchSum: map[string]map[string]float64{}, quota: map[string]map[string]uint64{}, review: map[string]map[string]uint64{}}
}

func bounded(value string, allowed ...string) string {
	for _, item := range allowed {
		if value == item {
			return value
		}
	}
	return "unknown"
}

func (m *Metrics) RecordSearch(surface, outcome string, duration time.Duration) {
	if m == nil {
		return
	}
	surface = bounded(surface, "active", "trash")
	outcome = bounded(outcome, "success", "error")
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.search[surface] == nil {
		m.search[surface] = map[string][]uint64{}
	}
	if m.searchSum[surface] == nil {
		m.searchSum[surface] = map[string]float64{}
	}
	if m.search[surface][outcome] == nil {
		m.search[surface][outcome] = make([]uint64, len(latencyBuckets)+1)
	}
	seconds := duration.Seconds()
	for i, bound := range latencyBuckets {
		if seconds <= bound {
			m.search[surface][outcome][i]++
		}
	}
	m.search[surface][outcome][len(latencyBuckets)]++
	m.searchSum[surface][outcome] += seconds
}

func (m *Metrics) RecordQuotaRequest(action, outcome string) {
	if m == nil {
		return
	}
	action = bounded(action, "create", "current", "cancel")
	outcome = bounded(outcome, "applied", "idempotent", "rejected", "error")
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.quota[action] == nil {
		m.quota[action] = map[string]uint64{}
	}
	m.quota[action][outcome]++
}

func (m *Metrics) RecordAdminReview(decision, outcome string) {
	if m == nil {
		return
	}
	decision = bounded(decision, "approve", "reject")
	outcome = bounded(outcome, "applied", "idempotent", "rejected", "error")
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.review[decision] == nil {
		m.review[decision] = map[string]uint64{}
	}
	m.review[decision][outcome]++
}

func (m *Metrics) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, http.StatusText(405), 405)
			return
		}
		m.mu.Lock()
		defer m.mu.Unlock()
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		fmt.Fprintln(w, "# TYPE hacom_cloud_search_latency_seconds histogram")
		for _, surface := range []string{"active", "trash"} {
			for _, outcome := range []string{"success", "error"} {
				values := m.search[surface][outcome]
				for i, bound := range latencyBuckets {
					var value uint64
					if len(values) > 0 {
						value = values[i]
					}
					fmt.Fprintf(w, "hacom_cloud_search_latency_seconds_bucket{surface=%q,outcome=%q,le=%q} %d\n", surface, outcome, fmt.Sprint(bound), value)
				}
				var count uint64
				if len(values) > 0 {
					count = values[len(latencyBuckets)]
				}
				fmt.Fprintf(w, "hacom_cloud_search_latency_seconds_bucket{surface=%q,outcome=%q,le=\"+Inf\"} %d\n", surface, outcome, count)
				fmt.Fprintf(w, "hacom_cloud_search_latency_seconds_count{surface=%q,outcome=%q} %d\n", surface, outcome, count)
				fmt.Fprintf(w, "hacom_cloud_search_latency_seconds_sum{surface=%q,outcome=%q} %g\n", surface, outcome, m.searchSum[surface][outcome])
			}
		}
		fmt.Fprintln(w, "# TYPE hacom_cloud_quota_request_total counter")
		for _, action := range []string{"create", "current", "cancel"} {
			for _, outcome := range []string{"applied", "idempotent", "rejected", "error"} {
				fmt.Fprintf(w, "hacom_cloud_quota_request_total{action=%q,outcome=%q} %d\n", action, outcome, m.quota[action][outcome])
			}
		}
		fmt.Fprintln(w, "# TYPE hacom_cloud_admin_review_total counter")
		for _, decision := range []string{"approve", "reject"} {
			for _, outcome := range []string{"applied", "idempotent", "rejected", "error"} {
				fmt.Fprintf(w, "hacom_cloud_admin_review_total{decision=%q,outcome=%q} %d\n", decision, outcome, m.review[decision][outcome])
			}
		}
	})
}
