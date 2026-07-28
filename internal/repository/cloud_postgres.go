package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CloudPostgres struct {
	pool              *pgxpool.Pool
	defaultQuotaBytes int64
	storageBucket     string
}

type CloudPostgresOption func(*CloudPostgres)

func WithStorageBucket(bucket string) CloudPostgresOption {
	return func(repository *CloudPostgres) {
		if value := strings.TrimSpace(bucket); value != "" {
			repository.storageBucket = value
		}
	}
}

func NewCloudPostgres(
	pool *pgxpool.Pool,
	defaultQuotaBytes int64,
	options ...CloudPostgresOption,
) (*CloudPostgres, error) {
	if pool == nil {
		return nil, errors.New("PostgreSQL pool is required")
	}
	if defaultQuotaBytes <= 0 {
		return nil, errors.New("default quota must be positive")
	}
	repository := &CloudPostgres{
		pool:              pool,
		defaultQuotaBytes: defaultQuotaBytes,
		storageBucket:     "hacom-cloud-private",
	}
	for _, option := range options {
		option(repository)
	}
	return repository, nil
}

func (r *CloudPostgres) CreateText(
	ctx context.Context,
	ownerUserID uuid.UUID,
	content string,
	sizeBytes int64,
) (cloud.Item, error) {
	return r.createItem(ctx, createItemRequest{
		ownerUserID: ownerUserID,
		itemType:    cloud.ItemTypeText,
		textContent: &content,
		sizeBytes:   sizeBytes,
	})
}

func (r *CloudPostgres) CreateLink(
	ctx context.Context,
	ownerUserID uuid.UUID,
	rawURL string,
	title *string,
	sizeBytes int64,
) (cloud.Item, error) {
	return r.createItem(ctx, createItemRequest{
		ownerUserID: ownerUserID,
		itemType:    cloud.ItemTypeLink,
		title:       title,
		linkURL:     &rawURL,
		sizeBytes:   sizeBytes,
	})
}

