package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	cloudaudit "github.com/Nguyenphuc0312/hacom-cloud-service/internal/audit"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker/handlers"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PermanentDeletePostgres struct {
	pool      *pgxpool.Pool
	lifecycle *TrashPostgres
	now       func() time.Time
}

var _ handlers.PermanentDeleteRepository = (*PermanentDeletePostgres)(nil)

func NewPermanentDeletePostgres(pool *pgxpool.Pool) (*PermanentDeletePostgres, error) {
	if pool == nil {
		return nil, errors.New("PostgreSQL pool is required")
	}
	lifecycle, err := NewTrashPostgres(pool)
	if err != nil {
		return nil, err
	}
	return &PermanentDeletePostgres{pool: pool, lifecycle: lifecycle, now: time.Now}, nil
}

func (r *PermanentDeletePostgres) EnqueueExpiredTrashJobs(
	ctx context.Context,
	limit int,
) (int, error) {
	if limit <= 0 {
		return 0, errors.New("Trash scan limit must be positive")
	}

	rows, err := r.pool.Query(ctx, `
		SELECT item.id, drive.owner_user_id
		FROM cloud.items AS item
		JOIN cloud.drives AS drive ON drive.id = item.drive_id
		WHERE item.status = 'trashed'
		  AND item.purge_after <= NOW()
		ORDER BY item.purge_after, item.id
		LIMIT $1
	`, limit)
	if err != nil {
		return 0, fmt.Errorf("scan expired Trash items: %w", err)
	}
	type candidate struct {
		itemID  uuid.UUID
		ownerID uuid.UUID
	}
	candidates := make([]candidate, 0, limit)
	for rows.Next() {
		var value candidate
		if err := rows.Scan(&value.itemID, &value.ownerID); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan expired Trash candidate: %w", err)
		}
		candidates = append(candidates, value)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, fmt.Errorf("iterate expired Trash candidates: %w", err)
	}
	rows.Close()

	purged := 0
	for _, value := range candidates {
		occurredAt := r.now().UTC()
		result, err := r.lifecycle.LogicalPurge(ctx, trashdomain.PurgeCommand{
			Command: trashdomain.Command{
				OwnerUserID: value.ownerID,
				ItemID:      value.itemID,
				OperationID: "worker-expired-purge:" + value.itemID.String(),
				OccurredAt:  occurredAt,
			},
			ExpectedState:  trashdomain.ItemStateTrashed,
			RequireExpired: true,
		})
		if errors.Is(err, trashdomain.ErrNotFound) ||
			errors.Is(err, trashdomain.ErrInvalidState) {
			// Restore or another scanner won the row-lock race.
			continue
		}
		if err != nil {
			return purged, fmt.Errorf("purge expired Trash item %s: %w", value.itemID, err)
		}
		if result.Applied {
			purged++
		}
	}
	return purged, nil
}

func (r *PermanentDeletePostgres) GetPermanentDeleteTarget(
	ctx context.Context,
	jobID uuid.UUID,
) (handlers.PermanentDeleteTarget, error) {
	var (
		target       handlers.PermanentDeleteTarget
		jobStatus    string
		objectStatus string
	)
	err := r.pool.QueryRow(ctx, `
		SELECT
			job.id, job.drive_id, object.id, object.object_key,
			job.status::TEXT, object.status::TEXT
		FROM cloud.jobs AS job
		JOIN cloud.storage_objects AS object
		  ON object.id = job.storage_object_id
		 AND object.drive_id = job.drive_id
		WHERE job.id = $1 AND job.job_type = 'permanent_delete'
	`, jobID).Scan(
		&target.JobID,
		&target.DriveID,
		&target.StorageObjectID,
		&target.ObjectKey,
		&jobStatus,
		&objectStatus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return handlers.PermanentDeleteTarget{}, handlers.ErrPermanentDeleteTargetNotFound
	}
	if err != nil {
		return handlers.PermanentDeleteTarget{}, fmt.Errorf("query permanent delete target: %w", err)
	}
	if jobStatus != "processing" {
		return handlers.PermanentDeleteTarget{}, fmt.Errorf(
			"%w: job status is %q",
			handlers.ErrPermanentDeleteTargetState,
			jobStatus,
		)
	}
	switch objectStatus {
	case "delete_pending":
		return target, nil
	case "deleted":
		target.AlreadyFinalized = true
		return target, nil
	default:
		return handlers.PermanentDeleteTarget{}, fmt.Errorf(
			"%w: object status is %q",
			handlers.ErrPermanentDeleteTargetState,
			objectStatus,
		)
	}
}

func (r *PermanentDeletePostgres) FinalizePermanentDelete(
	ctx context.Context,
	jobID uuid.UUID,
	missingObject bool,
) (bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, fmt.Errorf("begin permanent delete finalize transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var driveID, objectID uuid.UUID
	var jobStatus string
	err = tx.QueryRow(ctx, `
		SELECT drive_id, storage_object_id, status::TEXT
		FROM cloud.jobs
		WHERE id = $1 AND job_type = 'permanent_delete'
		FOR UPDATE
	`, jobID).Scan(&driveID, &objectID, &jobStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, handlers.ErrPermanentDeleteTargetNotFound
	}
	if err != nil {
		return false, fmt.Errorf("lock permanent delete job: %w", err)
	}
	if jobStatus != "processing" {
		return false, fmt.Errorf(
			"%w: job status is %q",
			handlers.ErrPermanentDeleteTargetState,
			jobStatus,
		)
	}

	var objectStatus string
	err = tx.QueryRow(ctx, `
		SELECT status::TEXT
		FROM cloud.storage_objects
		WHERE id = $1 AND drive_id = $2
		FOR UPDATE
	`, objectID, driveID).Scan(&objectStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, handlers.ErrPermanentDeleteTargetNotFound
	}
	if err != nil {
		return false, fmt.Errorf("lock permanent delete object: %w", err)
	}
	if objectStatus == "deleted" {
		if err := tx.Commit(ctx); err != nil {
			return false, fmt.Errorf("commit idempotent permanent delete finalize: %w", err)
		}
		return false, nil
	}
	if objectStatus != "delete_pending" {
		return false, fmt.Errorf(
			"%w: object status is %q",
			handlers.ErrPermanentDeleteTargetState,
			objectStatus,
		)
	}

	command, err := tx.Exec(ctx, `
		UPDATE cloud.storage_objects
		SET status = 'deleted',
		    delete_requested_at = COALESCE(delete_requested_at, NOW()),
		    deleted_at = NOW()
		WHERE id = $1 AND drive_id = $2 AND status = 'delete_pending'
	`, objectID, driveID)
	if err != nil {
		return false, fmt.Errorf("finalize deleted storage object: %w", err)
	}
	if command.RowsAffected() != 1 {
		return false, handlers.ErrPermanentDeleteTargetState
	}
	err = cloudaudit.Append(ctx, tx, cloudaudit.Entry{ActorType: "worker", RequestID: jobID.String(), Action: "cloud.object.permanent_delete.completed", EntityType: "storage_object", EntityID: objectID, DriveID: driveID, Metadata: map[string]any{"object_missing": missingObject, "recovery_safe": true}, AppendOnce: true})
	if err != nil {
		return false, fmt.Errorf("append permanent delete audit: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit permanent delete finalize: %w", err)
	}
	return true, nil
}
