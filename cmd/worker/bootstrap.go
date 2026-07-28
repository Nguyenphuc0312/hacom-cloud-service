package main

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

type lifecycleHandlers struct {
	HashFile       worker.JobHandler
	CleanupExpired worker.JobHandler
	CleanupScanner worker.CleanupScanner
}

func retryPolicyFromConfig(cfg config.Config) worker.RetryPolicy {
	return worker.RetryPolicy{
		MaxAttempts: cfg.WorkerMaxAttempts,
		BaseBackoff: cfg.WorkerBaseBackoff,
		MaxBackoff:  cfg.WorkerMaxBackoff,
		LockTimeout: cfg.WorkerLockTimeout,
	}
}

// newLifecycleWorker is the integration seam for the implementations owned by
// Process 4 people 1-3. Production bootstrap only needs to construct those
// dependencies and pass them here; queue or lifecycle logic must not be copied
// into cmd/worker.
func newLifecycleWorker(
	cfg config.Config,
	logger *slog.Logger,
	jobs worker.JobRepository,
	handlers lifecycleHandlers,
) (*worker.Worker, error) {
	if jobs == nil {
		return nil, errors.New("PostgreSQL job repository is required")
	}
	if handlers.HashFile == nil {
		return nil, errors.New("hash_file handler is required")
	}
	if handlers.CleanupExpired == nil {
		return nil, errors.New("cleanup_expired_upload handler is required")
	}
	if handlers.CleanupScanner == nil {
		return nil, errors.New("expired upload scanner is required")
	}

	runner, err := worker.New(
		jobs,
		worker.WithLogger(logger),
		worker.WithPollInterval(cfg.WorkerPollInterval),
		worker.WithJobTimeout(cfg.WorkerJobTimeout),
		worker.WithCleanupScanner(
			handlers.CleanupScanner,
			cfg.WorkerCleanupScanInterval,
			cfg.WorkerCleanupBatchSize,
		),
	)
	if err != nil {
		return nil, fmt.Errorf("create worker: %w", err)
	}
	if err := runner.Register(worker.JobHashFile, handlers.HashFile); err != nil {
		return nil, fmt.Errorf("register hash_file handler: %w", err)
	}
	if err := runner.Register(worker.JobCleanupExpired, handlers.CleanupExpired); err != nil {
		return nil, fmt.Errorf("register cleanup_expired_upload handler: %w", err)
	}
	return runner, nil
}
