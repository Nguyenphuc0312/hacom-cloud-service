package repository

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/upload"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func integrationUploadFixture(
	t *testing.T,
	defaultQuota int64,
) (*CloudPostgres, *upload.Service, *storage.MinIOStore) {
	t.Helper()
	pool := integrationPool(t)
	bucket := environmentOr("MINIO_BUCKET", "hacom-cloud-private")
	client, err := minio.New(
		environmentOr("MINIO_ENDPOINT", "localhost:9000"),
		&minio.Options{
			Creds: credentials.NewStaticV4(
				environmentOr("MINIO_ACCESS_KEY", "minioadmin"),
				environmentOr("MINIO_SECRET_KEY", "minioadmin"),
				"",
			),
			Secure: false,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		t.Fatalf("check MinIO bucket: %v", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			t.Fatalf("create MinIO bucket: %v", err)
		}
	}
	objects, err := storage.NewMinIOStore(client, bucket)
	if err != nil {
		t.Fatal(err)
	}
	repository, err := NewCloudPostgres(
		pool,
		defaultQuota,
		WithStorageBucket(bucket),
	)
	if err != nil {
		t.Fatal(err)
	}
	service, err := upload.NewService(
		repository,
		objects,
		100_000_000,
		15*time.Minute,
	)
	if err != nil {
		t.Fatal(err)
	}
	return repository, service, objects
}

func TestUploadPostgresHappyPathAndIdempotency(t *testing.T) {
	repository, service, objects := integrationUploadFixture(t, 1_000)
	ownerID := uuid.New()
	otherOwnerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	cleanupOwner(t, repository.pool, otherOwnerID)
	payload := []byte("Hacom Cloud upload")
	request := upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "bao-cao.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  int64(len(payload)),
		IdempotencyKey: "happy-path",
	}

	first, err := service.Initiate(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = objects.Delete(context.Background(), first.Session.ObjectKey)
	})
	second, err := service.Initiate(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if !first.Created || second.Created ||
		first.Session.ID != second.Session.ID ||
		first.Session.ItemID != second.Session.ItemID {
		t.Fatalf("first/second initiation = %+v/%+v", first, second)
	}
	signedURL, err := url.Parse(first.UploadURL)
	if err != nil {
		t.Fatal(err)
	}
	if signedURL.Query().Get("X-Amz-Expires") != "900" {
		t.Fatalf("presigned URL expiry = %q, want 900 seconds", signedURL.Query().Get("X-Amz-Expires"))
	}

	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quota.UsedBytes != 0 || quota.ReservedBytes != int64(len(payload)) {
		t.Fatalf("quota after reserve = %+v", quota)
	}

	if _, err := service.Complete(context.Background(), upload.CompleteRequest{
		OwnerUserID: otherOwnerID,
		SessionID:   first.Session.ID,
	}); !errors.Is(err, upload.ErrSessionNotFound) {
		t.Fatalf("cross-owner complete error = %v", err)
	}
	if _, err := service.Complete(context.Background(), upload.CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   first.Session.ID,
	}); !errors.Is(err, upload.ErrObjectNotFound) {
		t.Fatalf("complete before PUT error = %v", err)
	}

	putPresignedObject(t, first.UploadURL, request.ContentType, payload)
	if status := putPresignedObjectStatus(
		t,
		first.UploadURL,
		request.ContentType,
		payload,
	); status != http.StatusPreconditionFailed {
		t.Fatalf(
			"second PUT status = %d, want %d",
			status,
			http.StatusPreconditionFailed,
		)
	}
	completeRequest := upload.CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   first.Session.ID,
	}
	const completeAttempts = 20
	completeResults := make(chan upload.CompleteResult, completeAttempts)
	completeErrors := make(chan error, completeAttempts)
	var completeWaitGroup sync.WaitGroup
	for range completeAttempts {
		completeWaitGroup.Add(1)
		go func() {
			defer completeWaitGroup.Done()
			result, completeErr := service.Complete(
				context.Background(),
				completeRequest,
			)
			completeResults <- result
			completeErrors <- completeErr
		}()
	}
	completeWaitGroup.Wait()
	close(completeResults)
	close(completeErrors)
	for completeErr := range completeErrors {
		if completeErr != nil {
			t.Fatalf("concurrent complete: %v", completeErr)
		}
	}
	var completed upload.CompleteResult
	for result := range completeResults {
		if completed.Item.ID == uuid.Nil {
			completed = result
			continue
		}
		if result.Item.ID != completed.Item.ID || result.Job.ID != completed.Job.ID {
			t.Fatalf("concurrent complete returned different result: %+v/%+v", completed, result)
		}
	}
	retried, err := service.Complete(context.Background(), upload.CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   first.Session.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if completed.Item.ID != first.Session.ItemID ||
		completed.Item.ID != retried.Item.ID ||
		completed.Job.ID != retried.Job.ID ||
		completed.Item.Status != cloud.ItemStatusProcessing ||
		completed.Job.Type != "hash_file" ||
		completed.Job.Status != "pending" {
		t.Fatalf("completed/retried = %+v/%+v", completed, retried)
	}

	quota, err = repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quota.ReservedBytes != 0 || quota.UsedBytes != int64(len(payload)) {
		t.Fatalf("quota after completion = %+v", quota)
	}

	var (
		itemCount     int
		objectCount   int
		sessionCount  int
		jobCount      int
		ledgerCount   int
		usedDelta     int64
		reservedDelta int64
	)
	err = repository.pool.QueryRow(context.Background(), `
		SELECT
			(SELECT COUNT(*) FROM cloud.items WHERE drive_id = $1),
			(SELECT COUNT(*) FROM cloud.storage_objects WHERE drive_id = $1),
			(SELECT COUNT(*) FROM cloud.upload_sessions WHERE drive_id = $1),
			(SELECT COUNT(*) FROM cloud.jobs WHERE drive_id = $1),
			(SELECT COUNT(*) FROM cloud.usage_ledger WHERE drive_id = $1),
			(SELECT COALESCE(SUM(delta_used_bytes), 0)
			 FROM cloud.usage_ledger WHERE drive_id = $1),
			(SELECT COALESCE(SUM(delta_reserved_bytes), 0)
			 FROM cloud.usage_ledger WHERE drive_id = $1)
	`, quota.DriveID).Scan(
		&itemCount,
		&objectCount,
		&sessionCount,
		&jobCount,
		&ledgerCount,
		&usedDelta,
		&reservedDelta,
	)
	if err != nil {
		t.Fatal(err)
	}
	if itemCount != 1 || objectCount != 1 || sessionCount != 1 ||
		jobCount != 1 || ledgerCount != 2 ||
		usedDelta != int64(len(payload)) || reservedDelta != 0 {
		t.Fatalf(
			"counts/deltas = %d/%d/%d/%d/%d used=%d reserved=%d",
			itemCount,
			objectCount,
			sessionCount,
			jobCount,
			ledgerCount,
			usedDelta,
			reservedDelta,
		)
	}
}

