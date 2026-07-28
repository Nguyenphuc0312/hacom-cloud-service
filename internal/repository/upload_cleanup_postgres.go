package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker/handlers"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UploadCleanupPostgres struct {
	pool *pgxpool.Pool
}

var _ handlers.CleanupRepository = (*UploadCleanupPostgres)(nil)

func NewUploadCleanupPostgres(pool *pgxpool.Pool) (*UploadCleanupPostgres, error) {
	if pool == nil {
		return nil, errors.New("PostgreSQL pool is required")
	}
	return &UploadCleanupPostgres{pool: pool}, nil
}

func (r *UploadCleanupPostgres) EnqueueExpiredUploadJobs(
	ctx context.Context,
	limit int,
) (int, error) {
	if limit <= 0 {
		return 0, errors.New("cleanup scan limit must be positive")
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin cleanup scan transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var enqueued int
	err = tx.QueryRow(ctx, `
		WITH expired AS (
			SELECT
				session.id,
				session.drive_id,
				session.item_id,
				session.storage_object_id
			FROM cloud.upload_sessions AS session
			WHERE session.status IN ('initiated', 'uploaded', 'completing')
			  AND session.expires_at <= NOW()
			  AND NOT EXISTS (
				SELECT 1
				FROM cloud.jobs AS active_job
				WHERE active_job.job_type = 'cleanup_expired_upload'
				  AND active_job.upload_session_id = session.id
				  AND active_job.status IN ('pending', 'processing', 'failed')
			  )
			ORDER BY session.expires_at, session.id
			FOR UPDATE OF session SKIP LOCKED
			LIMIT $1
		),
		inserted AS (
			INSERT INTO cloud.jobs (
				job_type,
				status,
				drive_id,
				item_id,
				storage_object_id,
				upload_session_id,
				payload,
				dedupe_key
			)
			SELECT
				'cleanup_expired_upload',
				'pending',
				expired.drive_id,
				expired.item_id,
				expired.storage_object_id,
				expired.id,
				jsonb_build_object('session_id', expired.id::text),
				'cleanup_expired_upload:' || expired.id::text
			FROM expired
			ON CONFLICT DO NOTHING
			RETURNING id
		)
		SELECT COUNT(*) FROM inserted
	`, limit).Scan(&enqueued)
	if err != nil {
		return 0, fmt.Errorf("enqueue expired upload jobs: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit cleanup scan: %w", err)
	}
	return enqueued, nil
}

func (r *UploadCleanupPostgres) GetCleanupTarget(
	ctx context.Context,
	sessionID string,
) (handlers.CleanupTarget, error) {
	parsedSessionID, err := uuid.Parse(sessionID)
	if err != nil {
		return handlers.CleanupTarget{}, fmt.Errorf("parse cleanup session ID: %w", err)
	}

	var (
		target  handlers.CleanupTarget
		status  string
		expired bool
	)
	err = r.pool.QueryRow(ctx, `
		SELECT
			session.id::text,
			session.drive_id::text,
			session.item_id::text,
			session.storage_object_id::text,
			object.object_key,
			session.reserved_bytes,
			session.status::text,
			session.expires_at <= NOW()
		FROM cloud.upload_sessions AS session
		JOIN cloud.storage_objects AS object
		  ON object.id = session.storage_object_id
		 AND object.drive_id = session.drive_id
		WHERE session.id = $1
	`, parsedSessionID).Scan(
		&target.SessionID,
		&target.DriveID,
		&target.ItemID,
		&target.StorageObjectID,
		&target.ObjectKey,
		&target.ReservedBytes,
		&status,
		&expired,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return handlers.CleanupTarget{}, handlers.ErrCleanupTargetNotFound
	}
	if err != nil {
		return handlers.CleanupTarget{}, fmt.Errorf("query cleanup target: %w", err)
	}
	if status == "expired" {
		target.AlreadyCleaned = true
		return target, nil
	}
	switch status {
	case "initiated", "uploaded", "completing":
		if !expired {
			return handlers.CleanupTarget{}, handlers.ErrCleanupNotExpired
		}
		return target, nil
	default:
		return handlers.CleanupTarget{}, fmt.Errorf(
			"%w: session status is %q",
			handlers.ErrCleanupNotEligible,
			status,
		)
	}
}

func (r *UploadCleanupPostgres) CompleteCleanup(
	ctx context.Context,
	sessionID string,
) error {
	parsedSessionID, err := uuid.Parse(sessionID)
	if err != nil {
		return fmt.Errorf("parse cleanup session ID: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin upload cleanup transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		driveID       uuid.UUID
		itemID        uuid.UUID
		objectID      uuid.UUID
		status        string
		reservedBytes int64
		expired       bool
	)
	err = tx.QueryRow(ctx, `
		SELECT
			drive_id,
			item_id,
			storage_object_id,
			status::text,
			reserved_bytes,
			expires_at <= NOW()
		FROM cloud.upload_sessions
		WHERE id = $1
		FOR UPDATE
	`, parsedSessionID).Scan(
		&driveID,
		&itemID,
		&objectID,
		&status,
		&reservedBytes,
		&expired,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return handlers.ErrCleanupTargetNotFound
	}
	if err != nil {
		return fmt.Errorf("lock cleanup upload session: %w", err)
	}
	if status == "expired" {
		return tx.Commit(ctx)
	}
	switch status {
	case "initiated", "uploaded", "completing":
		if !expired {
			return handlers.ErrCleanupNotExpired
		}
	default:
		return fmt.Errorf(
			"%w: session status is %q",
			handlers.ErrCleanupNotEligible,
			status,
		)
	}

	var quotaReserved int64
	err = tx.QueryRow(ctx, `
		SELECT reserved_bytes
		FROM cloud.quotas
		WHERE drive_id = $1
		FOR UPDATE
	`, driveID).Scan(&quotaReserved)
	if errors.Is(err, pgx.ErrNoRows) {
		return handlers.ErrCleanupQuotaInvariant
	}
	if err != nil {
		return fmt.Errorf("lock quota for cleanup: %w", err)
	}
	if quotaReserved < reservedBytes {
		return fmt.Errorf(
			"%w: quota has %d reserved bytes, session requires %d",
			handlers.ErrCleanupQuotaInvariant,
			quotaReserved,
			reservedBytes,
		)
	}

	command, err := tx.Exec(ctx, `
		UPDATE cloud.quotas
		SET reserved_bytes = reserved_bytes - $1,
		    version = version + 1
		WHERE drive_id = $2
		  AND reserved_bytes >= $1
	`, reservedBytes, driveID)
	if err != nil {
		return fmt.Errorf("release expired upload quota: %w", err)
	}
	if command.RowsAffected() != 1 {
		return handlers.ErrCleanupQuotaInvariant
	}

	command, err = tx.Exec(ctx, `
		UPDATE cloud.upload_sessions
		SET status = 'expired'
		WHERE id = $1
		  AND status IN ('initiated', 'uploaded', 'completing')
		  AND expires_at <= NOW()
	`, parsedSessionID)
	if err != nil {
		return fmt.Errorf("mark upload session expired: %w", err)
	}
	if command.RowsAffected() != 1 {
		return handlers.ErrCleanupNotEligible
	}
	command, err = tx.Exec(ctx, `
		UPDATE cloud.items
		SET status = 'failed'
		WHERE id = $1
		  AND drive_id = $2
	`, itemID, driveID)
	if err != nil {
		return fmt.Errorf("mark expired upload item failed: %w", err)
	}
	if command.RowsAffected() != 1 {
		return handlers.ErrCleanupTargetNotFound
	}
	command, err = tx.Exec(ctx, `
		UPDATE cloud.storage_objects
		SET status = 'failed'
		WHERE id = $1
		  AND drive_id = $2
	`, objectID, driveID)
	if err != nil {
		return fmt.Errorf("mark expired storage object failed: %w", err)
	}
	if command.RowsAffected() != 1 {
		return handlers.ErrCleanupTargetNotFound
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO cloud.usage_ledger (
			drive_id,
			item_id,
			upload_session_id,
			event_type,
			delta_used_bytes,
			delta_reserved_bytes,
			idempotency_key,
			metadata
		)
		VALUES (
			$1,
			$2,
			$3,
			'release',
			0,
			(-$4::bigint),
			$5,
			jsonb_build_object('reason', 'expired_upload')
		)
	`,
		driveID,
		itemID,
		parsedSessionID,
		reservedBytes,
		"release:expired-upload:"+parsedSessionID.String(),
	)
	if err != nil {
		return fmt.Errorf("append expired upload release ledger: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit upload cleanup: %w", err)
	}
	return nil
}