func (r *CloudPostgres) GetItem(
	ctx context.Context,
	ownerUserID, itemID uuid.UUID,
) (cloud.Item, error) {
	item, err := scanItem(r.pool.QueryRow(ctx, `
		SELECT
			item.id,
			item.drive_id,
			item.item_type::text,
			item.status::text,
			item.title,
			item.text_content,
			item.link_url,
			item.size_bytes,
			item.created_at,
			item.updated_at
		FROM cloud.items AS item
		JOIN cloud.drives AS drive ON drive.id = item.drive_id
		WHERE item.id = $1
		  AND drive.owner_user_id = $2
		  AND item.status <> 'trashed'
	`, itemID, ownerUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return cloud.Item{}, cloud.ErrNotFound
	}
	if err != nil {
		return cloud.Item{}, fmt.Errorf("get cloud item: %w", err)
	}
	return item, nil
}

func (r *CloudPostgres) ListItems(
	ctx context.Context,
	ownerUserID uuid.UUID,
	cursor *cloud.Cursor,
	limit int,
) ([]cloud.Item, bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, false, fmt.Errorf("begin list items transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	drive, err := r.ensureDriveAndQuota(ctx, tx, ownerUserID)
	if err != nil {
		return nil, false, err
	}

	query := `
		SELECT
			id,
			drive_id,
			item_type::text,
			status::text,
			title,
			text_content,
			link_url,
			size_bytes,
			created_at,
			updated_at
		FROM cloud.items
		WHERE drive_id = $1
		  AND status <> 'trashed'
	`
	args := []any{drive.ID}
	if cursor != nil {
		query += ` AND (created_at, id) < ($2, $3)`
		args = append(args, cursor.CreatedAt, cursor.ID)
	}
	query += fmt.Sprintf(
		" ORDER BY created_at DESC, id DESC LIMIT $%d",
		len(args)+1,
	)
	args = append(args, limit+1)

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, false, fmt.Errorf("list cloud items: %w", err)
	}
	defer rows.Close()

	items := make([]cloud.Item, 0, limit+1)
	for rows.Next() {
		item, scanErr := scanItem(rows)
		if scanErr != nil {
			return nil, false, fmt.Errorf("scan cloud item: %w", scanErr)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, false, fmt.Errorf("iterate cloud items: %w", err)
	}

	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, fmt.Errorf("commit list items transaction: %w", err)
	}
	return items, hasMore, nil
}

func (r *CloudPostgres) GetQuota(
	ctx context.Context,
	ownerUserID uuid.UUID,
) (cloud.Quota, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return cloud.Quota{}, fmt.Errorf("begin get quota transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	drive, err := r.ensureDriveAndQuota(ctx, tx, ownerUserID)
	if err != nil {
		return cloud.Quota{}, err
	}

	quota, err := scanQuota(tx.QueryRow(ctx, `
		SELECT drive_id, quota_bytes, used_bytes, reserved_bytes, updated_at
		FROM cloud.quotas
		WHERE drive_id = $1
	`, drive.ID))
	if err != nil {
		return cloud.Quota{}, fmt.Errorf("get cloud quota: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return cloud.Quota{}, fmt.Errorf("commit get quota transaction: %w", err)
	}
	return quota, nil
}

type createItemRequest struct {
	ownerUserID uuid.UUID
	itemType    cloud.ItemType
	title       *string
	textContent *string
	linkURL     *string
	sizeBytes   int64
}

func (r *CloudPostgres) createItem(
	ctx context.Context,
	request createItemRequest,
) (cloud.Item, error) {
	if request.sizeBytes <= 0 {
		return cloud.Item{}, fmt.Errorf("%w: item size must be positive", cloud.ErrInvalidContent)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return cloud.Item{}, fmt.Errorf("begin create item transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	drive, err := r.ensureDriveAndQuota(ctx, tx, request.ownerUserID)
	if err != nil {
		return cloud.Item{}, err
	}
	if drive.Status != cloud.DriveStatusActive {
		return cloud.Item{}, cloud.ErrDriveNotActive
	}

	quota, err := scanQuota(tx.QueryRow(ctx, `
		SELECT drive_id, quota_bytes, used_bytes, reserved_bytes, updated_at
		FROM cloud.quotas
		WHERE drive_id = $1
		FOR UPDATE
	`, drive.ID))
	if err != nil {
		return cloud.Item{}, fmt.Errorf("lock cloud quota: %w", err)
	}
	if quota.UsedBytes+quota.ReservedBytes+request.sizeBytes > quota.LimitBytes {
		return cloud.Item{}, cloud.ErrQuotaExceeded
	}

	itemID := uuid.New()
	item, err := scanItem(tx.QueryRow(ctx, `
		INSERT INTO cloud.items (
			id,
			drive_id,
			item_type,
			status,
			title,
			text_content,
			link_url,
			size_bytes,
			billable_bytes,
			source_type
		)
		VALUES ($1, $2, $3, 'ready', $4, $5, $6, $7, $7, 'manual')
		RETURNING
			id,
			drive_id,
			item_type::text,
			status::text,
			title,
			text_content,
			link_url,
			size_bytes,
			created_at,
			updated_at
	`,
		itemID,
		drive.ID,
		request.itemType,
		request.title,
		request.textContent,
		request.linkURL,
		request.sizeBytes,
	))
	if err != nil {
		return cloud.Item{}, fmt.Errorf("insert cloud item: %w", err)
	}

	command, err := tx.Exec(ctx, `
		UPDATE cloud.quotas
		SET used_bytes = used_bytes + $1,
		    version = version + 1
		WHERE drive_id = $2
		  AND used_bytes + reserved_bytes + $1 <= quota_bytes
	`, request.sizeBytes, drive.ID)
	if err != nil {
		return cloud.Item{}, fmt.Errorf("consume cloud quota: %w", err)
	}
	if command.RowsAffected() != 1 {
		return cloud.Item{}, cloud.ErrQuotaExceeded
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO cloud.usage_ledger (
			drive_id,
			item_id,
			event_type,
			delta_used_bytes,
			delta_reserved_bytes,
			idempotency_key,
			metadata
		)
		VALUES (
			$1,
			$2,
			'consume',
			$3,
			0,
			$4,
			jsonb_build_object('item_type', $5::text)
		)
	`,
		drive.ID,
		item.ID,
		request.sizeBytes,
		"consume:item:"+item.ID.String(),
		request.itemType,
	)
	if err != nil {
		return cloud.Item{}, fmt.Errorf("append quota ledger: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return cloud.Item{}, fmt.Errorf("commit create item transaction: %w", err)
	}
	return item, nil
}

func (r *CloudPostgres) ensureDriveAndQuota(
	ctx context.Context,
	tx pgx.Tx,
	ownerUserID uuid.UUID,
) (cloud.Drive, error) {
	drive, err := scanDrive(tx.QueryRow(ctx, `
		INSERT INTO cloud.drives (owner_user_id)
		VALUES ($1)
		ON CONFLICT (owner_user_id) DO NOTHING
		RETURNING id, owner_user_id, name, status::text, created_at, updated_at
	`, ownerUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		drive, err = scanDrive(tx.QueryRow(ctx, `
			SELECT id, owner_user_id, name, status::text, created_at, updated_at
			FROM cloud.drives
			WHERE owner_user_id = $1
		`, ownerUserID))
	}
	if err != nil {
		return cloud.Drive{}, fmt.Errorf("ensure personal drive: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO cloud.quotas (drive_id, quota_bytes)
		VALUES ($1, $2)
		ON CONFLICT (drive_id) DO NOTHING
	`, drive.ID, r.defaultQuotaBytes)
	if err != nil {
		return cloud.Drive{}, fmt.Errorf("ensure personal quota: %w", err)
	}
	return drive, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanDrive(row rowScanner) (cloud.Drive, error) {
	var drive cloud.Drive
	err := row.Scan(
		&drive.ID,
		&drive.OwnerUserID,
		&drive.Name,
		&drive.Status,
		&drive.CreatedAt,
		&drive.UpdatedAt,
	)
	return drive, err
}

func scanItem(row rowScanner) (cloud.Item, error) {
	var (
		item        cloud.Item
		itemType    string
		status      string
		title       pgtype.Text
		textContent pgtype.Text
		linkURL     pgtype.Text
	)
	err := row.Scan(
		&item.ID,
		&item.DriveID,
		&itemType,
		&status,
		&title,
		&textContent,
		&linkURL,
		&item.SizeBytes,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return cloud.Item{}, err
	}
	item.Type = cloud.ItemType(itemType)
	item.Status = cloud.ItemStatus(status)
	item.Title = optionalString(title)
	item.TextContent = optionalString(textContent)
	item.LinkURL = optionalString(linkURL)
	return item, nil
}

func scanQuota(row rowScanner) (cloud.Quota, error) {
	var quota cloud.Quota
	err := row.Scan(
		&quota.DriveID,
		&quota.LimitBytes,
		&quota.UsedBytes,
		&quota.ReservedBytes,
		&quota.UpdatedAt,
	)
	return quota, err
}

func optionalString(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}
