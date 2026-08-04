package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	cloudaudit "github.com/Nguyenphuc0312/hacom-cloud-service/internal/audit"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TrashPostgres struct {
	pool               *pgxpool.Pool
	searchQueryTimeout time.Duration
}

type TrashPostgresOption func(*TrashPostgres)

func WithTrashSearchQueryTimeout(timeout time.Duration) TrashPostgresOption {
	return func(repository *TrashPostgres) {
		if timeout > 0 {
			repository.searchQueryTimeout = timeout
		}
	}
}

func NewTrashPostgres(pool *pgxpool.Pool, options ...TrashPostgresOption) (*TrashPostgres, error) {
	if pool == nil {
		return nil, errors.New("PostgreSQL pool is required")
	}
	repository := &TrashPostgres{pool: pool, searchQueryTimeout: 2 * time.Second}
	for _, option := range options {
		option(repository)
	}
	return repository, nil
}

func (r *TrashPostgres) ListTrash(
	ctx context.Context,
	ownerUserID uuid.UUID,
	cursor *cloud.Cursor,
	limit int,
	filter cloud.ListFilter,
) ([]cloud.Item, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, r.searchQueryTimeout)
	defer cancel()
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, false, fmt.Errorf("begin list Trash transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := setListStatementTimeout(ctx, tx, r.searchQueryTimeout); err != nil {
		return nil, false, err
	}
	var driveID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id FROM cloud.drives WHERE owner_user_id = $1
	`, ownerUserID).Scan(&driveID)
	if errors.Is(err, pgx.ErrNoRows) {
		return []cloud.Item{}, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("scope Trash owner drive: %w", err)
	}
	query := `
		SELECT
			item.id, item.drive_id, item.item_type::TEXT, item.status::TEXT,
			item.title, item.text_content, item.link_url, item.size_bytes,
			item.deleted_at, item.purge_after, item.created_at, item.updated_at
		FROM cloud.items AS item
		WHERE item.drive_id = $1 AND item.status = 'trashed'
	`
	args := []any{driveID}
	query, args = appendListFilters(query, args, filter, "item")
	if cursor != nil {
		query += fmt.Sprintf(
			" AND (item.created_at, item.id) < ($%d, $%d)",
			len(args)+1, len(args)+2,
		)
		args = append(args, cursor.CreatedAt, cursor.ID)
	}
	query += fmt.Sprintf(
		" ORDER BY item.created_at DESC, item.id DESC LIMIT $%d",
		len(args)+1,
	)
	args = append(args, limit+1)

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, false, fmt.Errorf("list Trash items: %w", err)
	}
	defer rows.Close()

	items := make([]cloud.Item, 0, limit+1)
	for rows.Next() {
		var (
			item                    cloud.Item
			itemType, status        string
			title, content, linkURL pgtype.Text
			deletedAt, purgeAfter   pgtype.Timestamptz
		)
		if err := rows.Scan(
			&item.ID, &item.DriveID, &itemType, &status,
			&title, &content, &linkURL, &item.SizeBytes,
			&deletedAt, &purgeAfter, &item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, false, fmt.Errorf("scan Trash item: %w", err)
		}
		item.Type = cloud.ItemType(itemType)
		item.Status = cloud.ItemStatus(status)
		item.Title = optionalString(title)
		item.TextContent = optionalString(content)
		item.LinkURL = optionalString(linkURL)
		if deletedAt.Valid {
			item.DeletedAt = timePointer(deletedAt.Time)
		}
		if purgeAfter.Valid {
			item.PurgeAfter = timePointer(purgeAfter.Time)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, false, fmt.Errorf("iterate Trash items: %w", err)
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, fmt.Errorf("commit list Trash transaction: %w", err)
	}
	return items, hasMore, nil
}

type lockedLifecycleItem struct {
	itemID          uuid.UUID
	driveID         uuid.UUID
	status          trash.ItemState
	billableBytes   int64
	storageObjectID pgtype.UUID
	deletedAt       pgtype.Timestamptz
	purgeAfter      pgtype.Timestamptz
}

type lockedLifecycleQuota struct {
	usedBytes  int64
	trashBytes int64
}

func (r *TrashPostgres) MoveToTrash(
	ctx context.Context,
	command trash.MoveCommand,
) (trash.Result, error) {
	if command.PurgeAfter.Sub(command.OccurredAt) != trash.Retention {
		return trash.Result{}, fmt.Errorf(
			"%w: purge deadline must be exactly 24 hours",
			trash.ErrInvalidInput,
		)
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return trash.Result{}, fmt.Errorf("begin move-to-trash transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if result, found, err := loadLifecycleOperation(
		ctx, tx, command.OwnerUserID, command.ItemID, command.OperationID, trash.ActionMoveToTrash,
	); err != nil {
		return trash.Result{}, err
	} else if found {
		return commitLifecycleResult(ctx, tx, result)
	}

	item, err := lockLifecycleItem(ctx, tx, command.OwnerUserID, command.ItemID)
	if err != nil {
		return trash.Result{}, err
	}
	quota, err := lockLifecycleQuota(ctx, tx, item.driveID)
	if err != nil {
		return trash.Result{}, err
	}

	if item.status == trash.ItemStateTrashed {
		result := lifecycleNoopResult(trash.ActionMoveToTrash, item, quota)
		return commitLifecycleResult(ctx, tx, result)
	}
	if item.status != trash.ItemStateReady {
		return trash.Result{}, fmt.Errorf(
			"%w: cannot trash item in state %q",
			trash.ErrInvalidState,
			item.status,
		)
	}
	if quota.trashBytes+item.billableBytes > quota.usedBytes {
		return trash.Result{}, fmt.Errorf(
			"%w: trash=%d item=%d used=%d",
			trash.ErrQuotaInvariant,
			quota.trashBytes,
			item.billableBytes,
			quota.usedBytes,
		)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE cloud.items
		SET status = 'trashed', deleted_at = $1, purge_after = $2
		WHERE id = $3
	`, command.OccurredAt, command.PurgeAfter, item.itemID); err != nil {
		return trash.Result{}, fmt.Errorf("mark item trashed: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE cloud.quotas
		SET trash_bytes = trash_bytes + $1, version = version + 1
		WHERE drive_id = $2
	`, item.billableBytes, item.driveID); err != nil {
		return trash.Result{}, fmt.Errorf("move quota bytes to Trash: %w", err)
	}

	result := trash.Result{
		Action:        trash.ActionMoveToTrash,
		ItemID:        item.itemID,
		DriveID:       item.driveID,
		PreviousState: trash.ItemStateReady,
		CurrentState:  statePointer(trash.ItemStateTrashed),
		BillableBytes: item.billableBytes,
		UsedBytes:     quota.usedBytes,
		TrashBytes:    quota.trashBytes + item.billableBytes,
		DeletedAt:     timePointer(command.OccurredAt),
		PurgeAfter:    timePointer(command.PurgeAfter),
		Applied:       true,
	}
	if err := appendLifecycleEvidence(ctx, tx, command.Command, result); err != nil {
		return trash.Result{}, err
	}
	return commitLifecycleResult(ctx, tx, result)
}

func (r *TrashPostgres) Restore(
	ctx context.Context,
	command trash.Command,
) (trash.Result, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return trash.Result{}, fmt.Errorf("begin restore transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if result, found, err := loadLifecycleOperation(
		ctx, tx, command.OwnerUserID, command.ItemID, command.OperationID, trash.ActionRestore,
	); err != nil {
		return trash.Result{}, err
	} else if found {
		return commitLifecycleResult(ctx, tx, result)
	}

	item, err := lockLifecycleItem(ctx, tx, command.OwnerUserID, command.ItemID)
	if err != nil {
		return trash.Result{}, err
	}
	quota, err := lockLifecycleQuota(ctx, tx, item.driveID)
	if err != nil {
		return trash.Result{}, err
	}

	if item.status == trash.ItemStateReady {
		result := lifecycleNoopResult(trash.ActionRestore, item, quota)
		return commitLifecycleResult(ctx, tx, result)
	}
	if item.status != trash.ItemStateTrashed || !item.purgeAfter.Valid {
		return trash.Result{}, fmt.Errorf(
			"%w: cannot restore item in state %q",
			trash.ErrInvalidState,
			item.status,
		)
	}
	if !command.OccurredAt.Before(item.purgeAfter.Time) {
		return trash.Result{}, trash.ErrRestoreExpired
	}
	if quota.trashBytes < item.billableBytes {
		return trash.Result{}, fmt.Errorf(
			"%w: trash=%d item=%d",
			trash.ErrQuotaInvariant,
			quota.trashBytes,
			item.billableBytes,
		)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE cloud.items
		SET status = 'ready', deleted_at = NULL, purge_after = NULL
		WHERE id = $1
	`, item.itemID); err != nil {
		return trash.Result{}, fmt.Errorf("restore item: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE cloud.quotas
		SET trash_bytes = trash_bytes - $1, version = version + 1
		WHERE drive_id = $2
	`, item.billableBytes, item.driveID); err != nil {
		return trash.Result{}, fmt.Errorf("restore quota bytes from Trash: %w", err)
	}

	result := trash.Result{
		Action:        trash.ActionRestore,
		ItemID:        item.itemID,
		DriveID:       item.driveID,
		PreviousState: trash.ItemStateTrashed,
		CurrentState:  statePointer(trash.ItemStateReady),
		BillableBytes: item.billableBytes,
		UsedBytes:     quota.usedBytes,
		TrashBytes:    quota.trashBytes - item.billableBytes,
		Applied:       true,
	}
	if err := appendLifecycleEvidence(ctx, tx, command, result); err != nil {
		return trash.Result{}, err
	}
	return commitLifecycleResult(ctx, tx, result)
}

func (r *TrashPostgres) LogicalPurge(
	ctx context.Context,
	command trash.PurgeCommand,
) (trash.Result, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return trash.Result{}, fmt.Errorf("begin logical purge transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if result, found, err := loadLifecycleOperation(
		ctx, tx, command.OwnerUserID, command.ItemID, command.OperationID, trash.ActionPurge,
	); err != nil {
		return trash.Result{}, err
	} else if found {
		return commitLifecycleResult(ctx, tx, result)
	}

	item, err := lockLifecycleItem(ctx, tx, command.OwnerUserID, command.ItemID)
	if errors.Is(err, trash.ErrNotFound) {
		// A concurrent purge may have deleted the item while this statement was
		// waiting. READ COMMITTED gives this second statement a fresh snapshot.
		if result, found, loadErr := loadLifecycleOperation(
			ctx, tx, command.OwnerUserID, command.ItemID, command.OperationID, trash.ActionPurge,
		); loadErr != nil {
			return trash.Result{}, loadErr
		} else if found {
			return commitLifecycleResult(ctx, tx, result)
		}
		pending, pendingErr := hasPendingObjectDelete(
			ctx, tx, command.OwnerUserID, command.ItemID,
		)
		if pendingErr != nil {
			return trash.Result{}, pendingErr
		}
		if pending {
			return trash.Result{}, trash.ErrDeletePending
		}
		return trash.Result{}, trash.ErrNotFound
	}
	if err != nil {
		return trash.Result{}, err
	}
	quota, err := lockLifecycleQuota(ctx, tx, item.driveID)
	if err != nil {
		return trash.Result{}, err
	}

	if command.ExpectedState != "" && item.status != command.ExpectedState {
		return trash.Result{}, fmt.Errorf(
			"%w: expected %q, found %q",
			trash.ErrInvalidState,
			command.ExpectedState,
			item.status,
		)
	}
	if item.status != trash.ItemStateReady && item.status != trash.ItemStateTrashed {
		return trash.Result{}, fmt.Errorf(
			"%w: cannot permanently delete item in state %q",
			trash.ErrInvalidState,
			item.status,
		)
	}
	if command.RequireExpired {
		if !item.purgeAfter.Valid || command.OccurredAt.Before(item.purgeAfter.Time) {
			return trash.Result{}, fmt.Errorf(
				"%w: Trash retention has not expired",
				trash.ErrInvalidState,
			)
		}
	}
	trashDelta := int64(0)
	if item.status == trash.ItemStateTrashed {
		trashDelta = -item.billableBytes
	}
	if quota.usedBytes < item.billableBytes || quota.trashBytes+trashDelta < 0 {
		return trash.Result{}, fmt.Errorf(
			"%w: used=%d trash=%d item=%d",
			trash.ErrQuotaInvariant,
			quota.usedBytes,
			quota.trashBytes,
			item.billableBytes,
		)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE cloud.quotas
		SET used_bytes = used_bytes - $1,
		    trash_bytes = trash_bytes + $2,
		    version = version + 1
		WHERE drive_id = $3
	`, item.billableBytes, trashDelta, item.driveID); err != nil {
		return trash.Result{}, fmt.Errorf("release permanently deleted quota: %w", err)
	}

	storageDeletion := item.storageObjectID.Valid
	if storageDeletion {
		storageTag, err := tx.Exec(ctx, `
			UPDATE cloud.storage_objects
			SET status = 'delete_pending',
			    delete_requested_at = COALESCE(delete_requested_at, $1),
			    deleted_at = NULL
			WHERE id = $2 AND drive_id = $3
		`, command.OccurredAt, item.storageObjectID.Bytes, item.driveID)
		if err != nil {
			return trash.Result{}, fmt.Errorf("mark storage object delete pending: %w", err)
		}
		if storageTag.RowsAffected() != 1 {
			return trash.Result{}, fmt.Errorf(
				"%w: storage object does not belong to the item drive",
				trash.ErrInvalidState,
			)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO cloud.jobs (
				job_type, drive_id, item_id, storage_object_id,
				payload, dedupe_key
			)
			SELECT
				'permanent_delete', $1, $2, $3,
				jsonb_build_object('operation_id', $4::text), $5::varchar
			WHERE NOT EXISTS (
				SELECT 1 FROM cloud.jobs
				WHERE job_type = 'permanent_delete' AND dedupe_key = $5::varchar
			)
		`,
			item.driveID,
			item.itemID,
			item.storageObjectID.Bytes,
			command.OperationID,
			"permanent-delete:item:"+item.itemID.String(),
		); err != nil {
			return trash.Result{}, fmt.Errorf("enqueue permanent delete job: %w", err)
		}
	}

	result := trash.Result{
		Action:          trash.ActionPurge,
		ItemID:          item.itemID,
		DriveID:         item.driveID,
		PreviousState:   item.status,
		BillableBytes:   item.billableBytes,
		UsedBytes:       quota.usedBytes - item.billableBytes,
		TrashBytes:      quota.trashBytes + trashDelta,
		Applied:         true,
		StorageDeletion: storageDeletion,
	}
	if item.deletedAt.Valid {
		result.DeletedAt = timePointer(item.deletedAt.Time)
	}
	if item.purgeAfter.Valid {
		result.PurgeAfter = timePointer(item.purgeAfter.Time)
	}
	if err := appendLifecycleEvidence(ctx, tx, command.Command, result); err != nil {
		return trash.Result{}, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM cloud.items WHERE id = $1`, item.itemID); err != nil {
		return trash.Result{}, fmt.Errorf("delete purged item metadata: %w", err)
	}
	return commitLifecycleResult(ctx, tx, result)
}

func hasPendingObjectDelete(
	ctx context.Context,
	tx pgx.Tx,
	ownerUserID, itemID uuid.UUID,
) (bool, error) {
	var pending bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM cloud.item_lifecycle_operations AS operation
			JOIN cloud.drives AS drive ON drive.id = operation.drive_id
			JOIN cloud.jobs AS job
			  ON job.job_type = 'permanent_delete'
			 AND job.dedupe_key = 'permanent-delete:item:' || operation.item_id::TEXT
			WHERE drive.owner_user_id = $1
			  AND operation.item_id = $2
			  AND operation.action = 'purge'
			  AND job.status <> 'completed'
		)
	`, ownerUserID, itemID).Scan(&pending)
	if err != nil {
		return false, fmt.Errorf("check pending permanent delete: %w", err)
	}
	return pending, nil
}

func lockLifecycleItem(
	ctx context.Context,
	tx pgx.Tx,
	ownerUserID, itemID uuid.UUID,
) (lockedLifecycleItem, error) {
	var item lockedLifecycleItem
	var status string
	err := tx.QueryRow(ctx, `
		SELECT
			item.id,
			item.drive_id,
			item.status::TEXT,
			item.billable_bytes,
			item.storage_object_id,
			item.deleted_at,
			item.purge_after
		FROM cloud.items AS item
		JOIN cloud.drives AS drive ON drive.id = item.drive_id
		WHERE item.id = $1 AND drive.owner_user_id = $2
		FOR UPDATE OF item
	`, itemID, ownerUserID).Scan(
		&item.itemID,
		&item.driveID,
		&status,
		&item.billableBytes,
		&item.storageObjectID,
		&item.deletedAt,
		&item.purgeAfter,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return lockedLifecycleItem{}, trash.ErrNotFound
	}
	if err != nil {
		return lockedLifecycleItem{}, fmt.Errorf("lock lifecycle item: %w", err)
	}
	item.status = trash.ItemState(status)
	return item, nil
}

func lockLifecycleQuota(
	ctx context.Context,
	tx pgx.Tx,
	driveID uuid.UUID,
) (lockedLifecycleQuota, error) {
	var quota lockedLifecycleQuota
	err := tx.QueryRow(ctx, `
		SELECT used_bytes, trash_bytes
		FROM cloud.quotas
		WHERE drive_id = $1
		FOR UPDATE
	`, driveID).Scan(&quota.usedBytes, &quota.trashBytes)
	if errors.Is(err, pgx.ErrNoRows) {
		return lockedLifecycleQuota{}, trash.ErrQuotaInvariant
	}
	if err != nil {
		return lockedLifecycleQuota{}, fmt.Errorf("lock lifecycle quota: %w", err)
	}
	return quota, nil
}

func appendLifecycleEvidence(
	ctx context.Context,
	tx pgx.Tx,
	command trash.Command,
	result trash.Result,
) error {
	deltaUsed := int64(0)
	deltaTrash := int64(0)
	switch result.Action {
	case trash.ActionMoveToTrash:
		deltaTrash = result.BillableBytes
	case trash.ActionRestore:
		deltaTrash = -result.BillableBytes
	case trash.ActionPurge:
		deltaUsed = -result.BillableBytes
		if result.PreviousState == trash.ItemStateTrashed {
			deltaTrash = -result.BillableBytes
		}
	default:
		return fmt.Errorf("%w: unknown action %q", trash.ErrInvalidInput, result.Action)
	}

	_, err := tx.Exec(ctx, `
		INSERT INTO cloud.usage_ledger (
			drive_id, item_id, event_type,
			delta_used_bytes, delta_reserved_bytes, delta_trash_bytes,
			idempotency_key, metadata, created_at
		)
		VALUES (
			$1, $2, $3, $4, 0, $5, $6,
			jsonb_build_object(
				'operation_id', $7::text,
				'from_status', $8::text,
				'to_status', $9::text
			),
			$10
		)
	`,
		result.DriveID,
		result.ItemID,
		result.Action,
		deltaUsed,
		deltaTrash,
		"lifecycle:"+command.OperationID,
		command.OperationID,
		result.PreviousState,
		nullableState(result.CurrentState),
		command.OccurredAt,
	)
	if err != nil {
		return mapLifecycleWriteError("append lifecycle quota ledger", err)
	}

	auditAction := "cloud.item." + string(result.Action)
	if result.Action == trash.ActionPurge {
		auditAction = "cloud.item.purged"
	}
	err = cloudaudit.Append(ctx, tx, cloudaudit.Entry{OccurredAt: command.OccurredAt, ActorUserID: &command.OwnerUserID, ActorType: "user", RequestID: command.OperationID, Action: auditAction, EntityType: "cloud_item", EntityID: result.ItemID, DriveID: result.DriveID, Metadata: map[string]any{"from_status": result.PreviousState, "to_status": nullableState(result.CurrentState), "billable_bytes": result.BillableBytes, "delta_used_bytes": deltaUsed, "delta_trash_bytes": deltaTrash}})
	if err != nil {
		return fmt.Errorf("append lifecycle audit: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO cloud.item_lifecycle_operations (
			drive_id, item_id, operation_key, action,
			from_status, to_status, billable_bytes,
			used_bytes_after, trash_bytes_after,
			deleted_at, purge_after, occurred_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`,
		result.DriveID,
		result.ItemID,
		command.OperationID,
		result.Action,
		result.PreviousState,
		nullableState(result.CurrentState),
		result.BillableBytes,
		result.UsedBytes,
		result.TrashBytes,
		result.DeletedAt,
		result.PurgeAfter,
		command.OccurredAt,
	)
	if err != nil {
		return mapLifecycleWriteError("append lifecycle operation", err)
	}
	return nil
}