func TestUploadPostgresConcurrentSameKeyCreatesOneReservation(t *testing.T) {
	repository, service, _ := integrationUploadFixture(t, 100)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	request := upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "same.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  10,
		IdempotencyKey: "same-concurrent-key",
	}

	const attempts = 20
	results := make(chan upload.InitiateResult, attempts)
	errs := make(chan error, attempts)
	var waitGroup sync.WaitGroup
	for range attempts {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			result, err := service.Initiate(context.Background(), request)
			results <- result
			errs <- err
		}()
	}
	waitGroup.Wait()
	close(results)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent initiate: %v", err)
		}
	}
	var sessionID uuid.UUID
	createdCount := 0
	for result := range results {
		if result.Created {
			createdCount++
		}
		if sessionID == uuid.Nil {
			sessionID = result.Session.ID
		} else if result.Session.ID != sessionID {
			t.Fatalf("session IDs differ: %s/%s", sessionID, result.Session.ID)
		}
	}
	if createdCount != 1 {
		t.Fatalf("created responses = %d, want 1", createdCount)
	}

	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	var sessionCount, ledgerCount int
	err = repository.pool.QueryRow(context.Background(), `
		SELECT
			(SELECT COUNT(*) FROM cloud.upload_sessions WHERE drive_id = $1),
			(SELECT COUNT(*) FROM cloud.usage_ledger
			 WHERE drive_id = $1 AND event_type = 'reserve')
	`, quota.DriveID).Scan(&sessionCount, &ledgerCount)
	if err != nil {
		t.Fatal(err)
	}
	if quota.ReservedBytes != 10 || sessionCount != 1 || ledgerCount != 1 {
		t.Fatalf(
			"reserved/session/ledger = %d/%d/%d",
			quota.ReservedBytes,
			sessionCount,
			ledgerCount,
		)
	}
}

