package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/repository"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func TestGate2ProductionWorkerAutoPurgesExpiredFileEndToEnd(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	minioEndpoint := os.Getenv("TEST_MINIO_ENDPOINT")
	if databaseURL == "" || minioEndpoint == "" {
		t.Skip("TEST_DATABASE_URL and TEST_MINIO_ENDPOINT are required")
	}
	useSSL, err := strconv.ParseBool(process4EnvOr("MINIO_USE_SSL", "false"))
	if err != nil {
		t.Fatal(err)
	}
	accessKey := process4EnvOr("MINIO_ACCESS_KEY", "minioadmin")
	secretKey := process4EnvOr("MINIO_SECRET_KEY", "minioadmin")
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
	client, err := minio.New(minioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		t.Fatal(err)
	}
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		t.Fatal(err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			t.Fatal(err)
		}
	}
	objects, err := storage.NewMinIOStore(client, bucket)
	if err != nil {
		t.Fatal(err)
	}

	ownerID := uuid.New()
	cleanupProcess4Owner(t, pool, ownerID)
	cloudRepository, err := repository.NewCloudPostgres(pool, 5_000_000_000)
	if err != nil {
		t.Fatal(err)
	}
	cloudService, err := cloud.NewService(cloudRepository, 100_000_000)
	if err != nil {
		t.Fatal(err)
	}
	quota, err := cloudService.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}

	content := []byte("gate2-production-worker-permanent-delete")
	itemID, objectID := uuid.New(), uuid.New()
	objectKey := "gate2/production-worker/" + objectID.String()
	if err := objects.Put(
		ctx, objectKey, bytes.NewReader(content), int64(len(content)), "application/octet-stream",
	); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = objects.Delete(context.Background(), objectKey) })
	if _, err := pool.Exec(ctx, `
		INSERT INTO cloud.storage_objects (
			id, drive_id, bucket, object_key, original_name, content_type,
			declared_size_bytes, actual_size_bytes, status, uploaded_at, verified_at
		) VALUES ($1, $2, $3, $4, 'gate2-worker.bin', 'application/octet-stream',
		          $5, $5, 'ready', NOW(), NOW())
	`, objectID, quota.DriveID, bucket, objectKey, int64(len(content))); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO cloud.items (
			id, drive_id, item_type, status, title, storage_object_id,
			size_bytes, billable_bytes, source_type
		) VALUES ($1, $2, 'file', 'ready', 'gate2-worker.bin', $3, $4, $4, 'cloud_upload')
	`, itemID, quota.DriveID, objectID, int64(len(content))); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		UPDATE cloud.quotas SET used_bytes = used_bytes + $1 WHERE drive_id = $2
	`, int64(len(content)), quota.DriveID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO cloud.usage_ledger (
			drive_id, item_id, event_type, delta_used_bytes, idempotency_key
		) VALUES ($1, $2, 'consume', $3, $4)
	`, quota.DriveID, itemID, int64(len(content)),
		"gate2-production-seed:"+itemID.String()); err != nil {
		t.Fatal(err)
	}
	trashRepository, err := repository.NewTrashPostgres(pool)
	if err != nil {
		t.Fatal(err)
	}
	expiredAt := time.Now().UTC().Add(-25 * time.Hour)
	trashService, err := trashdomain.NewService(trashRepository, func() time.Time { return expiredAt })
	if err != nil {
		t.Fatal(err)
	}
	if _, err := trashService.MoveToTrash(ctx, ownerID, itemID, "gate2-production-move"); err != nil {
		t.Fatal(err)
	}

	workerConfig := config.Config{
		DatabaseURL:               databaseURL,
		MinIOEndpoint:             minioEndpoint,
		MinIOAccessKey:            accessKey,
		MinIOSecretKey:            secretKey,
		MinIOUseSSL:               useSSL,
		MinIOBucket:               bucket,
		WorkerID:                  "gate2-production-" + uuid.NewString(),
		WorkerPollInterval:        10 * time.Millisecond,
		WorkerJobTimeout:          5 * time.Second,
		WorkerLockTimeout:         10 * time.Second,
		WorkerMaxAttempts:         3,
		WorkerBaseBackoff:         10 * time.Millisecond,
		WorkerMaxBackoff:          100 * time.Millisecond,
		WorkerCleanupScanInterval: time.Minute,
		WorkerCleanupBatchSize:    10,
		TrashRetention:            24 * time.Hour,
		WorkerTrashScanInterval:   10 * time.Millisecond,
		WorkerTrashBatchSize:      10,
	}
	runner, closeDependencies, err := newProductionLifecycleWorker(
		ctx, workerConfig, slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(closeDependencies)
	runCtx, cancelRun := context.WithCancel(context.Background())
	runErrors := make(chan error, 1)
	go func() { runErrors <- runner.Run(runCtx) }()
	var stopOnce sync.Once
	stopWorker := func() {
		stopOnce.Do(func() {
			cancelRun()
			select {
			case runErr := <-runErrors:
				if runErr != nil {
					t.Errorf("run Gate 2 production Worker: %v", runErr)
				}
			case <-time.After(5 * time.Second):
				t.Error("Gate 2 production Worker did not stop")
			}
		})
	}
	t.Cleanup(stopWorker)

	waitForProcess4(t, 10*time.Second, func() (bool, error) {
		var (
			itemCount, auditCount                  int
			jobStatus, objectStatus                string
			used, trashBytes, reserved             int64
			ledgerUsed, ledgerTrash, ledgerReserve int64
		)
		err := pool.QueryRow(ctx, `
			SELECT
				(SELECT COUNT(*) FROM cloud.items WHERE id = $1),
				job.status::TEXT, object.status::TEXT,
				quota.used_bytes, quota.trash_bytes, quota.reserved_bytes,
				COALESCE(SUM(ledger.delta_used_bytes), 0),
				COALESCE(SUM(ledger.delta_trash_bytes), 0),
				COALESCE(SUM(ledger.delta_reserved_bytes), 0),
				(SELECT COUNT(*) FROM cloud.audit_logs
				 WHERE request_id = job.id::TEXT
				   AND action = 'cloud.object.permanent_delete.completed')
			FROM cloud.jobs AS job
			JOIN cloud.storage_objects AS object ON object.id = job.storage_object_id
			JOIN cloud.quotas AS quota ON quota.drive_id = job.drive_id
			LEFT JOIN cloud.usage_ledger AS ledger ON ledger.drive_id = job.drive_id
			WHERE job.storage_object_id = $2 AND job.job_type = 'permanent_delete'
			GROUP BY job.id, object.id, quota.drive_id
		`, itemID, objectID).Scan(
			&itemCount, &jobStatus, &objectStatus,
			&used, &trashBytes, &reserved,
			&ledgerUsed, &ledgerTrash, &ledgerReserve, &auditCount,
		)
		return itemCount == 0 && jobStatus == "completed" && objectStatus == "deleted" &&
			used == 0 && trashBytes == 0 && reserved == 0 &&
			ledgerUsed == 0 && ledgerTrash == 0 && ledgerReserve == 0 && auditCount == 1, err
	})
	if _, err := objects.StatObject(ctx, objectKey); !errors.Is(err, storage.ErrObjectNotFound) {
		t.Fatalf("permanent object still exists: %v", err)
	}
	stopWorker()
}