func loadLifecycleOperation(
	ctx context.Context,
	tx pgx.Tx,
	ownerUserID, itemID uuid.UUID,
	operationID string,
	action trash.Action,
) (trash.Result, bool, error) {
	var (
		result        trash.Result
		storedItemID  uuid.UUID
		storedAction  string
		fromStatus    string
		toStatus      pgtype.Text
		deletedAt     pgtype.Timestamptz
		purgeAfter    pgtype.Timestamptz
		storageDelete bool
	)
	err := tx.QueryRow(ctx, `
		SELECT
			op.item_id,
			op.drive_id,
			op.action,
			op.from_status,
			op.to_status,
			op.billable_bytes,
			op.used_bytes_after,
			op.trash_bytes_after,
			op.deleted_at,
			op.purge_after,
			EXISTS (
				SELECT 1 FROM cloud.jobs AS job
				WHERE job.job_type = 'permanent_delete'
				  AND job.dedupe_key = 'permanent-delete:item:' || op.item_id::TEXT
			) AS storage_deletion
		FROM cloud.item_lifecycle_operations AS op
		JOIN cloud.drives AS drive ON drive.id = op.drive_id
		WHERE drive.owner_user_id = $1
		  AND op.operation_key = $2
		  AND op.item_id = $3
	`, ownerUserID, operationID, itemID).Scan(
		&storedItemID,
		&result.DriveID,
		&storedAction,
		&fromStatus,
		&toStatus,
		&result.BillableBytes,
		&result.UsedBytes,
		&result.TrashBytes,
		&deletedAt,
		&purgeAfter,
		&storageDelete,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return trash.Result{}, false, nil
	}
	if err != nil {
		return trash.Result{}, false, fmt.Errorf("load lifecycle operation: %w", err)
	}
	if storedItemID != itemID || trash.Action(storedAction) != action {
		return trash.Result{}, false, trash.ErrIdempotencyConflict
	}
	result.Action = action
	result.ItemID = storedItemID
	result.PreviousState = trash.ItemState(fromStatus)
	result.StorageDeletion = storageDelete
	if toStatus.Valid {
		result.CurrentState = statePointer(trash.ItemState(toStatus.String))
	}
	if deletedAt.Valid {
		result.DeletedAt = timePointer(deletedAt.Time)
	}
	if purgeAfter.Valid {
		result.PurgeAfter = timePointer(purgeAfter.Time)
	}
	return result, true, nil
}