func TestUploadPostgresIdempotencyConflictDoesNotReserveTwice(t *testing.T) {
	repository, service, objects := integrationUploadFixture(t, 100)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	first, err := service.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "same.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  10,
		IdempotencyKey: "same-key",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = objects.Delete(context.Background(), first.Session.ObjectKey)
	})

	_, err = service.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "different.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  10,
		IdempotencyKey: "same-key",
	})
	if !errors.Is(err, upload.ErrIdempotencyConflict) {
		t.Fatalf("error = %v, want ErrIdempotencyConflict", err)
	}
	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quota.ReservedBytes != 10 {
		t.Fatalf("reserved bytes = %d, want 10", quota.ReservedBytes)
	}
}

func TestUploadPostgresConcurrentReservationCannotExceedQuota(t *testing.T) {
	repository, service, _ := integrationUploadFixture(t, 60)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)

	start := make(chan struct{})
	const attempts = 24
	results := make(chan error, attempts)
	var waitGroup sync.WaitGroup
	for index := range attempts {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			_, err := service.Initiate(context.Background(), upload.InitiateRequest{
				OwnerUserID:    ownerID,
				FileName:       fmt.Sprintf("file-%d.txt", index),
				ContentType:    "text/plain",
				DeclaredBytes:  6,
				IdempotencyKey: fmt.Sprintf("key-%d", index),
			})
			results <- err
		}()
	}
	close(start)
	waitGroup.Wait()
	close(results)

	successes := 0
	quotaFailures := 0
	for err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, cloud.ErrQuotaExceeded):
			quotaFailures++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if successes != 10 || quotaFailures != attempts-successes {
		t.Fatalf(
			"success/quota failures = %d/%d, want 10/%d",
			successes,
			quotaFailures,
			attempts-10,
		)
	}
	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quota.ReservedBytes != 60 || quota.UsedBytes != 0 {
		t.Fatalf("quota = %+v", quota)
	}

	var sessionCount, reserveCount int
	var reserveDelta int64
	if err := repository.pool.QueryRow(context.Background(), `
		SELECT
			(SELECT COUNT(*) FROM cloud.upload_sessions WHERE drive_id = $1),
			(SELECT COUNT(*) FROM cloud.usage_ledger
			 WHERE drive_id = $1 AND event_type = 'reserve'),
			(SELECT COALESCE(SUM(delta_reserved_bytes), 0)
			 FROM cloud.usage_ledger WHERE drive_id = $1)
	`, quota.DriveID).Scan(&sessionCount, &reserveCount, &reserveDelta); err != nil {
		t.Fatal(err)
	}
	if sessionCount != successes || reserveCount != successes || reserveDelta != 60 {
		t.Fatalf(
			"session/reserve/delta = %d/%d/%d",
			sessionCount,
			reserveCount,
			reserveDelta,
		)
	}
}

