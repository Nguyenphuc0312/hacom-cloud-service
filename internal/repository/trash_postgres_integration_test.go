package repository

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const integrationQuotaBytes int64 = 5_000_000_000

func newTrashIntegrationServices(
	t *testing.T,
	pool *pgxpool.Pool,
	now time.Time,
) (*cloud.Service, *trashdomain.Service) {
	t.Helper()
	cloudRepository, err := NewCloudPostgres(pool, integrationQuotaBytes)
	if err != nil {
		t.Fatal(err)
	}
	cloudService, err := cloud.NewService(cloudRepository, 100_000_000)
	if err != nil {
		t.Fatal(err)
	}
	trashRepository, err := NewTrashPostgres(pool)
	if err != nil {
		t.Fatal(err)
	}
	trashService, err := trashdomain.NewService(
		trashRepository,
		func() time.Time { return now },
	)
	if err != nil {
		t.Fatal(err)
	}
	return cloudService, trashService
}

func TestTrashPostgresMoveRestoreAndRetryAreAtomic(t *testing.T) {
	pool := integrationPool(t)
	now := time.Date(2026, 8, 4, 8, 0, 0, 0, time.UTC)
	cloudService, trashService := newTrashIntegrationServices(t, pool, now)
	ownerID := uuid.New()
	otherOwnerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	cleanupOwner(t, pool, otherOwnerID)
	ctx := context.Background()

	item, err := cloudService.CreateText(ctx, ownerID, "trash transaction")
	if err != nil {
		t.Fatal(err)
	}

	move, err := trashService.MoveToTrash(ctx, ownerID, item.ID, "move-1")
	if err != nil {
		t.Fatal(err)
	}
	if !move.Applied || move.UsedBytes != item.SizeBytes || move.TrashBytes != item.SizeBytes {
		t.Fatalf("move result = %+v", move)
	}
	if move.DeletedAt == nil || move.PurgeAfter == nil ||
		move.PurgeAfter.Sub(*move.DeletedAt) != trashdomain.Retention {
		t.Fatalf("move retention = %+v", move)
	}
	page, err := trashService.List(ctx, ownerID, "", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != item.ID ||
		page.Items[0].DeletedAt == nil || page.Items[0].PurgeAfter == nil {
		t.Fatalf("Trash page = %+v", page)
	}
	otherPage, err := trashService.List(ctx, otherOwnerID, "", 20)
	if err != nil || len(otherPage.Items) != 0 {
		t.Fatalf("cross-owner Trash page=%+v error=%v", otherPage, err)
	}

	retry, err := trashService.MoveToTrash(ctx, ownerID, item.ID, "move-1")
	if err != nil {
		t.Fatal(err)
	}
	if retry.Applied || retry.TrashBytes != move.TrashBytes {
		t.Fatalf("move retry = %+v", retry)
	}
	if _, err := trashService.Restore(
		ctx, ownerID, item.ID, "move-1",
	); !errors.Is(err, trashdomain.ErrIdempotencyConflict) {
		t.Fatalf("reused operation ID error = %v", err)
	}

	if _, err := trashService.Restore(
		ctx, otherOwnerID, item.ID, "cross-owner-restore",
	); !errors.Is(err, trashdomain.ErrNotFound) {
		t.Fatalf("cross-owner restore error = %v", err)
	}

	restore, err := trashService.Restore(ctx, ownerID, item.ID, "restore-1")
	if err != nil {
		t.Fatal(err)
	}
	if !restore.Applied || restore.UsedBytes != item.SizeBytes || restore.TrashBytes != 0 {
		t.Fatalf("restore result = %+v", restore)
	}
	restoreRetry, err := trashService.Restore(ctx, ownerID, item.ID, "restore-1")
	if err != nil {
		t.Fatal(err)
	}
	if restoreRetry.Applied {
		t.Fatalf("restore retry applied twice: %+v", restoreRetry)
	}

	var (
		status                      string
		deletedAt, purgeAfter       *time.Time
		usedBytes, trashBytes       int64
		ledgerCount, operationCount int
		auditCount                  int
		ledgerUsed, ledgerTrash     int64
	)
	err = pool.QueryRow(ctx, `
		SELECT
			item.status::TEXT,
			item.deleted_at,
			item.purge_after,
			quota.used_bytes,
			quota.trash_bytes,
			(SELECT COUNT(*) FROM cloud.usage_ledger WHERE drive_id = item.drive_id),
			(SELECT COUNT(*) FROM cloud.item_lifecycle_operations WHERE drive_id = item.drive_id),
			(SELECT COUNT(*) FROM cloud.audit_logs WHERE drive_id = item.drive_id),
			(SELECT COALESCE(SUM(delta_used_bytes), 0) FROM cloud.usage_ledger WHERE drive_id = item.drive_id),
			(SELECT COALESCE(SUM(delta_trash_bytes), 0) FROM cloud.usage_ledger WHERE drive_id = item.drive_id)
		FROM cloud.items AS item
		JOIN cloud.quotas AS quota ON quota.drive_id = item.drive_id
		WHERE item.id = $1
	`, item.ID).Scan(
		&status,
		&deletedAt,
		&purgeAfter,
		&usedBytes,
		&trashBytes,
		&ledgerCount,
		&operationCount,
		&auditCount,
		&ledgerUsed,
		&ledgerTrash,
	)
	if err != nil {
		t.Fatal(err)
	}
	if status != "ready" || deletedAt != nil || purgeAfter != nil ||
		usedBytes != item.SizeBytes || trashBytes != 0 ||
		ledgerCount != 3 || operationCount != 2 || auditCount != 2 ||
		ledgerUsed != usedBytes || ledgerTrash != trashBytes {
		t.Fatalf(
			"state=%s deleted=%v purge=%v quota=%d/%d evidence=%d/%d/%d ledger=%d/%d",
			status, deletedAt, purgeAfter, usedBytes, trashBytes,
			ledgerCount, operationCount, auditCount, ledgerUsed, ledgerTrash,
		)
	}
}

func TestTrashPostgresRollsBackEveryEvidenceWriteOnQuotaFailure(t *testing.T) {
	pool := integrationPool(t)
	now := time.Date(2026, 8, 4, 8, 0, 0, 0, time.UTC)
	cloudService, trashService := newTrashIntegrationServices(t, pool, now)
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	ctx := context.Background()
	item, err := cloudService.CreateText(ctx, ownerID, "atomic rollback")
	if err != nil {
		t.Fatal(err)
	}
	quota, err := cloudService.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		UPDATE cloud.quotas
		SET version = 9223372036854775807
		WHERE drive_id = $1
	`, quota.DriveID); err != nil {
		t.Fatal(err)
	}

	if _, err := trashService.MoveToTrash(
		ctx, ownerID, item.ID, "rollback-move",
	); err == nil {
		t.Fatal("expected quota version overflow")
	}

	var status string
	var trashBytes int64
	var lifecycleLedger, lifecycleAudit, lifecycleOperation int
	err = pool.QueryRow(ctx, `
		SELECT
			item.status::TEXT,
			quota.trash_bytes,
			(SELECT COUNT(*) FROM cloud.usage_ledger
			 WHERE drive_id = item.drive_id AND event_type = 'trash'),
			(SELECT COUNT(*) FROM cloud.audit_logs
			 WHERE drive_id = item.drive_id),
			(SELECT COUNT(*) FROM cloud.item_lifecycle_operations
			 WHERE drive_id = item.drive_id)
		FROM cloud.items AS item
		JOIN cloud.quotas AS quota ON quota.drive_id = item.drive_id
		WHERE item.id = $1
	`, item.ID).Scan(
		&status,
		&trashBytes,
		&lifecycleLedger,
		&lifecycleAudit,
		&lifecycleOperation,
	)
	if err != nil {
		t.Fatal(err)
	}
	if status != "ready" || trashBytes != 0 ||
		lifecycleLedger != 0 || lifecycleAudit != 0 || lifecycleOperation != 0 {
		t.Fatalf(
			"rollback state=%s trash=%d ledger/audit/operation=%d/%d/%d",
			status, trashBytes, lifecycleLedger, lifecycleAudit, lifecycleOperation,
		)
	}
}

func TestTrashPostgresRestoreRejectsExpiredItemWithoutMutation(t *testing.T) {
	pool := integrationPool(t)
	moveTime := time.Date(2026, 8, 1, 8, 0, 0, 0, time.UTC)
	cloudService, moveService := newTrashIntegrationServices(t, pool, moveTime)
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	ctx := context.Background()
	item, err := cloudService.CreateText(ctx, ownerID, "expired restore")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := moveService.MoveToTrash(ctx, ownerID, item.ID, "move-expired"); err != nil {
		t.Fatal(err)
	}

	trashRepository, _ := NewTrashPostgres(pool)
	restoreService, _ := trashdomain.NewService(
		trashRepository,
		func() time.Time { return moveTime.Add(trashdomain.Retention) },
	)
	if _, err := restoreService.Restore(
		ctx, ownerID, item.ID, "restore-expired",
	); !errors.Is(err, trashdomain.ErrRestoreExpired) {
		t.Fatalf("expired restore error = %v", err)
	}

	var status string
	var trashBytes int64
	var restoreEvidence int
	err = pool.QueryRow(ctx, `
		SELECT item.status::TEXT, quota.trash_bytes,
		       (SELECT COUNT(*) FROM cloud.item_lifecycle_operations
		        WHERE drive_id = item.drive_id AND action = 'restore')
		FROM cloud.items AS item
		JOIN cloud.quotas AS quota ON quota.drive_id = item.drive_id
		WHERE item.id = $1
	`, item.ID).Scan(&status, &trashBytes, &restoreEvidence)
	if err != nil {
		t.Fatal(err)
	}
	if status != "trashed" || trashBytes != item.SizeBytes || restoreEvidence != 0 {
		t.Fatalf("expired state=%s trash=%d evidence=%d", status, trashBytes, restoreEvidence)
	}
}

func TestTrashPostgresConcurrentSamePurgeReleasesQuotaOnce(t *testing.T) {
	pool := integrationPool(t)
	now := time.Date(2026, 8, 4, 8, 0, 0, 0, time.UTC)
	cloudService, trashService := newTrashIntegrationServices(t, pool, now)
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	ctx := context.Background()
	item, err := cloudService.CreateText(ctx, ownerID, "purge once")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := trashService.MoveToTrash(ctx, ownerID, item.ID, "move-before-purge"); err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	results := make(chan trashdomain.Result, 2)
	errorsChannel := make(chan error, 2)
	var waitGroup sync.WaitGroup
	for range 2 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			result, callErr := trashService.PermanentlyDelete(
				context.Background(), ownerID, item.ID, "same-purge", trashdomain.ItemStateTrashed, false,
			)
			results <- result
			errorsChannel <- callErr
		}()
	}
	close(start)
	waitGroup.Wait()
	close(results)
	close(errorsChannel)

	for callErr := range errorsChannel {
		if callErr != nil {
			t.Fatalf("concurrent purge: %v", callErr)
		}
	}
	applied := 0
	for result := range results {
		if result.Applied {
			applied++
		}
	}
	if applied != 1 {
		t.Fatalf("applied purge count = %d, want 1", applied)
	}

	assertPurgedQuotaEvidence(t, pool, ownerID, item.ID, 2, 2, 0)
}

func TestTrashPostgresActiveFilePurgeQueuesObjectDeletion(t *testing.T) {
	pool := integrationPool(t)
	now := time.Date(2026, 8, 4, 8, 0, 0, 0, time.UTC)
	cloudService, trashService := newTrashIntegrationServices(t, pool, now)
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	ctx := context.Background()
	quota, err := cloudService.GetQuota(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	itemID := uuid.New()
	objectID := uuid.New()
	const billableBytes int64 = 17
	_, err = pool.Exec(ctx, `
		INSERT INTO cloud.storage_objects (
			id, drive_id, bucket, object_key, original_name, content_type,
			declared_size_bytes, actual_size_bytes, status, uploaded_at, verified_at
		) VALUES ($1, $2, 'hacom-cloud-private', $3, 'purge.bin',
		          'application/octet-stream', $4, $4, 'ready', NOW(), NOW())
	`, objectID, quota.DriveID, "purge/"+objectID.String(), billableBytes)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO cloud.items (
			id, drive_id, item_type, status, title, storage_object_id,
			size_bytes, billable_bytes, source_type
		) VALUES ($1, $2, 'file', 'ready', 'purge.bin', $3, $4, $4, 'cloud_upload')
	`, itemID, quota.DriveID, objectID, billableBytes)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		UPDATE cloud.quotas SET used_bytes = used_bytes + $1 WHERE drive_id = $2
	`, billableBytes, quota.DriveID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO cloud.usage_ledger (
			drive_id, item_id, event_type, delta_used_bytes, idempotency_key
		) VALUES ($1, $2, 'consume', $3, 'seed-active-file-purge')
	`, quota.DriveID, itemID, billableBytes)
	if err != nil {
		t.Fatal(err)
	}

	result, err := trashService.PermanentlyDelete(
		ctx, ownerID, itemID, "purge-active-file", trashdomain.ItemStateReady, false,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Applied || !result.StorageDeletion {
		t.Fatalf("file purge result = %+v", result)
	}
	retry, err := trashService.DeleteImmediately(ctx, ownerID, itemID, "purge-active-file")
	if err != nil || retry.Applied || !retry.StorageDeletion {
		t.Fatalf("idempotent file purge retry=%+v error=%v", retry, err)
	}
	if _, err := trashService.DeleteImmediately(
		ctx, ownerID, itemID, "different-delete-operation",
	); !errors.Is(err, trashdomain.ErrDeletePending) {
		t.Fatalf("different delete while Worker is pending error=%v", err)
	}

	var objectStatus, jobStatus string
	var jobItemID *uuid.UUID
	err = pool.QueryRow(ctx, `
		SELECT object.status::TEXT, job.status::TEXT, job.item_id
		FROM cloud.storage_objects AS object
		JOIN cloud.jobs AS job ON job.storage_object_id = object.id
		WHERE object.id = $1 AND job.job_type = 'permanent_delete'
	`, objectID).Scan(&objectStatus, &jobStatus, &jobItemID)
	if err != nil {
		t.Fatal(err)
	}
	if objectStatus != "delete_pending" || jobStatus != "pending" || jobItemID != nil {
		t.Fatalf("object/job state = %s/%s item=%v", objectStatus, jobStatus, jobItemID)
	}
	assertPurgedQuotaEvidence(t, pool, ownerID, itemID, 1, 1, 1)
}

