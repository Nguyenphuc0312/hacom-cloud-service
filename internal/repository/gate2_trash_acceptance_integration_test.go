package repository

import (
	"bytes"
	"context"
	"errors"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/fileaccess"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
	workerhandlers "github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker/handlers"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type failOncePermanentFinalize struct {
	repository *PermanentDeletePostgres
	mu         sync.Mutex
	fail       bool
}

func (r *failOncePermanentFinalize) GetPermanentDeleteTarget(
	ctx context.Context,
	jobID uuid.UUID,
) (workerhandlers.PermanentDeleteTarget, error) {
	return r.repository.GetPermanentDeleteTarget(ctx, jobID)
}

func (r *failOncePermanentFinalize) FinalizePermanentDelete(
	ctx context.Context,
	jobID uuid.UUID,
	missing bool,
) (bool, error) {
	r.mu.Lock()
	if r.fail {
		r.fail = false
		r.mu.Unlock()
		return false, errors.New("injected crash after MinIO delete")
	}
	r.mu.Unlock()
	return r.repository.FinalizePermanentDelete(ctx, jobID, missing)
}

type blockingAccessStore struct {
	objects *storage.MinIOStore
	entered chan struct{}
	release chan struct{}
}

func (s *blockingAccessStore) StatObject(
	ctx context.Context,
	key string,
) (storage.ObjectInfo, error) {
	return s.objects.StatObject(ctx, key)
}

func (s *blockingAccessStore) PresignDownload(
	ctx context.Context,
	key string,
	ttl time.Duration,
) (string, error) {
	select {
	case s.entered <- struct{}{}:
	case <-ctx.Done():
		return "", ctx.Err()
	}
	select {
	case <-s.release:
	case <-ctx.Done():
		return "", ctx.Err()
	}
	return s.objects.PresignDownload(ctx, key, ttl)
}

func gate2ObjectStore(t *testing.T) *storage.MinIOStore {
	t.Helper()
	endpoint := os.Getenv("TEST_MINIO_ENDPOINT")
	if endpoint == "" {
		t.Skip("TEST_MINIO_ENDPOINT is not configured")
	}
	useSSL, err := strconv.ParseBool(environmentOrDefault("MINIO_USE_SSL", "false"))
	if err != nil {
		t.Fatal(err)
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds: credentials.NewStaticV4(
			environmentOrDefault("MINIO_ACCESS_KEY", "minioadmin"),
			environmentOrDefault("MINIO_SECRET_KEY", "minioadmin"),
			"",
		),
		Secure: useSSL,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	bucket := environmentOrDefault("MINIO_BUCKET", "hacom-cloud-private")
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
	return objects
}

func environmentOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func seedGate2File(
	t *testing.T,
	pool *pgxpool.Pool,
	objects *storage.MinIOStore,
	quota cloud.Quota,
	content []byte,
) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	itemID, objectID := uuid.New(), uuid.New()
	objectKey := "gate2/permanent-delete/" + objectID.String()
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
		) VALUES ($1, $2, 'hacom-cloud-private', $3, 'gate2.bin',
		          'application/octet-stream', $4, $4, 'ready', NOW(), NOW())
	`, objectID, quota.DriveID, objectKey, int64(len(content))); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO cloud.items (
			id, drive_id, item_type, status, title, storage_object_id,
			size_bytes, billable_bytes, source_type
		) VALUES ($1, $2, 'file', 'ready', 'gate2.bin', $3, $4, $4, 'cloud_upload')
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
	`, quota.DriveID, itemID, int64(len(content)), "gate2-seed:"+itemID.String()); err != nil {
		t.Fatal(err)
	}
	return itemID, objectID
}