func TestUploadPostgresSizeMismatchReleasesQuotaAndRejectsMetadata(t *testing.T) {
	repository, service, objects := integrationUploadFixture(t, 100)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	initiated, err := service.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "mismatch.bin",
		ContentType:    "application/octet-stream",
		DeclaredBytes:  10,
		IdempotencyKey: "mismatch",
	})
	if err != nil {
		t.Fatal(err)
	}
	putPresignedObject(t, initiated.UploadURL, "application/octet-stream", []byte("12345"))

	_, err = service.Complete(context.Background(), upload.CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   initiated.Session.ID,
	})
	if !errors.Is(err, upload.ErrObjectSizeMismatch) {
		t.Fatalf("error = %v, want ErrObjectSizeMismatch", err)
	}
	if _, err := objects.StatObject(
		context.Background(),
		initiated.Session.ObjectKey,
	); !errors.Is(err, storage.ErrObjectNotFound) {
		t.Fatalf("invalid object still exists: %v", err)
	}

	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quota.UsedBytes != 0 || quota.ReservedBytes != 0 {
		t.Fatalf("quota after rejection = %+v", quota)
	}
	var sessionStatus, itemStatus, objectStatus string
	var releaseCount int
	err = repository.pool.QueryRow(context.Background(), `
		SELECT
			session.status::text,
			item.status::text,
			object.status::text,
			(SELECT COUNT(*)
			 FROM cloud.usage_ledger
			 WHERE upload_session_id = session.id AND event_type = 'release')
		FROM cloud.upload_sessions AS session
		JOIN cloud.items AS item ON item.id = session.item_id
		JOIN cloud.storage_objects AS object ON object.id = session.storage_object_id
		WHERE session.id = $1
	`, initiated.Session.ID).Scan(
		&sessionStatus,
		&itemStatus,
		&objectStatus,
		&releaseCount,
	)
	if err != nil {
		t.Fatal(err)
	}
	if sessionStatus != "failed" || itemStatus != "failed" ||
		objectStatus != "failed" || releaseCount != 1 {
		t.Fatalf(
			"states/release = %s/%s/%s/%d",
			sessionStatus,
			itemStatus,
			objectStatus,
			releaseCount,
		)
	}
}

func TestUploadPostgresContentTypeMismatchReleasesQuotaAndDeletesObject(t *testing.T) {
	repository, service, objects := integrationUploadFixture(t, 100)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	initiated, err := service.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "report.pdf",
		ContentType:    "application/pdf",
		DeclaredBytes:  5,
		IdempotencyKey: "content-type-mismatch",
	})
	if err != nil {
		t.Fatal(err)
	}
	putPresignedObject(t, initiated.UploadURL, "text/plain", []byte("hello"))

	_, err = service.Complete(context.Background(), upload.CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   initiated.Session.ID,
	})
	if !errors.Is(err, upload.ErrObjectTypeMismatch) {
		t.Fatalf("error = %v, want ErrObjectTypeMismatch", err)
	}
	if _, err := objects.StatObject(
		context.Background(),
		initiated.Session.ObjectKey,
	); !errors.Is(err, storage.ErrObjectNotFound) {
		t.Fatalf("invalid object still exists: %v", err)
	}

	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quota.UsedBytes != 0 || quota.ReservedBytes != 0 {
		t.Fatalf("quota after rejection = %+v", quota)
	}
}

