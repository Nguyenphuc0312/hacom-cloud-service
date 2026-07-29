package repository

import (
	"context"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/upload"
	"github.com/google/uuid"
)

func TestProcess5ReconcilesMixedContentUploadAndExpiry(t *testing.T) {
	repository, uploadService, objects := integrationUploadFixture(t, 1_000_000)
	cloudService, err := cloud.NewService(repository, 100_000_000)
	if err != nil {
		t.Fatal(err)
	}
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	ctx := context.Background()

	if _, err := cloudService.CreateText(ctx, ownerID, "Process 5 reconciliation"); err != nil {
		t.Fatal(err)
	}
	if _, err := cloudService.CreateLink(
		ctx,
		ownerID,
		"https://hacom.vn/process-5",
		"Process 5",
	); err != nil {
		t.Fatal(err)
	}

	payload := []byte("release-candidate")
	completedUpload, err := uploadService.Initiate(ctx, upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "release.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  int64(len(payload)),
		IdempotencyKey: "process5-completed",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = objects.Delete(context.Background(), completedUpload.Session.ObjectKey)
	})
	putPresignedObject(
		t,
		completedUpload.UploadURL,
		"text/plain",
		payload,
	)
	if _, err := uploadService.Complete(ctx, upload.CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   completedUpload.Session.ID,
	}); err != nil {
		t.Fatal(err)
	}

	expiredUpload, err := uploadService.Initiate(ctx, upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "expired.bin",
		ContentType:    "application/octet-stream",
		DeclaredBytes:  64,
		IdempotencyKey: "process5-expired",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.pool.Exec(ctx, `
		UPDATE cloud.upload_sessions
		SET created_at = NOW() - INTERVAL '2 minutes',
		    expires_at = NOW() - INTERVAL '1 minute'
		WHERE id = $1
	`, expiredUpload.Session.ID); err != nil {
		t.Fatal(err)
	}

	cleanupRepository, err := NewUploadCleanupPostgres(repository.pool)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := cleanupRepository.EnqueueExpiredUploadJobs(ctx, 100); err != nil {
		t.Fatal(err)
	}
	if _, err := cleanupRepository.EnqueueExpiredUploadJobs(ctx, 100); err != nil {
		t.Fatal(err)
	}
	if err := cleanupRepository.CompleteCleanup(
		ctx,
		expiredUpload.Session.ID.String(),
	); err != nil {
		t.Fatal(err)
	}

	quota, err := repository.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	var ledgerUsed, ledgerReserved int64
	if err := repository.pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(delta_used_bytes), 0),
			COALESCE(SUM(delta_reserved_bytes), 0)
		FROM cloud.usage_ledger
		WHERE drive_id = $1
	`, quota.DriveID).Scan(&ledgerUsed, &ledgerReserved); err != nil {
		t.Fatal(err)
	}
	if quota.UsedBytes != ledgerUsed ||
		quota.ReservedBytes != ledgerReserved ||
		quota.UsedBytes < 0 ||
		quota.ReservedBytes < 0 ||
		quota.UsedBytes+quota.ReservedBytes > quota.LimitBytes {
		t.Fatalf(
			"quota/ledger mismatch: quota=%+v ledger_used=%d ledger_reserved=%d",
			quota,
			ledgerUsed,
			ledgerReserved,
		)
	}

	var (
		orphanItems     int
		orphanSessions  int
		orphanLedger    int
		duplicateJobs   int
		expiredReleases int
		cleanupJobs     int
	)
	if err := repository.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*)
			 FROM cloud.items AS item
			 LEFT JOIN cloud.storage_objects AS object
			   ON object.id = item.storage_object_id
			 WHERE item.drive_id = $1
			   AND item.item_type = 'file'
			   AND object.id IS NULL),
			(SELECT COUNT(*)
			 FROM cloud.upload_sessions AS session
			 LEFT JOIN cloud.items AS item ON item.id = session.item_id
			 LEFT JOIN cloud.storage_objects AS object
			   ON object.id = session.storage_object_id
			 WHERE session.drive_id = $1
			   AND (item.id IS NULL OR object.id IS NULL)),
			(SELECT COUNT(*)
			 FROM cloud.usage_ledger AS ledger
			 LEFT JOIN cloud.drives AS drive ON drive.id = ledger.drive_id
			 WHERE ledger.drive_id = $1 AND drive.id IS NULL),
			(SELECT COUNT(*)
			 FROM (
				SELECT dedupe_key
				FROM cloud.jobs
				WHERE drive_id = $1
				  AND dedupe_key IS NOT NULL
				  AND status IN ('pending', 'processing', 'failed')
				GROUP BY dedupe_key
				HAVING COUNT(*) > 1
			 ) AS duplicate),
			(SELECT COUNT(*)
			 FROM cloud.usage_ledger
			 WHERE drive_id = $1
			   AND idempotency_key = $2),
			(SELECT COUNT(*)
			 FROM cloud.jobs
			 WHERE drive_id = $1
			   AND dedupe_key = $3)
	`,
		quota.DriveID,
		"release:expired-upload:"+expiredUpload.Session.ID.String(),
		"cleanup_expired_upload:"+expiredUpload.Session.ID.String(),
	).Scan(
		&orphanItems,
		&orphanSessions,
		&orphanLedger,
		&duplicateJobs,
		&expiredReleases,
		&cleanupJobs,
	); err != nil {
		t.Fatal(err)
	}
	if orphanItems != 0 ||
		orphanSessions != 0 ||
		orphanLedger != 0 ||
		duplicateJobs != 0 ||
		expiredReleases != 1 ||
		cleanupJobs != 1 {
		t.Fatalf(
			"reconciliation items=%d sessions=%d ledger=%d duplicate_jobs=%d releases=%d cleanup_jobs=%d",
			orphanItems,
			orphanSessions,
			orphanLedger,
			duplicateJobs,
			expiredReleases,
			cleanupJobs,
		)
	}
}

func TestProcess5UploadSessionTTLIsFinite(t *testing.T) {
	repository, uploadService, _ := integrationUploadFixture(t, 1_000_000)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	before := time.Now().UTC()
	result, err := uploadService.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "ttl.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  1,
		IdempotencyKey: "process5-ttl",
	})
	if err != nil {
		t.Fatal(err)
	}
	remaining := result.Session.ExpiresAt.Sub(before)
	if remaining < 14*time.Minute || remaining > 16*time.Minute {
		t.Fatalf("upload TTL = %s, want approximately 15 minutes", remaining)
	}
}