func lifecycleNoopResult(
	action trash.Action,
	item lockedLifecycleItem,
	quota lockedLifecycleQuota,
) trash.Result {
	result := trash.Result{
		Action:        action,
		ItemID:        item.itemID,
		DriveID:       item.driveID,
		PreviousState: item.status,
		CurrentState:  statePointer(item.status),
		BillableBytes: item.billableBytes,
		UsedBytes:     quota.usedBytes,
		TrashBytes:    quota.trashBytes,
	}
	if item.deletedAt.Valid {
		result.DeletedAt = timePointer(item.deletedAt.Time)
	}
	if item.purgeAfter.Valid {
		result.PurgeAfter = timePointer(item.purgeAfter.Time)
	}
	return result
}

func commitLifecycleResult(
	ctx context.Context,
	tx pgx.Tx,
	result trash.Result,
) (trash.Result, error) {
	if err := tx.Commit(ctx); err != nil {
		return trash.Result{}, fmt.Errorf("commit Trash lifecycle transaction: %w", err)
	}
	return result, nil
}

func mapLifecycleWriteError(operation string, err error) error {
	var databaseError *pgconn.PgError
	if errors.As(err, &databaseError) && databaseError.Code == "23505" {
		return fmt.Errorf("%w: %s", trash.ErrIdempotencyConflict, operation)
	}
	return fmt.Errorf("%s: %w", operation, err)
}

func statePointer(state trash.ItemState) *trash.ItemState {
	return &state
}

func timePointer(value time.Time) *time.Time {
	return &value
}

func nullableState(state *trash.ItemState) any {
	if state == nil {
		return nil
	}
	return *state
}