func TestUploadPostgresFinalizeFailureRollsBackAllChanges(t *testing.T) {
	repository, service, objects := integrationUploadFixture(t, 100)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	payload := []byte("rollback")
	initiated, err := service.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "rollback.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  int64(len(payload)),
		IdempotencyKey: "rollback",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = objects.Delete(context.Background(), initiated.Session.ObjectKey)
	})
	putPresignedObject(t, initiated.UploadURL, "text/plain", payload)

	_, err = repository.pool.Exec(context.Background(), `
		UPDATE cloud.quotas
		SET version = 9223372036854775807
		WHERE drive_id = $1
	`, initiated.Session.DriveID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Complete(context.Background(), upload.CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   initiated.Session.ID,
	}); err == nil {
		t.Fatal("expected quota version overflow")
	}

	var (
		sessionStatus string
		itemStatus    string
		objectStatus  string
		usedBytes     int64
		reservedBytes int64
		jobCount      int
		commitCount   int
	)
	err = repository.pool.QueryRow(context.Background(), `
		SELECT
			session.status::text,
			item.status::text,
			object.status::text,
			quota.used_bytes,
			quota.reserved_bytes,
			(SELECT COUNT(*) FROM cloud.jobs WHERE upload_session_id = session.id),
			(SELECT COUNT(*) FROM cloud.usage_ledger
			 WHERE upload_session_id = session.id AND event_type = 'commit')
		FROM cloud.upload_sessions AS session
		JOIN cloud.items AS item ON item.id = session.item_id
		JOIN cloud.storage_objects AS object ON object.id = session.storage_object_id
		JOIN cloud.quotas AS quota ON quota.drive_id = session.drive_id
		WHERE session.id = $1
	`, initiated.Session.ID).Scan(
		&sessionStatus,
		&itemStatus,
		&objectStatus,
		&usedBytes,
		&reservedBytes,
		&jobCount,
		&commitCount,
	)
	if err != nil {
		t.Fatal(err)
	}
	if sessionStatus != "initiated" || itemStatus != "pending" ||
		objectStatus != "reserved" || usedBytes != 0 ||
		reservedBytes != int64(len(payload)) || jobCount != 0 ||
		commitCount != 0 {
		t.Fatalf(
			"state after rollback = %s/%s/%s used=%d reserved=%d jobs=%d commits=%d",
			sessionStatus,
			itemStatus,
			objectStatus,
			usedBytes,
			reservedBytes,
			jobCount,
			commitCount,
		)
	}
}

func TestUploadPostgresInitiateFailureRollsBackMetadataAndReservation(t *testing.T) {
	repository, service, _ := integrationUploadFixture(t, 100)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = repository.pool.Exec(context.Background(), `
		UPDATE cloud.quotas
		SET version = 9223372036854775807
		WHERE drive_id = $1
	`, quota.DriveID)
	if err != nil {
		t.Fatal(err)
	}

	_, err = service.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "rollback-init.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  8,
		IdempotencyKey: "rollback-init",
	})
	if err == nil {
		t.Fatal("expected quota version overflow")
	}

	var (
		reservedBytes int64
		itemCount     int
		objectCount   int
		sessionCount  int
		ledgerCount   int
	)
	err = repository.pool.QueryRow(context.Background(), `
		SELECT
			quota.reserved_bytes,
			(SELECT COUNT(*) FROM cloud.items WHERE drive_id = quota.drive_id),
			(SELECT COUNT(*) FROM cloud.storage_objects WHERE drive_id = quota.drive_id),
			(SELECT COUNT(*) FROM cloud.upload_sessions WHERE drive_id = quota.drive_id),
			(SELECT COUNT(*) FROM cloud.usage_ledger WHERE drive_id = quota.drive_id)
		FROM cloud.quotas AS quota
		WHERE quota.drive_id = $1
	`, quota.DriveID).Scan(
		&reservedBytes,
		&itemCount,
		&objectCount,
		&sessionCount,
		&ledgerCount,
	)
	if err != nil {
		t.Fatal(err)
	}
	if reservedBytes != 0 || itemCount != 0 || objectCount != 0 ||
		sessionCount != 0 || ledgerCount != 0 {
		t.Fatalf(
			"state after failed initiate = reserved:%d items:%d objects:%d sessions:%d ledger:%d",
			reservedBytes,
			itemCount,
			objectCount,
			sessionCount,
			ledgerCount,
		)
	}
}

