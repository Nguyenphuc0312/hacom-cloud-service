package repository

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker/handlers"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func insertCleanupFixture(
	t *testing.T,
	pool *pgxpool.Pool,
	expiresAt time.Time,
) process4Fixture {
	t.Helper()
	fixture := process4Fixture{
		OwnerID:   uuid.New(),
		DriveID:   uuid.New(),
		ItemID:    uuid.New(),
		ObjectID:  uuid.New(),
		SessionID: uuid.New(),
		ObjectKey: "uploads/" + uuid.NewString() + "/" + uuid.NewString(),
		SizeBytes: 4096,
	}
	cleanupOwner(t, pool, fixture.OwnerID)

	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	createdAt := time.Now().UTC().Add(-2 * time.Hour)
	if !expiresAt.After(createdAt) {
		createdAt = expiresAt.Add(-time.Hour)
	}
	queries := []struct {
		sql  string
		args []any
	}{
		{
			`INSERT INTO cloud.drives (id, owner_user_id) VALUES ($1, $2)`,
			[]any{fixture.DriveID, fixture.OwnerID},
		},
		{
			`INSERT INTO cloud.quotas (drive_id, quota_bytes, reserved_bytes)
			 VALUES ($1, 5000000000, $2)`,
			[]any{fixture.DriveID, fixture.SizeBytes},
		},
		{
			`INSERT INTO cloud.storage_objects (
				id, drive_id, bucket, object_key, original_name, content_type,
				declared_size_bytes, status
			 )
			 VALUES ($1, $2, 'hacom-cloud-private', $3, 'expired.bin',
			         'application/octet-stream', $4, 'reserved')`,
			[]any{
				fixture.ObjectID,
				fixture.DriveID,
				fixture.ObjectKey,
				fixture.SizeBytes,
			},
		},
		{
			`INSERT INTO cloud.items (
				id, drive_id, item_type, status, title, storage_object_id,
				size_bytes, billable_bytes, source_type
			 )
			 VALUES ($1, $2, 'file', 'pending', 'expired.bin', $3, $4, $4,
			         'cloud_upload')`,
			[]any{
				fixture.ItemID,
				fixture.DriveID,
				fixture.ObjectID,
				fixture.SizeBytes,
			},
		},
		{
			`INSERT INTO cloud.upload_sessions (
				id, drive_id, item_id, storage_object_id, status, original_name,
				content_type, declared_size_bytes, reserved_bytes,
				idempotency_key, expires_at, created_at
			 )
			 VALUES ($1, $2, $3, $4, 'initiated', 'expired.bin',
			         'application/octet-stream', $5, $5, $6, $7, $8)`,
			[]any{
				fixture.SessionID,
				fixture.DriveID,
				fixture.ItemID,
				fixture.ObjectID,
				fixture.SizeBytes,
				"p4-cleanup-" + fixture.SessionID.String(),
				expiresAt,
				createdAt,
			},
		},
		{
			`INSERT INTO cloud.usage_ledger (
				drive_id, item_id, upload_session_id, event_type,
				delta_used_bytes, delta_reserved_bytes, idempotency_key
			 )
			 VALUES ($1, $2, $3, 'reserve', 0, $4, $5)`,
			[]any{
				fixture.DriveID,
				fixture.ItemID,
				fixture.SessionID,
				fixture.SizeBytes,
				"reserve:upload:" + fixture.SessionID.String(),
			},
		},
	}
	for _, query := range queries {
		if _, err := tx.Exec(ctx, query.sql, query.args...); err != nil {
			t.Fatalf("insert cleanup fixture: %v", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func TestUploadCleanupPostgresEnqueuesAndCompletesExactlyOnce(t *testing.T) {
	pool := integrationPool(t)
	fixture := insertCleanupFixture(t, pool, time.Now().Add(-time.Minute))
	repository, err := NewUploadCleanupPostgres(pool)
	if err != nil {
		t.Fatal(err)
	}

	enqueued, err := repository.EnqueueExpiredUploadJobs(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
	if enqueued != 1 {
		t.Fatalf("enqueued jobs = %d, want 1", enqueued)
	}
	enqueued, err = repository.EnqueueExpiredUploadJobs(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
	if enqueued != 0 {
		t.Fatalf("duplicate enqueued jobs = %d, want 0", enqueued)
	}

	var jobType, dedupeKey, payloadSessionID string
	err = pool.QueryRow(context.Background(), `
		SELECT job_type::text, dedupe_key, payload->>'session_id'
		FROM cloud.jobs
		WHERE upload_session_id = $1
	`, fixture.SessionID).Scan(&jobType, &dedupeKey, &payloadSessionID)
	if err != nil {
		t.Fatal(err)
	}
	if jobType != "cleanup_expired_upload" ||
		dedupeKey != "cleanup_expired_upload:"+fixture.SessionID.String() ||
		payloadSessionID != fixture.SessionID.String() {
		t.Fatalf(
			"cleanup job type=%q dedupe=%q session=%q",
			jobType,
			dedupeKey,
			payloadSessionID,
		)
	}

	target, err := repository.GetCleanupTarget(
		context.Background(),
		fixture.SessionID.String(),
	)
	if err != nil {
		t.Fatal(err)
	}
	if target.AlreadyCleaned ||
		target.ObjectKey != fixture.ObjectKey ||
		target.ReservedBytes != fixture.SizeBytes {
		t.Fatalf("cleanup target = %+v", target)
	}

	const concurrentRetries = 8
	var waitGroup sync.WaitGroup
	errorsChannel := make(chan error, concurrentRetries)
	for range concurrentRetries {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			errorsChannel <- repository.CompleteCleanup(
				context.Background(),
				fixture.SessionID.String(),
			)
		}()
	}
	waitGroup.Wait()
	close(errorsChannel)
	for cleanupErr := range errorsChannel {
		if cleanupErr != nil {
			t.Fatalf("concurrent CompleteCleanup: %v", cleanupErr)
		}
	}

	var (
		sessionStatus string
		itemStatus    string
		objectStatus  string
		reservedBytes int64
		releaseCount  int
		releasedDelta int64
	)
	err = pool.QueryRow(context.Background(), `
		SELECT
			session.status::text,
			item.status::text,
			object.status::text,
			quota.reserved_bytes,
			(SELECT COUNT(*)
			 FROM cloud.usage_ledger AS ledger
			 WHERE ledger.drive_id = session.drive_id
			   AND ledger.idempotency_key = $2),
			(SELECT COALESCE(SUM(delta_reserved_bytes), 0)
			 FROM cloud.usage_ledger AS ledger
			 WHERE ledger.drive_id = session.drive_id
			   AND ledger.idempotency_key = $2)
		FROM cloud.upload_sessions AS session
		JOIN cloud.items AS item ON item.id = session.item_id
		JOIN cloud.storage_objects AS object
		  ON object.id = session.storage_object_id
		JOIN cloud.quotas AS quota ON quota.drive_id = session.drive_id
		WHERE session.id = $1
	`,
		fixture.SessionID,
		"release:expired-upload:"+fixture.SessionID.String(),
	).Scan(
		&sessionStatus,
		&itemStatus,
		&objectStatus,
		&reservedBytes,
		&releaseCount,
		&releasedDelta,
	)
	if err != nil {
		t.Fatal(err)
	}
	if sessionStatus != "expired" ||
		itemStatus != "failed" ||
		objectStatus != "failed" ||
		reservedBytes != 0 ||
		releaseCount != 1 ||
		releasedDelta != -fixture.SizeBytes {
		t.Fatalf(
			"cleanup state session=%q item=%q object=%q reserved=%d releases=%d delta=%d",
			sessionStatus,
			itemStatus,
			objectStatus,
			reservedBytes,
			releaseCount,
			releasedDelta,
		)
	}

	target, err = repository.GetCleanupTarget(
		context.Background(),
		fixture.SessionID.String(),
	)
	if err != nil {
		t.Fatal(err)
	}
	if !target.AlreadyCleaned {
		t.Fatalf("cleaned target = %+v", target)
	}
}

func TestUploadCleanupPostgresIgnoresUnexpiredAndCompletedSessions(t *testing.T) {
	pool := integrationPool(t)
	unexpired := insertCleanupFixture(t, pool, time.Now().Add(time.Hour))
	completed := insertCleanupFixture(t, pool, time.Now().Add(-time.Minute))
	_, err := pool.Exec(context.Background(), `
		UPDATE cloud.upload_sessions
		SET status = 'completed',
		    completed_at = NOW()
		WHERE id = $1
	`, completed.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	repository, _ := NewUploadCleanupPostgres(pool)

	enqueued, err := repository.EnqueueExpiredUploadJobs(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
	if enqueued != 0 {
		t.Fatalf("ineligible sessions enqueued = %d, want 0", enqueued)
	}
	_, err = repository.GetCleanupTarget(
		context.Background(),
		unexpired.SessionID.String(),
	)
	if !errors.Is(err, handlers.ErrCleanupNotExpired) {
		t.Fatalf("unexpired target error = %v", err)
	}
	_, err = repository.GetCleanupTarget(
		context.Background(),
		completed.SessionID.String(),
	)
	if !errors.Is(err, handlers.ErrCleanupNotEligible) {
		t.Fatalf("completed target error = %v", err)
	}
	if err := repository.CompleteCleanup(
		context.Background(),
		completed.SessionID.String(),
	); !errors.Is(err, handlers.ErrCleanupNotEligible) {
		t.Fatalf("completed cleanup error = %v", err)
	}
}

func TestUploadCleanupPostgresRollsBackAllStateWhenLedgerInsertFails(t *testing.T) {
	pool := integrationPool(t)
	fixture := insertCleanupFixture(t, pool, time.Now().Add(-time.Minute))
	idempotencyKey := "release:expired-upload:" + fixture.SessionID.String()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO cloud.usage_ledger (
			drive_id, item_id, upload_session_id, event_type,
			delta_used_bytes, delta_reserved_bytes, idempotency_key
		)
		VALUES ($1, $2, $3, 'release', 0, (-$4::bigint), $5)
	`,
		fixture.DriveID,
		fixture.ItemID,
		fixture.SessionID,
		fixture.SizeBytes,
		idempotencyKey,
	)
	if err != nil {
		t.Fatal(err)
	}
	repository, _ := NewUploadCleanupPostgres(pool)

	err = repository.CompleteCleanup(
		context.Background(),
		fixture.SessionID.String(),
	)
	if err == nil {
		t.Fatal("CompleteCleanup() error = nil, want ledger conflict")
	}

	var sessionStatus, itemStatus, objectStatus string
	var reservedBytes int64
	err = pool.QueryRow(context.Background(), `
		SELECT session.status::text, item.status::text, object.status::text,
		       quota.reserved_bytes
		FROM cloud.upload_sessions AS session
		JOIN cloud.items AS item ON item.id = session.item_id
		JOIN cloud.storage_objects AS object
		  ON object.id = session.storage_object_id
		JOIN cloud.quotas AS quota ON quota.drive_id = session.drive_id
		WHERE session.id = $1
	`, fixture.SessionID).Scan(
		&sessionStatus,
		&itemStatus,
		&objectStatus,
		&reservedBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	if sessionStatus != "initiated" ||
		itemStatus != "pending" ||
		objectStatus != "reserved" ||
		reservedBytes != fixture.SizeBytes {
		t.Fatalf(
			"rollback state session=%q item=%q object=%q reserved=%d",
			sessionStatus,
			itemStatus,
			objectStatus,
			reservedBytes,
		)
	}
}

func TestUploadCleanupPostgresRejectsInvalidBatchLimit(t *testing.T) {
	pool := integrationPool(t)
	repository, _ := NewUploadCleanupPostgres(pool)
	if _, err := repository.EnqueueExpiredUploadJobs(context.Background(), 0); err == nil {
		t.Fatal("zero batch limit error = nil")
	}
}
