package repository

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/fileaccess"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/google/uuid"
)

func TestFileAccessPostgresAllowsOwnedTrashBeforeDeadline(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	ownerID, otherOwnerID := uuid.New(), uuid.New()
	cleanupOwner(t, pool, ownerID)
	cleanupOwner(t, pool, otherOwnerID)
	now := time.Now().UTC()
	cloudService, trashService := newTrashIntegrationServices(t, pool, now)
	quota, err := cloudService.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}

	itemID, objectID := uuid.New(), uuid.New()
	const size int64 = 17
	_, err = pool.Exec(ctx, `
		INSERT INTO cloud.storage_objects (
			id, drive_id, bucket, object_key, original_name, content_type,
			declared_size_bytes, actual_size_bytes, status, uploaded_at, verified_at
		) VALUES ($1, $2, 'private', $3, 'trash-access.bin',
		          'application/octet-stream', $4, $4, 'ready', NOW(), NOW())
	`, objectID, quota.DriveID, "access/"+objectID.String(), size)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO cloud.items (
			id, drive_id, item_type, status, title, storage_object_id,
			size_bytes, billable_bytes, source_type
		) VALUES ($1, $2, 'file', 'ready', 'trash-access.bin', $3, $4, $4, 'cloud_upload')
	`, itemID, quota.DriveID, objectID, size)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		UPDATE cloud.quotas SET used_bytes = used_bytes + $1 WHERE drive_id = $2
	`, size, quota.DriveID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO cloud.usage_ledger (
			drive_id, item_id, event_type, delta_used_bytes, idempotency_key
		) VALUES ($1, $2, 'consume', $3, $4)
	`, quota.DriveID, itemID, size, "seed-trash-access:"+itemID.String())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := trashService.MoveToTrash(ctx, ownerID, itemID, "move-trash-access"); err != nil {
		t.Fatal(err)
	}

	repository, err := NewCloudPostgres(pool, integrationQuotaBytes)
	if err != nil {
		t.Fatal(err)
	}
	target, err := repository.GetFileAccessTarget(ctx, ownerID, itemID)
	if err != nil {
		t.Fatal(err)
	}
	if target.ItemID != itemID || target.ObjectKey == "" || target.PurgeAfter == nil {
		t.Fatalf("Trash access target=%+v", target)
	}
	deadlineDelta := target.PurgeAfter.Sub(now.Add(trashdomain.Retention))
	if deadlineDelta <= -time.Microsecond || deadlineDelta >= time.Microsecond {
		t.Fatalf("Trash access deadline delta=%s target=%+v", deadlineDelta, target)
	}
	if _, err := repository.GetFileAccessTarget(
		ctx, otherOwnerID, itemID,
	); !errors.Is(err, fileaccess.ErrNotFound) {
		t.Fatalf("cross-owner access error=%v", err)
	}

	_, err = pool.Exec(ctx, `
		UPDATE cloud.items
		SET deleted_at = NOW() - INTERVAL '25 hours',
		    purge_after = NOW() - INTERVAL '1 hour'
		WHERE id = $1
	`, itemID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.GetFileAccessTarget(
		ctx, ownerID, itemID,
	); !errors.Is(err, fileaccess.ErrDeletePending) {
		t.Fatalf("expired Trash access error=%v", err)
	}
}
