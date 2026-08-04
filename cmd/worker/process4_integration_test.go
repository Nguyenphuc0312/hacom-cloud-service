package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/repository"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/upload"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func TestProcess4ProductionWorkerHashAndCleanupLifecycle(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	minioEndpoint := os.Getenv("TEST_MINIO_ENDPOINT")
	if databaseURL == "" || minioEndpoint == "" {
		t.Skip("TEST_DATABASE_URL and TEST_MINIO_ENDPOINT are required")
	}
	useSSL, err := strconv.ParseBool(process4EnvOr("MINIO_USE_SSL", "false"))
	if err != nil {
		t.Fatalf("parse MINIO_USE_SSL: %v", err)
	}
	minioAccessKey := process4EnvOr("MINIO_ACCESS_KEY", "minioadmin")
	minioSecretKey := process4EnvOr("MINIO_SECRET_KEY", "minioadmin")
	bucket := process4EnvOr("MINIO_BUCKET", "hacom-cloud-private")

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	minioClient, err := minio.New(minioEndpoint, &minio.Options{
		Creds: credentials.NewStaticV4(
			minioAccessKey,
			minioSecretKey,
			"",
		),
		Secure: useSSL,
	})
	if err != nil {
		t.Fatal(err)
	}
	exists, err := minioClient.BucketExists(ctx, bucket)
	if err != nil {
		t.Fatal(err)
	}
	if !exists {
		if err := minioClient.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			t.Fatal(err)
		}
	}
	objects, err := storage.NewMinIOStore(minioClient, bucket)
	if err != nil {
		t.Fatal(err)
	}
	cloudRepository, err := repository.NewCloudPostgres(
		pool,
		5_000_000_000,
		repository.WithStorageBucket(bucket),
	)
	if err != nil {
		t.Fatal(err)
	}
	uploadService, err := upload.NewService(
		cloudRepository,
		objects,
		100_000_000,
		15*time.Minute,
	)
	if err != nil {
		t.Fatal(err)
	}

	ownerID := uuid.New()
	cleanupProcess4Owner(t, pool, ownerID)
	payload := []byte("Hacom Cloud Process 4 production worker")
	initiated, err := uploadService.Initiate(ctx, upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "process-4.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  int64(len(payload)),
		IdempotencyKey: "process4-hash-" + uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = objects.Delete(context.Background(), initiated.Session.ObjectKey)
	})
	if err := objects.Put(
		ctx,
		initiated.Session.ObjectKey,
		bytes.NewReader(payload),
		int64(len(payload)),
		"text/plain",
	); err != nil {
		t.Fatal(err)
	}
	completed, err := uploadService.Complete(ctx, upload.CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   initiated.Session.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	quotaBeforeHash, err := cloudRepository.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}

	workerConfig := config.Config{
		DatabaseURL:               databaseURL,
		MinIOEndpoint:             minioEndpoint,
		MinIOAccessKey:            minioAccessKey,
		MinIOSecretKey:            minioSecretKey,
		MinIOUseSSL:               useSSL,
		MinIOBucket:               bucket,
		WorkerID:                  "process4-integration-" + uuid.NewString(),
		WorkerPollInterval:        10 * time.Millisecond,
		WorkerJobTimeout:          5 * time.Second,
		WorkerLockTimeout:         10 * time.Second,
		WorkerMaxAttempts:         3,
		WorkerBaseBackoff:         10 * time.Millisecond,
		WorkerMaxBackoff:          100 * time.Millisecond,
		WorkerCleanupScanInterval: 10 * time.Millisecond,
		WorkerCleanupBatchSize:    10,
		TrashRetention:            24 * time.Hour,
		WorkerTrashScanInterval:   10 * time.Millisecond,
		WorkerTrashBatchSize:      10,
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	runner, closeDependencies, err := newProductionLifecycleWorker(
		ctx,
		workerConfig,
		logger,
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(closeDependencies)
	runCtx, cancelRun := context.WithCancel(context.Background())
	runErrors := make(chan error, 1)
	go func() {
		runErrors <- runner.Run(runCtx)
	}()
	var stopOnce sync.Once
	stopWorker := func() {
		stopOnce.Do(func() {
			cancelRun()
			select {
			case runErr := <-runErrors:
				if runErr != nil {
					t.Errorf("run production Worker: %v", runErr)
				}
			case <-time.After(5 * time.Second):
				t.Error("production Worker did not stop within timeout")
			}
		})
	}
	t.Cleanup(stopWorker)

	var itemStatus, objectStatus, jobStatus, checksum string
	waitForProcess4(t, 10*time.Second, func() (bool, error) {
		err := pool.QueryRow(ctx, `
			SELECT
				item.status::text,
				object.status::text,
				job.status::text,
				COALESCE(object.checksum_sha256::text, '')
			FROM cloud.items AS item
			JOIN cloud.storage_objects AS object
			  ON object.id = item.storage_object_id
			JOIN cloud.jobs AS job
			  ON job.item_id = item.id
			 AND job.job_type = 'hash_file'
			WHERE item.id = $1
		`, completed.Item.ID).Scan(
			&itemStatus,
			&objectStatus,
			&jobStatus,
			&checksum,
		)
		return itemStatus == "ready" &&
			objectStatus == "ready" &&
			jobStatus == "completed", err
	})
	expectedChecksum := sha256.Sum256(payload)
	if checksum != hex.EncodeToString(expectedChecksum[:]) {
		t.Fatalf("stored checksum = %q, want %x", checksum, expectedChecksum)
	}
	quotaAfterHash, err := cloudRepository.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quotaAfterHash.UsedBytes != quotaBeforeHash.UsedBytes ||
		quotaAfterHash.ReservedBytes != quotaBeforeHash.ReservedBytes {
		t.Fatalf(
			"hash changed quota: before=%+v after=%+v",
			quotaBeforeHash,
			quotaAfterHash,
		)
	}

	expiredUpload, err := uploadService.Initiate(ctx, upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "expire-me.bin",
		ContentType:    "application/octet-stream",
		DeclaredBytes:  2048,
		IdempotencyKey: "process4-cleanup-" + uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		UPDATE cloud.upload_sessions
		SET created_at = NOW() - INTERVAL '2 minutes',
		    expires_at = NOW() - INTERVAL '1 minute'
		WHERE id = $1
	`, expiredUpload.Session.ID)
	if err != nil {
		t.Fatal(err)
	}

	var (
		sessionStatus string
		cleanupStatus string
		releaseCount  int
	)
	waitForProcess4(t, 10*time.Second, func() (bool, error) {
		err := pool.QueryRow(ctx, `
			SELECT
				session.status::text,
				COALESCE(job.status::text, ''),
				(
					SELECT COUNT(*)
					FROM cloud.usage_ledger AS ledger
					WHERE ledger.drive_id = session.drive_id
					  AND ledger.idempotency_key =
					      'release:expired-upload:' || session.id::text
				)
			FROM cloud.upload_sessions AS session
			LEFT JOIN cloud.jobs AS job
			  ON job.upload_session_id = session.id
			 AND job.job_type = 'cleanup_expired_upload'
			WHERE session.id = $1
			ORDER BY job.created_at DESC
			LIMIT 1
		`, expiredUpload.Session.ID).Scan(
			&sessionStatus,
			&cleanupStatus,
			&releaseCount,
		)
		return sessionStatus == "expired" &&
			cleanupStatus == "completed" &&
			releaseCount == 1, err
	})
	quotaAfterCleanup, err := cloudRepository.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quotaAfterCleanup.UsedBytes != int64(len(payload)) ||
		quotaAfterCleanup.ReservedBytes != 0 {
		t.Fatalf("quota after cleanup = %+v", quotaAfterCleanup)
	}
	stopWorker()
}

func waitForProcess4(
	t *testing.T,
	timeout time.Duration,
	check func() (bool, error),
) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		ready, err := check()
		if ready && err == nil {
			return
		}
		lastErr = err
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("Process 4 condition did not converge within %s: %v", timeout, lastErr)
}

func cleanupProcess4Owner(
	t *testing.T,
	pool *pgxpool.Pool,
	ownerID uuid.UUID,
) {
	t.Helper()
	t.Cleanup(func() {
		ctx := context.Background()
		queries := []string{
			`DELETE FROM cloud.item_lifecycle_operations WHERE drive_id IN (
				SELECT id FROM cloud.drives WHERE owner_user_id = $1
			)`,
			`DELETE FROM cloud.jobs WHERE drive_id IN (
				SELECT id FROM cloud.drives WHERE owner_user_id = $1
			)`,
			`DELETE FROM cloud.usage_ledger WHERE drive_id IN (
				SELECT id FROM cloud.drives WHERE owner_user_id = $1
			)`,
			`DELETE FROM cloud.upload_sessions WHERE drive_id IN (
				SELECT id FROM cloud.drives WHERE owner_user_id = $1
			)`,
			`DELETE FROM cloud.items WHERE drive_id IN (
				SELECT id FROM cloud.drives WHERE owner_user_id = $1
			)`,
			`DELETE FROM cloud.storage_objects WHERE drive_id IN (
				SELECT id FROM cloud.drives WHERE owner_user_id = $1
			)`,
		}
		for _, query := range queries {
			if _, err := pool.Exec(ctx, query, ownerID); err != nil {
				t.Errorf("cleanup Process 4 owner %s: %v", ownerID, err)
				return
			}
		}
	})
}

func process4EnvOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
