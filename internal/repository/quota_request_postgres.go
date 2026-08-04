package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QuotaRequestPostgres struct {
	pool              *pgxpool.Pool
	defaultQuotaBytes int64
}

func NewQuotaRequestPostgres(pool *pgxpool.Pool, defaultQuotaBytes int64) (*QuotaRequestPostgres, error) {
	if pool == nil {
		return nil, errors.New("PostgreSQL pool is required")
	}
	if defaultQuotaBytes <= 0 {
		return nil, errors.New("default quota must be positive")
	}
	return &QuotaRequestPostgres{pool: pool, defaultQuotaBytes: defaultQuotaBytes}, nil
}

func (r *QuotaRequestPostgres) Create(
	ctx context.Context,
	command quotarequest.CreateCommand,
) (quotarequest.CreateResult, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return quotarequest.CreateResult{}, fmt.Errorf("begin quota-request transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO cloud.drives (owner_user_id)
		VALUES ($1)
		ON CONFLICT (owner_user_id) DO NOTHING
	`, command.OwnerUserID); err != nil {
		return quotarequest.CreateResult{}, fmt.Errorf("ensure quota-request drive: %w", err)
	}
	var driveID uuid.UUID
	var driveStatus string
	if err := tx.QueryRow(ctx, `
		SELECT id, status::text
		FROM cloud.drives
		WHERE owner_user_id=$1
		FOR UPDATE
	`, command.OwnerUserID).Scan(&driveID, &driveStatus); err != nil {
		return quotarequest.CreateResult{}, fmt.Errorf("lock quota-request drive: %w", err)
	}
	if driveStatus != cloud.DriveStatusActive {
		return quotarequest.CreateResult{}, cloud.ErrDriveNotActive
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO cloud.quotas (drive_id, quota_bytes)
		VALUES ($1, $2)
		ON CONFLICT (drive_id) DO NOTHING
	`, driveID, r.defaultQuotaBytes); err != nil {
		return quotarequest.CreateResult{}, fmt.Errorf("ensure quota-request quota: %w", err)
	}
	var currentQuotaBytes int64
	if err := tx.QueryRow(ctx, `
		SELECT quota_bytes
		FROM cloud.quotas
		WHERE drive_id=$1
		FOR UPDATE
	`, driveID).Scan(&currentQuotaBytes); err != nil {
		return quotarequest.CreateResult{}, fmt.Errorf("lock quota-request quota: %w", err)
	}

	existing, err := scanQuotaRequest(tx.QueryRow(ctx, `
		SELECT id, drive_id, requested_by_user_id, status::text,
		       current_quota_bytes, requested_quota_bytes, reason, created_at, updated_at
		FROM cloud.quota_requests
		WHERE drive_id=$1 AND idempotency_key=$2
		FOR UPDATE
	`, driveID, command.IdempotencyKey))
	if err == nil {
		if existing.RequestedQuotaBytes != command.RequestedQuotaBytes ||
			!sameOptionalString(existing.Reason, command.Reason) {
			return quotarequest.CreateResult{}, quotarequest.ErrIdempotencyConflict
		}
		if err := tx.Commit(ctx); err != nil {
			return quotarequest.CreateResult{}, fmt.Errorf("commit quota-request retry: %w", err)
		}
		return quotarequest.CreateResult{Request: existing, Applied: false}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return quotarequest.CreateResult{}, fmt.Errorf("read quota-request idempotency record: %w", err)
	}

	var pendingID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id
		FROM cloud.quota_requests
		WHERE drive_id=$1 AND status='pending'
		FOR UPDATE
	`, driveID).Scan(&pendingID)
	if err == nil {
		return quotarequest.CreateResult{}, quotarequest.ErrPendingExists
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return quotarequest.CreateResult{}, fmt.Errorf("lock current pending quota request: %w", err)
	}
	if command.RequestedQuotaBytes <= currentQuotaBytes {
		return quotarequest.CreateResult{}, fmt.Errorf("%w: requested quota must exceed current quota", quotarequest.ErrInvalidInput)
	}

	request, err := scanQuotaRequest(tx.QueryRow(ctx, `
		INSERT INTO cloud.quota_requests (
			drive_id, requested_by_user_id, current_quota_bytes,
			requested_quota_bytes, idempotency_key, reason
		)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, drive_id, requested_by_user_id, status::text,
		          current_quota_bytes, requested_quota_bytes, reason, created_at, updated_at
	`, driveID, command.OwnerUserID, currentQuotaBytes, command.RequestedQuotaBytes,
		command.IdempotencyKey, command.Reason))
	if err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			switch postgresError.ConstraintName {
			case "cloud_quota_requests_one_pending_per_drive_uq":
				return quotarequest.CreateResult{}, quotarequest.ErrPendingExists
			case "cloud_quota_requests_idempotency_uq":
				return quotarequest.CreateResult{}, quotarequest.ErrIdempotencyConflict
			}
		}
		return quotarequest.CreateResult{}, fmt.Errorf("insert quota request: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO cloud.audit_logs (
			actor_user_id, actor_type, action, entity_type, entity_id, drive_id, metadata
		)
		VALUES ($1,'user','cloud.quota_request.created','quota_request',$2,$3,
			jsonb_build_object(
				'currentQuotaBytes',$4::bigint,
				'requestedQuotaBytes',$5::bigint,
				'reasonPresent',$6::boolean
			)
		)
	`, command.OwnerUserID, request.ID, driveID, currentQuotaBytes,
		command.RequestedQuotaBytes, command.Reason != nil); err != nil {
		return quotarequest.CreateResult{}, fmt.Errorf("audit quota request: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO cloud.outbox_events (
			aggregate_type, aggregate_id, event_type, payload
		)
		VALUES ('quota_request',$1,'cloud.quota_request.created',
			jsonb_build_object(
				'requestId',$1::uuid,
				'driveId',$2::uuid,
				'requestedByUserId',$3::uuid,
				'currentQuotaBytes',$4::bigint,
				'requestedQuotaBytes',$5::bigint
			)
		)
	`, request.ID, driveID, command.OwnerUserID, currentQuotaBytes,
		command.RequestedQuotaBytes); err != nil {
		return quotarequest.CreateResult{}, fmt.Errorf("enqueue quota-request outbox event: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return quotarequest.CreateResult{}, fmt.Errorf("commit quota request: %w", err)
	}
	return quotarequest.CreateResult{Request: request, Applied: true}, nil
}

func (r *QuotaRequestPostgres) Current(
	ctx context.Context,
	ownerUserID uuid.UUID,
) (quotarequest.Request, error) {
	request, err := scanQuotaRequest(r.pool.QueryRow(ctx, `
		SELECT request.id, request.drive_id, request.requested_by_user_id, request.status::text,
		       request.current_quota_bytes, request.requested_quota_bytes, request.reason,
		       request.created_at, request.updated_at
		FROM cloud.drives AS drive
		JOIN cloud.quota_requests AS request ON request.drive_id=drive.id
		WHERE drive.owner_user_id=$1
		ORDER BY request.created_at DESC, request.id DESC
		LIMIT 1
	`, ownerUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return quotarequest.Request{}, quotarequest.ErrNotFound
	}
	if err != nil {
		return quotarequest.Request{}, fmt.Errorf("get current quota request: %w", err)
	}
	return request, nil
}

func scanQuotaRequest(row pgx.Row) (quotarequest.Request, error) {
	var request quotarequest.Request
	var status string
	var reason pgtype.Text
	if err := row.Scan(
		&request.ID, &request.DriveID, &request.RequestedByUserID, &status,
		&request.CurrentQuotaBytes, &request.RequestedQuotaBytes, &reason,
		&request.CreatedAt, &request.UpdatedAt,
	); err != nil {
		return quotarequest.Request{}, err
	}
	request.Status = quotarequest.Status(status)
	request.Reason = optionalString(reason)
	return request, nil
}

func sameOptionalString(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return strings.TrimSpace(*left) == strings.TrimSpace(*right)
}