func TestGate2AutoPurgeRecoversCrashAndReconcilesQuota(t *testing.T) {
	pool := integrationPool(t)
	objects := gate2ObjectStore(t)
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	ctx := context.Background()
	expiredClock := time.Now().UTC().Add(-25 * time.Hour)
	cloudService, trashService := newTrashIntegrationServices(t, pool, expiredClock)
	quota, err := cloudService.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	textItem, err := cloudService.CreateText(ctx, ownerID, "Gate 2 text")
	if err != nil {
		t.Fatal(err)
	}
	linkItem, err := cloudService.CreateLink(ctx, ownerID, "https://hacom.vn/gate2", "Gate 2 link")
	if err != nil {
		t.Fatal(err)
	}
	fileItemID, objectID := seedGate2File(t, pool, objects, quota, []byte("gate2-file-content"))
	for index, itemID := range []uuid.UUID{textItem.ID, linkItem.ID, fileItemID} {
		if _, err := trashService.MoveToTrash(
			ctx, ownerID, itemID, "gate2-move-"+strconv.Itoa(index),
		); err != nil {
			t.Fatal(err)
		}
	}
	assertGate2QuotaCheckpoint(t, pool, ownerID, 3, 0, false)

	permanentDelete, err := NewPermanentDeletePostgres(pool)
	if err != nil {
		t.Fatal(err)
	}
	purged, err := permanentDelete.EnqueueExpiredTrashJobs(ctx, 100)
	if err != nil || purged != 3 {
		t.Fatalf("purged=%d error=%v", purged, err)
	}
	assertGate2QuotaCheckpoint(t, pool, ownerID, 0, 1, true)

	var jobID uuid.UUID
	var payload []byte
	err = pool.QueryRow(ctx, `
		UPDATE cloud.jobs
		SET status = 'processing', attempts = 1,
		    locked_by = 'gate2-worker', locked_at = NOW()
		WHERE storage_object_id = $1 AND job_type = 'permanent_delete'
		RETURNING id, payload
	`, objectID).Scan(&jobID, &payload)
	if err != nil {
		t.Fatal(err)
	}

	metrics := worker.NewMetrics()
	failingRepository := &failOncePermanentFinalize{repository: permanentDelete, fail: true}
	handler, err := workerhandlers.NewPermanentDeleteHandler(failingRepository, objects, metrics)
	if err != nil {
		t.Fatal(err)
	}
	job := worker.Job{ID: jobID.String(), Type: worker.JobPermanentDelete, Payload: payload}
	if err := handler.Handle(ctx, job); err == nil {
		t.Fatal("injected crash error=nil")
	}
	if _, err := objects.StatObject(ctx, "gate2/permanent-delete/"+objectID.String()); !errors.Is(err, storage.ErrObjectNotFound) {
		t.Fatalf("object survived injected crash: %v", err)
	}
	assertGate2QuotaCheckpoint(t, pool, ownerID, 0, 1, true)
	assertGate2PermanentDeleteState(t, pool, jobID, objectID, "processing", "delete_pending", 0)
	if err := handler.Handle(ctx, job); err != nil {
		t.Fatal(err)
	}
	assertGate2QuotaCheckpoint(t, pool, ownerID, 0, 1, true)
	assertGate2PermanentDeleteState(t, pool, jobID, objectID, "processing", "deleted", 1)

	jobs, err := NewJobPostgres(pool, "gate2-worker", worker.RetryPolicy{
		MaxAttempts: 5, BaseBackoff: time.Second, MaxBackoff: time.Minute, LockTimeout: time.Minute,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := jobs.Complete(ctx, jobID.String()); err != nil {
		t.Fatal(err)
	}
	assertGate2PermanentDeleteState(t, pool, jobID, objectID, "completed", "deleted", 1)
	assertGate2Reconciled(t, pool, ownerID, 1, 1)
	if snapshot := metrics.Snapshot(); snapshot.PurgeCompleted != 1 || snapshot.PurgeMissingObject != 1 {
		t.Fatalf("metrics=%+v", snapshot)
	}
}

func assertGate2QuotaCheckpoint(
	t *testing.T,
	pool *pgxpool.Pool,
	ownerID uuid.UUID,
	wantItems, wantJobs int,
	wantZero bool,
) {
	t.Helper()
	var (
		used, trashBytes, reserved              int64
		ledgerUsed, ledgerTrash, ledgerReserved int64
		itemCount, jobCount                     int
	)
	if err := pool.QueryRow(context.Background(), `
		SELECT
			quota.used_bytes, quota.trash_bytes, quota.reserved_bytes,
			COALESCE(SUM(ledger.delta_used_bytes), 0),
			COALESCE(SUM(ledger.delta_trash_bytes), 0),
			COALESCE(SUM(ledger.delta_reserved_bytes), 0),
			(SELECT COUNT(*) FROM cloud.items WHERE drive_id = drive.id),
			(SELECT COUNT(*) FROM cloud.jobs WHERE drive_id = drive.id AND job_type = 'permanent_delete')
		FROM cloud.drives AS drive
		JOIN cloud.quotas AS quota ON quota.drive_id = drive.id
		LEFT JOIN cloud.usage_ledger AS ledger ON ledger.drive_id = drive.id
		WHERE drive.owner_user_id = $1
		GROUP BY drive.id, quota.drive_id
	`, ownerID).Scan(
		&used, &trashBytes, &reserved,
		&ledgerUsed, &ledgerTrash, &ledgerReserved,
		&itemCount, &jobCount,
	); err != nil {
		t.Fatal(err)
	}
	if used != ledgerUsed || trashBytes != ledgerTrash || reserved != ledgerReserved ||
		reserved != 0 || itemCount != wantItems || jobCount != wantJobs ||
		(wantZero && (used != 0 || trashBytes != 0)) ||
		(!wantZero && (used <= 0 || trashBytes != used)) {
		t.Fatalf(
			"checkpoint quota=%d/%d/%d ledger=%d/%d/%d items=%d jobs=%d",
			used, trashBytes, reserved, ledgerUsed, ledgerTrash, ledgerReserved,
			itemCount, jobCount,
		)
	}
}

func assertGate2PermanentDeleteState(
	t *testing.T,
	pool *pgxpool.Pool,
	jobID, objectID uuid.UUID,
	wantJobStatus, wantObjectStatus string,
	wantCompletionAudits int,
) {
	t.Helper()
	var jobStatus, objectStatus string
	var auditCount int
	if err := pool.QueryRow(context.Background(), `
		SELECT job.status::TEXT, object.status::TEXT,
		       (SELECT COUNT(*) FROM cloud.audit_logs
		        WHERE request_id = job.id::TEXT
		          AND action = 'cloud.object.permanent_delete.completed')
		FROM cloud.jobs AS job
		JOIN cloud.storage_objects AS object ON object.id = job.storage_object_id
		WHERE job.id = $1 AND object.id = $2
	`, jobID, objectID).Scan(&jobStatus, &objectStatus, &auditCount); err != nil {
		t.Fatal(err)
	}
	if jobStatus != wantJobStatus || objectStatus != wantObjectStatus || auditCount != wantCompletionAudits {
		t.Fatalf(
			"permanent delete state job=%s object=%s audits=%d",
			jobStatus, objectStatus, auditCount,
		)
	}
}

func TestGate2DeleteWinsPreviewRaceWithoutReturningURL(t *testing.T) {
	pool := integrationPool(t)
	objects := gate2ObjectStore(t)
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	ctx := context.Background()
	now := time.Now().UTC()
	cloudService, trashService := newTrashIntegrationServices(t, pool, now)
	quota, err := cloudService.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	itemID, _ := seedGate2File(t, pool, objects, quota, []byte("preview-race"))
	if _, err := trashService.MoveToTrash(ctx, ownerID, itemID, "gate2-preview-move"); err != nil {
		t.Fatal(err)
	}
	repository, err := NewCloudPostgres(pool, integrationQuotaBytes)
	if err != nil {
		t.Fatal(err)
	}
	blockingStore := &blockingAccessStore{
		objects: objects, entered: make(chan struct{}, 1), release: make(chan struct{}),
	}
	accessService, err := fileaccess.NewService(repository, blockingStore, 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	accessErrors := make(chan error, 1)
	go func() {
		_, callErr := accessService.CreateAccess(context.Background(), ownerID, itemID)
		accessErrors <- callErr
	}()
	select {
	case <-blockingStore.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("preview did not reach signing barrier")
	}
	if _, err := trashService.DeleteImmediately(ctx, ownerID, itemID, "gate2-delete-wins"); err != nil {
		t.Fatal(err)
	}
	close(blockingStore.release)
	if err := <-accessErrors; !errors.Is(err, fileaccess.ErrDeletePending) {
		t.Fatalf("preview race error=%v, want ErrDeletePending", err)
	}
	assertGate2Reconciled(t, pool, ownerID, 1, 0)
}

func TestGate2ScannerHonorsDeadlineAndBatch(t *testing.T) {
	pool := integrationPool(t)
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	ctx := context.Background()
	cloudService, trashService := newTrashIntegrationServices(t, pool, time.Now().UTC())

	itemIDs := make([]uuid.UUID, 0, 4)
	for index := 0; index < 4; index++ {
		item, err := cloudService.CreateText(ctx, ownerID, "Gate 2 scanner "+strconv.Itoa(index))
		if err != nil {
			t.Fatal(err)
		}
		itemIDs = append(itemIDs, item.ID)
		if _, err := trashService.MoveToTrash(
			ctx, ownerID, item.ID, "gate2-scanner-move-"+strconv.Itoa(index),
		); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `
		UPDATE cloud.items
		SET deleted_at = NOW() - INTERVAL '25 hours',
		    purge_after = NOW() - INTERVAL '1 hour'
		WHERE id = ANY($1)
	`, itemIDs[:3]); err != nil {
		t.Fatal(err)
	}

	permanentDelete, err := NewPermanentDeletePostgres(pool)
	if err != nil {
		t.Fatal(err)
	}
	if purged, err := permanentDelete.EnqueueExpiredTrashJobs(ctx, 2); err != nil || purged != 2 {
		t.Fatalf("first batch purged=%d error=%v", purged, err)
	}
	var remaining, futureRemaining int
	if err := pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'trashed'),
			COUNT(*) FILTER (WHERE id = $2 AND status = 'trashed' AND purge_after > NOW())
		FROM cloud.items WHERE drive_id = $1
	`, mustDriveID(t, pool, ownerID), itemIDs[3]).Scan(&remaining, &futureRemaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 2 || futureRemaining != 1 {
		t.Fatalf("after first batch remaining=%d future=%d", remaining, futureRemaining)
	}
	if purged, err := permanentDelete.EnqueueExpiredTrashJobs(ctx, 2); err != nil || purged != 1 {
		t.Fatalf("second batch purged=%d error=%v", purged, err)
	}
	if purged, err := permanentDelete.EnqueueExpiredTrashJobs(ctx, 2); err != nil || purged != 0 {
		t.Fatalf("pre-deadline scan purged=%d error=%v", purged, err)
	}
	if _, err := trashService.DeleteImmediately(
		ctx, ownerID, itemIDs[3], "gate2-scanner-cleanup-future",
	); err != nil {
		t.Fatal(err)
	}
	assertGate2Reconciled(t, pool, ownerID, 0, 0)
}

func mustDriveID(t *testing.T, pool *pgxpool.Pool, ownerID uuid.UUID) uuid.UUID {
	t.Helper()
	var driveID uuid.UUID
	if err := pool.QueryRow(
		context.Background(),
		`SELECT id FROM cloud.drives WHERE owner_user_id = $1`,
		ownerID,
	).Scan(&driveID); err != nil {
		t.Fatal(err)
	}
	return driveID
}

func assertGate2Reconciled(
	t *testing.T,
	pool *pgxpool.Pool,
	ownerID uuid.UUID,
	wantJobs int,
	wantAudits int,
) {
	t.Helper()
	var (
		used, trashBytes, reserved                  int64
		ledgerUsed, ledgerTrash, ledgerReserved     int64
		itemCount, jobCount, orphanJobs, auditCount int
	)
	err := pool.QueryRow(context.Background(), `
		SELECT
			quota.used_bytes, quota.trash_bytes, quota.reserved_bytes,
			COALESCE(SUM(ledger.delta_used_bytes), 0),
			COALESCE(SUM(ledger.delta_trash_bytes), 0),
			COALESCE(SUM(ledger.delta_reserved_bytes), 0),
			(SELECT COUNT(*) FROM cloud.items WHERE drive_id = drive.id),
			(SELECT COUNT(*) FROM cloud.jobs WHERE drive_id = drive.id AND job_type = 'permanent_delete'),
			(SELECT COUNT(*) FROM cloud.jobs WHERE drive_id = drive.id AND job_type = 'permanent_delete' AND storage_object_id IS NULL),
			(SELECT COUNT(*) FROM cloud.audit_logs WHERE drive_id = drive.id AND action = 'cloud.object.permanent_delete.completed')
		FROM cloud.drives AS drive
		JOIN cloud.quotas AS quota ON quota.drive_id = drive.id
		LEFT JOIN cloud.usage_ledger AS ledger ON ledger.drive_id = drive.id
		WHERE drive.owner_user_id = $1
		GROUP BY drive.id, quota.drive_id
	`, ownerID).Scan(
		&used, &trashBytes, &reserved,
		&ledgerUsed, &ledgerTrash, &ledgerReserved,
		&itemCount, &jobCount, &orphanJobs, &auditCount,
	)
	if err != nil {
		t.Fatal(err)
	}
	if used != ledgerUsed || trashBytes != ledgerTrash || reserved != ledgerReserved ||
		used != 0 || trashBytes != 0 || reserved != 0 || itemCount != 0 ||
		jobCount != wantJobs || orphanJobs != 0 || auditCount != wantAudits {
		t.Fatalf(
			"quota=%d/%d/%d ledger=%d/%d/%d items=%d jobs=%d orphan=%d audit=%d",
			used, trashBytes, reserved, ledgerUsed, ledgerTrash, ledgerReserved,
			itemCount, jobCount, orphanJobs, auditCount,
		)
	}
}
