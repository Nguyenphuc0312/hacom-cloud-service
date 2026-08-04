package repository

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	cloudaudit "github.com/Nguyenphuc0312/hacom-cloud-service/internal/audit"
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

func (r *QuotaRequestPostgres) AdminList(ctx context.Context, filter quotarequest.AdminListFilter) (quotarequest.AdminPage, error) {
	var cursorTime time.Time
	var cursorID uuid.UUID
	if filter.Cursor != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(filter.Cursor)
		parts := strings.Split(string(decoded), "|")
		if err != nil || len(parts) != 3 || parts[0] != string(filter.Status) {
			return quotarequest.AdminPage{}, quotarequest.ErrInvalidInput
		}
		cursorTime, err = time.Parse(time.RFC3339Nano, parts[1])
		if err != nil {
			return quotarequest.AdminPage{}, quotarequest.ErrInvalidInput
		}
		cursorID, err = uuid.Parse(parts[2])
		if err != nil || cursorID == uuid.Nil {
			return quotarequest.AdminPage{}, quotarequest.ErrInvalidInput
		}
	}
	rows, err := r.pool.Query(ctx, `
		SELECT request.id, request.drive_id, request.requested_by_user_id, request.status::text,
		       request.current_quota_bytes, request.requested_quota_bytes, request.reason,
		       request.reviewed_by_user_id, request.reviewed_at, request.review_note,
		       request.review_operation_id, request.created_at, request.updated_at,
		       drive.owner_user_id, quota.quota_bytes, quota.used_bytes,
		       quota.reserved_bytes, quota.trash_bytes
		FROM cloud.quota_requests AS request
		JOIN cloud.drives AS drive ON drive.id=request.drive_id
		JOIN cloud.quotas AS quota ON quota.drive_id=request.drive_id
		WHERE ($1::text = '' OR request.status::text=$1)
		  AND ($2::timestamptz IS NULL OR (request.created_at, request.id) < ($2, $3))
		ORDER BY request.created_at DESC, request.id DESC
		LIMIT $4
	`, string(filter.Status), optionalTime(cursorTime), optionalUUID(cursorID), filter.Limit+1)
	if err != nil {
		return quotarequest.AdminPage{}, fmt.Errorf("list admin quota requests: %w", err)
	}
	defer rows.Close()
	items := make([]quotarequest.AdminListItem, 0, filter.Limit)
	for rows.Next() {
		item, err := scanAdminQuotaRequest(rows)
		if err != nil {
			return quotarequest.AdminPage{}, fmt.Errorf("scan admin quota request: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return quotarequest.AdminPage{}, fmt.Errorf("iterate admin quota requests: %w", err)
	}
	page := quotarequest.AdminPage{Items: items}
	if len(items) > filter.Limit {
		last := items[filter.Limit-1]
		page.Items = items[:filter.Limit]
		page.NextCursor = base64.RawURLEncoding.EncodeToString([]byte(string(filter.Status) + "|" + last.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID.String()))
	}
	return page, nil
}

func (r *QuotaRequestPostgres) Review(ctx context.Context, command quotarequest.ReviewCommand) (quotarequest.ReviewResult, error) {
	var driveID uuid.UUID
	if err := r.pool.QueryRow(ctx, `SELECT drive_id FROM cloud.quota_requests WHERE id=$1`, command.RequestID).Scan(&driveID); errors.Is(err, pgx.ErrNoRows) {
		return quotarequest.ReviewResult{}, quotarequest.ErrNotFound
	} else if err != nil {
		return quotarequest.ReviewResult{}, fmt.Errorf("resolve quota-request drive: %w", err)
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return quotarequest.ReviewResult{}, fmt.Errorf("begin quota review: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `SELECT id FROM cloud.drives WHERE id=$1 FOR UPDATE`, driveID); err != nil {
		return quotarequest.ReviewResult{}, fmt.Errorf("lock review drive: %w", err)
	}
	var quotaBytes, usedBytes, reservedBytes, trashBytes int64
	if err = tx.QueryRow(ctx, `SELECT quota_bytes, used_bytes, reserved_bytes, trash_bytes FROM cloud.quotas WHERE drive_id=$1 FOR UPDATE`, driveID).Scan(&quotaBytes, &usedBytes, &reservedBytes, &trashBytes); err != nil {
		return quotarequest.ReviewResult{}, fmt.Errorf("lock review quota: %w", err)
	}
	item, err := scanAdminQuotaRequest(tx.QueryRow(ctx, `
		SELECT request.id, request.drive_id, request.requested_by_user_id, request.status::text,
		       request.current_quota_bytes, request.requested_quota_bytes, request.reason,
		       request.reviewed_by_user_id, request.reviewed_at, request.review_note,
		       request.review_operation_id, request.created_at, request.updated_at,
		       drive.owner_user_id, quota.quota_bytes, quota.used_bytes, quota.reserved_bytes, quota.trash_bytes
		FROM cloud.quota_requests request JOIN cloud.drives drive ON drive.id=request.drive_id
		JOIN cloud.quotas quota ON quota.drive_id=request.drive_id WHERE request.id=$1 FOR UPDATE OF request
	`, command.RequestID))
	if errors.Is(err, pgx.ErrNoRows) {
		return quotarequest.ReviewResult{}, quotarequest.ErrNotFound
	}
	if err != nil {
		return quotarequest.ReviewResult{}, fmt.Errorf("lock quota request: %w", err)
	}
	if item.Status != quotarequest.StatusPending {
		if item.ReviewOperationID != nil && *item.ReviewOperationID == command.OperationID && item.Status == command.Decision && sameOptionalString(item.ReviewNote, command.Note) {
			if err := tx.Commit(ctx); err != nil {
				return quotarequest.ReviewResult{}, fmt.Errorf("commit review retry: %w", err)
			}
			return quotarequest.ReviewResult{Item: item, Applied: false}, nil
		}
		if item.ReviewOperationID != nil && *item.ReviewOperationID == command.OperationID {
			return quotarequest.ReviewResult{}, quotarequest.ErrReviewConflict
		}
		return quotarequest.ReviewResult{}, quotarequest.ErrInvalidState
	}
	if command.Decision == quotarequest.StatusApproved && item.RequestedQuotaBytes < usedBytes+reservedBytes {
		return quotarequest.ReviewResult{}, quotarequest.ErrQuotaBelowUsage
	}
	previousQuotaBytes := quotaBytes
	if command.Decision == quotarequest.StatusApproved && item.RequestedQuotaBytes < quotaBytes {
		return quotarequest.ReviewResult{}, quotarequest.ErrInvalidState
	}
	if command.Decision == quotarequest.StatusApproved {
		if _, err = tx.Exec(ctx, `UPDATE cloud.quotas SET quota_bytes=$2 WHERE drive_id=$1`, driveID, item.RequestedQuotaBytes); err != nil {
			return quotarequest.ReviewResult{}, fmt.Errorf("apply reviewed quota: %w", err)
		}
		quotaBytes = item.RequestedQuotaBytes
	}
	item, err = scanAdminQuotaRequest(tx.QueryRow(ctx, `
		UPDATE cloud.quota_requests AS request SET status=$2, reviewed_by_user_id=$3, reviewed_at=NOW(), review_note=$4, review_operation_id=$5
		WHERE request.id=$1
		RETURNING id, drive_id, requested_by_user_id, status::text, current_quota_bytes,
		 requested_quota_bytes, reason, reviewed_by_user_id, reviewed_at, review_note,
		 review_operation_id, created_at, updated_at,
		 (SELECT owner_user_id FROM cloud.drives WHERE id=request.drive_id), $6::bigint, $7::bigint, $8::bigint, $9::bigint
	`, command.RequestID, command.Decision, command.ActorUserID, command.Note, command.OperationID, quotaBytes, usedBytes, reservedBytes, trashBytes))
	if err != nil {
		return quotarequest.ReviewResult{}, fmt.Errorf("finalize quota review: %w", err)
	}
	if err = cloudaudit.Append(ctx, tx, cloudaudit.Entry{ActorUserID: &command.ActorUserID, ActorType: "admin", RequestID: command.RequestIDTrace, Action: "cloud.quota_request." + string(command.Decision), EntityType: "quota_request", EntityID: command.RequestID, DriveID: driveID, Metadata: map[string]any{"decision": command.Decision, "previousQuotaBytes": previousQuotaBytes, "resultingQuotaBytes": quotaBytes, "usedBytes": usedBytes, "reservedBytes": reservedBytes, "notePresent": command.Note != nil, "operationId": command.OperationID}}); err != nil {
		return quotarequest.ReviewResult{}, fmt.Errorf("audit quota review: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return quotarequest.ReviewResult{}, fmt.Errorf("commit quota review: %w", err)
	}
	return quotarequest.ReviewResult{Item: item, Applied: true}, nil
}

func scanAdminQuotaRequest(row pgx.Row) (quotarequest.AdminListItem, error) {
	var item quotarequest.AdminListItem
	var status string
	var reason, note, operation pgtype.Text
	var reviewer pgtype.UUID
	var reviewedAt pgtype.Timestamptz
	err := row.Scan(&item.ID, &item.DriveID, &item.RequestedByUserID, &status, &item.CurrentQuotaBytes, &item.RequestedQuotaBytes, &reason, &reviewer, &reviewedAt, &note, &operation, &item.CreatedAt, &item.UpdatedAt, &item.OwnerUserID, &item.QuotaBytes, &item.UsedBytes, &item.ReservedBytes, &item.TrashBytes)
	if err != nil {
		return item, err
	}
	item.Status = quotarequest.Status(status)
	item.Reason = optionalString(reason)
	item.ReviewNote = optionalString(note)
	item.ReviewOperationID = optionalString(operation)
	if reviewer.Valid {
		id := uuid.UUID(reviewer.Bytes)
		item.ReviewedByUserID = &id
	}
	if reviewedAt.Valid {
		value := reviewedAt.Time
		item.ReviewedAt = &value
	}
	return item, nil
}

func optionalTime(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value
}
func optionalUUID(value uuid.UUID) any {
	if value == uuid.Nil {
		return nil
	}
	return value
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
	if err := cloudaudit.Append(ctx, tx, cloudaudit.Entry{ActorUserID: &command.OwnerUserID, ActorType: "user", Action: "cloud.quota_request.created", EntityType: "quota_request", EntityID: request.ID, DriveID: driveID, Metadata: map[string]any{"currentQuotaBytes": currentQuotaBytes, "requestedQuotaBytes": command.RequestedQuotaBytes, "reasonPresent": command.Reason != nil}}); err != nil {
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
