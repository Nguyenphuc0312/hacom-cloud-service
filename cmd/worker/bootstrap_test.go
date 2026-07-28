package main

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

type bootstrapRepository struct {
	mu        sync.Mutex
	jobs      []worker.Job
	completed []string
}

func (r *bootstrapRepository) Claim(context.Context) (worker.Job, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.jobs) == 0 {
		return worker.Job{}, worker.ErrNoJob
	}
	job := r.jobs[0]
	r.jobs = r.jobs[1:]
	return job, nil
}

func (r *bootstrapRepository) Complete(_ context.Context, jobID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.completed = append(r.completed, jobID)
	return nil
}

func (r *bootstrapRepository) Fail(context.Context, string, error) error {
	return nil
}

type bootstrapHandler struct {
	handled chan worker.JobType
}

func (h bootstrapHandler) Handle(_ context.Context, job worker.Job) error {
	h.handled <- job.Type
	return nil
}

type bootstrapScanner struct {
	scanned chan int
}

func (s bootstrapScanner) EnqueueExpiredUploadJobs(_ context.Context, limit int) (int, error) {
	s.scanned <- limit
	return 0, nil
}

func TestLifecycleBootstrapRegistersBothGate4Handlers(t *testing.T) {
	repository := &bootstrapRepository{jobs: []worker.Job{
		{ID: "hash-job", Type: worker.JobHashFile},
		{ID: "cleanup-job", Type: worker.JobCleanupExpired},
	}}
	handled := make(chan worker.JobType, 2)
	scanned := make(chan int, 1)
	runner, err := newLifecycleWorker(
		config.Config{
			WorkerPollInterval:        time.Millisecond,
			WorkerJobTimeout:          time.Second,
			WorkerCleanupScanInterval: time.Minute,
			WorkerCleanupBatchSize:    100,
		},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		repository,
		lifecycleHandlers{
			HashFile:       bootstrapHandler{handled: handled},
			CleanupExpired: bootstrapHandler{handled: handled},
			CleanupScanner: bootstrapScanner{scanned: scanned},
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runner.Run(ctx) }()

	seen := make(map[worker.JobType]bool)
	for len(seen) < 2 {
		select {
		case jobType := <-handled:
			seen[jobType] = true
		case <-time.After(time.Second):
			t.Fatalf("handled job types = %v", seen)
		}
	}
	select {
	case limit := <-scanned:
		if limit != 100 {
			t.Fatalf("cleanup scan limit = %d", limit)
		}
	case <-time.After(time.Second):
		t.Fatal("cleanup scanner was not called")
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	repository.mu.Lock()
	defer repository.mu.Unlock()
	if len(repository.completed) != 2 {
		t.Fatalf("completed jobs = %v", repository.completed)
	}
}

func TestLifecycleBootstrapRejectsMissingDependencies(t *testing.T) {
	cfg := config.Config{
		WorkerPollInterval:        time.Millisecond,
		WorkerJobTimeout:          time.Second,
		WorkerCleanupScanInterval: time.Minute,
		WorkerCleanupBatchSize:    100,
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := bootstrapHandler{handled: make(chan worker.JobType, 1)}
	repository := &bootstrapRepository{}
	scanner := bootstrapScanner{scanned: make(chan int, 1)}

	tests := []struct {
		name     string
		jobs     worker.JobRepository
		handlers lifecycleHandlers
	}{
		{
			name: "job repository",
			handlers: lifecycleHandlers{
				HashFile:       handler,
				CleanupExpired: handler,
				CleanupScanner: scanner,
			},
		},
		{
			name: "hash handler",
			jobs: repository,
			handlers: lifecycleHandlers{
				CleanupExpired: handler,
				CleanupScanner: scanner,
			},
		},
		{
			name: "cleanup handler",
			jobs: repository,
			handlers: lifecycleHandlers{
				HashFile:       handler,
				CleanupScanner: scanner,
			},
		},
		{
			name: "cleanup scanner",
			jobs: repository,
			handlers: lifecycleHandlers{
				HashFile:       handler,
				CleanupExpired: handler,
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := newLifecycleWorker(cfg, logger, test.jobs, test.handlers); err == nil {
				t.Fatal("newLifecycleWorker() error = nil")
			}
		})
	}
}

func TestRetryPolicyFromConfigPreservesContractValues(t *testing.T) {
	cfg := config.Config{
		WorkerMaxAttempts: 9,
		WorkerBaseBackoff: 250 * time.Millisecond,
		WorkerMaxBackoff:  45 * time.Second,
		WorkerLockTimeout: 7 * time.Minute,
	}
	policy := retryPolicyFromConfig(cfg)
	if policy.MaxAttempts != cfg.WorkerMaxAttempts {
		t.Fatalf("max attempts = %d", policy.MaxAttempts)
	}
	if policy.BaseBackoff != cfg.WorkerBaseBackoff {
		t.Fatalf("base backoff = %s", policy.BaseBackoff)
	}
	if policy.MaxBackoff != cfg.WorkerMaxBackoff {
		t.Fatalf("max backoff = %s", policy.MaxBackoff)
	}
	if policy.LockTimeout != cfg.WorkerLockTimeout {
		t.Fatalf("lock timeout = %s", policy.LockTimeout)
	}
}