func TestTrashPostgresRestoreVersusPurgeOnlyOneTransitionCommits(t *testing.T) {
	pool := integrationPool(t)
	now := time.Date(2026, 8, 4, 8, 0, 0, 0, time.UTC)
	cloudService, trashService := newTrashIntegrationServices(t, pool, now)
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	ctx := context.Background()
	item, err := cloudService.CreateText(ctx, ownerID, "restore purge race")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := trashService.MoveToTrash(ctx, ownerID, item.ID, "race-move"); err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	errorsChannel := make(chan error, 2)
	var waitGroup sync.WaitGroup
	waitGroup.Add(2)
	go func() {
		defer waitGroup.Done()
		<-start
		_, callErr := trashService.Restore(context.Background(), ownerID, item.ID, "race-restore")
		errorsChannel <- callErr
	}()
	go func() {
		defer waitGroup.Done()
		<-start
		_, callErr := trashService.PermanentlyDelete(
			context.Background(), ownerID, item.ID, "race-purge", trashdomain.ItemStateTrashed, false,
		)
		errorsChannel <- callErr
	}()
	close(start)
	waitGroup.Wait()
	close(errorsChannel)

	successes := 0
	failures := 0
	for callErr := range errorsChannel {
		if callErr == nil {
			successes++
			continue
		}
		if errors.Is(callErr, trashdomain.ErrInvalidState) ||
			errors.Is(callErr, trashdomain.ErrNotFound) {
			failures++
			continue
		}
		t.Fatalf("unexpected race error: %v", callErr)
	}
	if successes != 1 || failures != 1 {
		t.Fatalf("race successes/failures = %d/%d", successes, failures)
	}

	var usedBytes, trashBytes, ledgerUsed, ledgerTrash int64
	err = pool.QueryRow(ctx, `
		SELECT
			quota.used_bytes,
			quota.trash_bytes,
			COALESCE(SUM(ledger.delta_used_bytes), 0),
			COALESCE(SUM(ledger.delta_trash_bytes), 0)
		FROM cloud.drives AS drive
		JOIN cloud.quotas AS quota ON quota.drive_id = drive.id
		LEFT JOIN cloud.usage_ledger AS ledger ON ledger.drive_id = drive.id
		WHERE drive.owner_user_id = $1
		GROUP BY quota.drive_id
	`, ownerID).Scan(&usedBytes, &trashBytes, &ledgerUsed, &ledgerTrash)
	if err != nil {
		t.Fatal(err)
	}
	if usedBytes != ledgerUsed || trashBytes != ledgerTrash || trashBytes > usedBytes {
		t.Fatalf("race quota=%d/%d ledger=%d/%d", usedBytes, trashBytes, ledgerUsed, ledgerTrash)
	}
	if !((usedBytes == item.SizeBytes && trashBytes == 0) || (usedBytes == 0 && trashBytes == 0)) {
		t.Fatalf("unexpected race quota=%d/%d", usedBytes, trashBytes)
	}
}

