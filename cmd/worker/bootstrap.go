package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/filehash"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/repository"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
	workerhandlers "github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker/handlers"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
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

func newProductionLifecycleWorker(
	ctx context.Context,
	cfg config.Config,
	logger *slog.Logger,
) (*worker.Worker, func(), error) {
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("connect PostgreSQL: %w", err)
	}
	closeDependencies := func() {
		pool.Close()
	}
	fail := func(cause error) (*worker.Worker, func(), error) {
		closeDependencies()
		return nil, nil, cause
	}
	if err := pool.Ping(ctx); err != nil {
		return fail(fmt.Errorf("ping PostgreSQL: %w", err))
	}

	minioClient, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds: credentials.NewStaticV4(
			cfg.MinIOAccessKey,
			cfg.MinIOSecretKey,
			"",
		),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		return fail(fmt.Errorf("create MinIO client: %w", err))
	}
	objects, err := storage.NewMinIOStore(minioClient, cfg.MinIOBucket)
	if err != nil {
		return fail(fmt.Errorf("create MinIO object store: %w", err))
	}
	jobs, err := repository.NewJobPostgres(
		pool,
		cfg.WorkerID,
		retryPolicyFromConfig(cfg),
	)
	if err != nil {
		return fail(fmt.Errorf("create PostgreSQL job repository: %w", err))
	}
	hashService, err := filehash.NewService(objects, logger)
	if err != nil {
		return fail(fmt.Errorf("create hash service: %w", err))
	}
	fileLifecycle, err := repository.NewFileLifecyclePostgres(pool)
	if err != nil {
		return fail(fmt.Errorf("create file lifecycle repository: %w", err))
	}
	uploadCleanup, err := repository.NewUploadCleanupPostgres(pool)
	if err != nil {
		return fail(fmt.Errorf("create upload cleanup repository: %w", err))
	}
	hashHandler, err := workerhandlers.NewHashFileHandler(
		hashService,
		fileLifecycle,
	)
	if err != nil {
		return fail(fmt.Errorf("create hash_file handler: %w", err))
	}
	cleanupHandler, err := workerhandlers.NewCleanupExpiredUploadHandler(
		uploadCleanup,
		objects,
	)
	if err != nil {
		return fail(fmt.Errorf("create cleanup_expired_upload handler: %w", err))
	}
	runner, err := newLifecycleWorker(
		cfg,
		logger,
		jobs,
		lifecycleHandlers{
			HashFile:       hashHandler,
			CleanupExpired: cleanupHandler,
			CleanupScanner: uploadCleanup,
		},
	)
	if err != nil {
		return fail(err)
	}
	return runner, closeDependencies, nil
}
