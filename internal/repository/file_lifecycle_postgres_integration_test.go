package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker/handlers"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type process4Fixture struct {
	OwnerID   uuid.UUID
	DriveID   uuid.UUID
	ItemID    uuid.UUID
	ObjectID  uuid.UUID
	SessionID uuid.UUID
	ObjectKey string
	SizeBytes int64
}

func insertProcessingHashFixture(
	t *testing.T,
	pool *pgxpool.Pool,
) process4Fixture {
	t.Helper()
	fixture := process4Fixture{
		OwnerID:   uuid.New(),
		DriveID:   uuid.New(),
		ItemID:    uuid.New(),
		ObjectID:  uuid.New(),
		SessionID: uuid.New(),
		ObjectKey: "uploads/" + uuid.NewString() + "/" + uuid.NewString(),
		SizeBytes: 19,
	}
	cleanupOwner(t, pool, fixture.OwnerID)

	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	queries := []struct {
		sql  string
		args []any
	}{
		{
			`INSERT INTO cloud.drives (id, owner_user_id) VALUES ($1, $2)`,
			[]any{fixture.DriveID, fixture.OwnerID},
		},
		{
			`INSERT INTO cloud.quotas (drive_id, quota_bytes, used_bytes)
			 VALUES ($1, 5000000000, $2)`,
			[]any{fixture.DriveID, fixture.SizeBytes},
		},
		{
			`INSERT INTO cloud.storage_objects (
				id, drive_id, bucket, object_key, original_name, content_type,
				declared_size_bytes, actual_size_bytes, status, uploaded_at
			 )
			 VALUES ($1, $2, 'hacom-cloud-private', $3, 'hash.txt',
			         'text/plain', $4, $4, 'processing', NOW())`,
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
			 VALUES ($1, $2, 'file', 'processing', 'hash.txt', $3, $4, $4,
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
				actual_size_bytes, idempotency_key, expires_at, uploaded_at,
				completed_at
			 )
			 VALUES ($1, $2, $3, $4, 'completed', 'hash.txt', 'text/plain',
			         $5, $5, $5, $6, NOW() + INTERVAL '1 hour', NOW(), NOW())`,
			[]any{
				fixture.SessionID,
				fixture.DriveID,
				fixture.ItemID,
				fixture.ObjectID,
				fixture.SizeBytes,
				"p4-hash-" + fixture.SessionID.String(),
			},
		},
	}
	for _, query := range queries {
		if _, err := tx.Exec(ctx, query.sql, query.args...); err != nil {
			t.Fatalf("insert processing hash fixture: %v", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func (fixture process4Fixture) hashPayload() handlers.HashFilePayload {
	return handlers.HashFilePayload{
		ItemID:          fixture.ItemID.String(),
		StorageObjectID: fixture.ObjectID.String(),
		UploadSessionID: fixture.SessionID.String(),
		ObjectKey:       fixture.ObjectKey,
	}
}

func TestFileLifecyclePostgresMarksReadyAndRetriesIdempotently(t *testing.T) {
	pool := integrationPool(t)
	fixture := insertProcessingHashFixture(t, pool)
	repository, err := NewFileLifecyclePostgres(pool)
	if err != nil {
		t.Fatal(err)
	}

	target, err := repository.GetHashTarget(context.Background(), fixture.hashPayload())
	if err != nil {
		t.Fatal(err)
	}
	if target.ExpectedBytes != fixture.SizeBytes ||
		target.ItemStatus != "processing" ||
		target.ObjectStatus != "processing" {
		t.Fatalf("hash target = %+v", target)
	}
	sum := sha256.Sum256([]byte("hacom process four"))
	result := handlers.HashResult{
		Checksum:  hex.EncodeToString(sum[:]),
		SizeBytes: fixture.SizeBytes,
	}
	if err := repository.MarkHashReady(context.Background(), target, result); err != nil {
		t.Fatal(err)
	}
	// A stale retry target must still be safe after the first transaction commits.
	if err := repository.MarkHashReady(context.Background(), target, result); err != nil {
		t.Fatalf("idempotent retry: %v", err)
	}

	var itemStatus, objectStatus, checksum string
	err = pool.QueryRow(context.Background(), `
		SELECT item.status::text, object.status::text, object.checksum_sha256
		FROM cloud.items AS item
		JOIN cloud.storage_objects AS object ON object.id = item.storage_object_id
		WHERE item.id = $1
	`, fixture.ItemID).Scan(&itemStatus, &objectStatus, &checksum)
	if err != nil {
		t.Fatal(err)
	}
	if itemStatus != "ready" ||
		objectStatus != "ready" ||
		checksum != result.Checksum {
		t.Fatalf(
			"ready state item=%q object=%q checksum=%q",
			itemStatus,
			objectStatus,
			checksum,
		)
	}

	different := sha256.Sum256([]byte("different checksum"))
	conflict := handlers.HashResult{
		Checksum:  hex.EncodeToString(different[:]),
		SizeBytes: fixture.SizeBytes,
	}
	err = repository.MarkHashReady(context.Background(), target, conflict)
	if !errors.Is(err, handlers.ErrHashResultConflict) {
		t.Fatalf("different ready checksum error = %v", err)
	}
}

func TestFileLifecyclePostgresRejectsPayloadRelationshipMismatch(t *testing.T) {
	pool := integrationPool(t)
	fixture := insertProcessingHashFixture(t, pool)
	repository, _ := NewFileLifecyclePostgres(pool)

	tests := []handlers.HashFilePayload{
		{
			ItemID:          fixture.ItemID.String(),
			StorageObjectID: uuid.NewString(),
			UploadSessionID: fixture.SessionID.String(),
			ObjectKey:       fixture.ObjectKey,
		},
		{
			ItemID:          fixture.ItemID.String(),
			StorageObjectID: fixture.ObjectID.String(),
			UploadSessionID: uuid.NewString(),
			ObjectKey:       fixture.ObjectKey,
		},
		{
			ItemID:          fixture.ItemID.String(),
			StorageObjectID: fixture.ObjectID.String(),
			UploadSessionID: fixture.SessionID.String(),
			ObjectKey:       "uploads/untrusted/wrong-key",
		},
	}
	for _, payload := range tests {
		_, err := repository.GetHashTarget(context.Background(), payload)
		if !errors.Is(err, handlers.ErrHashTargetMismatch) {
			t.Fatalf("GetHashTarget(%+v) error = %v", payload, err)
		}
	}
}

func TestFileLifecyclePostgresRejectsSizeChangedAfterTargetRead(t *testing.T) {
	pool := integrationPool(t)
	fixture := insertProcessingHashFixture(t, pool)
	repository, _ := NewFileLifecyclePostgres(pool)
	target, err := repository.GetHashTarget(context.Background(), fixture.hashPayload())
	if err != nil {
		t.Fatal(err)
	}

	_, err = pool.Exec(context.Background(), `
		UPDATE cloud.items SET size_bytes = size_bytes + 1 WHERE id = $1
	`, fixture.ItemID)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte("size mismatch"))
	err = repository.MarkHashReady(context.Background(), target, handlers.HashResult{
		Checksum:  hex.EncodeToString(sum[:]),
		SizeBytes: fixture.SizeBytes,
	})
	if !errors.Is(err, handlers.ErrHashSizeMismatch) {
		t.Fatalf("size mismatch error = %v", err)
	}

	var status string
	if err := pool.QueryRow(context.Background(), `
		SELECT status::text FROM cloud.storage_objects WHERE id = $1
	`, fixture.ObjectID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "processing" {
		t.Fatalf("object status = %q, want processing", status)
	}
}

func TestFileLifecyclePostgresHonorsCancelledContext(t *testing.T) {
	pool := integrationPool(t)
	fixture := insertProcessingHashFixture(t, pool)
	repository, _ := NewFileLifecyclePostgres(pool)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := repository.GetHashTarget(ctx, fixture.hashPayload())
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled GetHashTarget error = %v", err)
	}
}