func TestUploadPostgresSuspendedDriveCannotInitiate(t *testing.T) {
	repository, service, _ := integrationUploadFixture(t, 100)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = repository.pool.Exec(context.Background(), `
		UPDATE cloud.drives
		SET status = 'suspended'
		WHERE id = $1
	`, quota.DriveID)
	if err != nil {
		t.Fatal(err)
	}

	_, err = service.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "blocked.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  4,
		IdempotencyKey: "blocked",
	})
	if !errors.Is(err, cloud.ErrDriveNotActive) {
		t.Fatalf("error = %v, want ErrDriveNotActive", err)
	}
}

func TestUploadPostgresSuspendedDriveCannotComplete(t *testing.T) {
	repository, service, objects := integrationUploadFixture(t, 100)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	payload := []byte("blocked")
	initiated, err := service.Initiate(context.Background(), upload.InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "blocked.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  int64(len(payload)),
		IdempotencyKey: "blocked-complete",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = objects.Delete(context.Background(), initiated.Session.ObjectKey)
	})
	putPresignedObject(t, initiated.UploadURL, "text/plain", payload)
	object, err := objects.StatObject(
		context.Background(),
		initiated.Session.ObjectKey,
	)
	if err != nil {
		t.Fatal(err)
	}

	_, err = repository.pool.Exec(context.Background(), `
		UPDATE cloud.drives
		SET status = 'suspended'
		WHERE id = $1
	`, initiated.Session.DriveID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Finalize(
		context.Background(),
		ownerID,
		initiated.Session.ID,
		object,
	); !errors.Is(err, cloud.ErrDriveNotActive) {
		t.Fatalf("error = %v, want ErrDriveNotActive", err)
	}

	quota, err := repository.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quota.UsedBytes != 0 || quota.ReservedBytes != int64(len(payload)) {
		t.Fatalf("quota after blocked complete = %+v", quota)
	}
	var sessionStatus, itemStatus, objectStatus string
	var jobCount, commitCount int
	err = repository.pool.QueryRow(context.Background(), `
		SELECT
			session.status::text,
			item.status::text,
			object.status::text,
			(SELECT COUNT(*) FROM cloud.jobs WHERE upload_session_id = session.id),
			(SELECT COUNT(*) FROM cloud.usage_ledger
			 WHERE upload_session_id = session.id AND event_type = 'commit')
		FROM cloud.upload_sessions AS session
		JOIN cloud.items AS item ON item.id = session.item_id
		JOIN cloud.storage_objects AS object ON object.id = session.storage_object_id
		WHERE session.id = $1
	`, initiated.Session.ID).Scan(
		&sessionStatus,
		&itemStatus,
		&objectStatus,
		&jobCount,
		&commitCount,
	)
	if err != nil {
		t.Fatal(err)
	}
	if sessionStatus != "initiated" || itemStatus != "pending" ||
		objectStatus != "reserved" || jobCount != 0 || commitCount != 0 {
		t.Fatalf(
			"state after blocked complete = %s/%s/%s jobs=%d commits=%d",
			sessionStatus,
			itemStatus,
			objectStatus,
			jobCount,
			commitCount,
		)
	}
}

func putPresignedObject(
	t *testing.T,
	uploadURL, contentType string,
	payload []byte,
) {
	t.Helper()
	status := putPresignedObjectStatus(t, uploadURL, contentType, payload)
	if status < 200 || status >= 300 {
		t.Fatalf("PUT presigned object status = %d", status)
	}
}

func putPresignedObjectStatus(
	t *testing.T,
	uploadURL, contentType string,
	payload []byte,
) int {
	t.Helper()
	request, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPut,
		uploadURL,
		bytes.NewReader(payload),
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("If-None-Match", "*")
	request.ContentLength = int64(len(payload))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("PUT presigned object: %v", err)
	}
	defer response.Body.Close()
	return response.StatusCode
}

func environmentOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