func assertPurgedQuotaEvidence(
	t *testing.T,
	pool *pgxpool.Pool,
	ownerID, itemID uuid.UUID,
	wantOperations, wantAudits, wantJobs int,
) {
	t.Helper()
	var (
		usedBytes, trashBytes, ledgerUsed, ledgerTrash  int64
		itemCount, operationCount, auditCount, jobCount int
	)
	err := pool.QueryRow(context.Background(), `
		SELECT
			quota.used_bytes,
			quota.trash_bytes,
			COALESCE(SUM(ledger.delta_used_bytes), 0),
			COALESCE(SUM(ledger.delta_trash_bytes), 0),
			(SELECT COUNT(*) FROM cloud.items WHERE id = $2),
			(SELECT COUNT(*) FROM cloud.item_lifecycle_operations
			 WHERE drive_id = drive.id),
			(SELECT COUNT(*) FROM cloud.audit_logs WHERE drive_id = drive.id),
			(SELECT COUNT(*) FROM cloud.jobs
			 WHERE drive_id = drive.id AND job_type = 'permanent_delete')
		FROM cloud.drives AS drive
		JOIN cloud.quotas AS quota ON quota.drive_id = drive.id
		LEFT JOIN cloud.usage_ledger AS ledger ON ledger.drive_id = drive.id
		WHERE drive.owner_user_id = $1
		GROUP BY drive.id, quota.drive_id
	`, ownerID, itemID).Scan(
		&usedBytes,
		&trashBytes,
		&ledgerUsed,
		&ledgerTrash,
		&itemCount,
		&operationCount,
		&auditCount,
		&jobCount,
	)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal(err)
	}
	if usedBytes != 0 || trashBytes != 0 || ledgerUsed != 0 || ledgerTrash != 0 ||
		itemCount != 0 || operationCount != wantOperations || auditCount != wantAudits || jobCount != wantJobs {
		t.Fatalf(
			"purged quota=%d/%d ledger=%d/%d item=%d operation=%d audit=%d job=%d",
			usedBytes, trashBytes, ledgerUsed, ledgerTrash, itemCount,
			operationCount, auditCount, jobCount,
		)
	}
}
