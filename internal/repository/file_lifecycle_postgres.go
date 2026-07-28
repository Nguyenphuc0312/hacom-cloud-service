package repository

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker/handlers"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type FileLifecyclePostgres struct {
	pool *pgxpool.Pool
}

var _ handlers.FileLifecycleRepository = (*FileLifecyclePostgres)(nil)

func NewFileLifecyclePostgres(pool *pgxpool.Pool) (*FileLifecyclePostgres, error) {
	if pool == nil {
		return nil, errors.New("PostgreSQL pool is required")
	}
	return &FileLifecyclePostgres{pool: pool}, nil
}

func (r *FileLifecyclePostgres) GetHashTarget(
	ctx context.Context,
	payload handlers.HashFilePayload,
) (handlers.HashTarget, error) {
	itemID, objectID, sessionID, err := parseHashPayloadIDs(payload)
	if err != nil {
		return handlers.HashTarget{}, err
	}

	var (
		target             handlers.HashTarget
		objectBytes        pgtype.Int8
		sessionBytes       pgtype.Int8
		itemBytes          int64
		uploadStatus       string
		storedObjectID     uuid.UUID
		storedSessionID    uuid.UUID
		storedItemID       uuid.UUID
		storedObjectKey    string
		storedItemStatus   string
		storedObjectStatus string
		checksum           pgtype.Text
	)
	err = r.pool.QueryRow(ctx, `
		SELECT
			item.id,
			object.id,
			session.id,
			object.object_key,
			item.size_bytes,
			object.actual_size_bytes,
			session.actual_size_bytes,
			item.status::text,
			object.status::text,
			object.checksum_sha256,
			session.status::text
		FROM cloud.items AS item
		JOIN cloud.storage_objects AS object
		  ON object.id = item.storage_object_id
		 AND object.drive_id = item.drive_id
		JOIN cloud.upload_sessions AS session
		  ON session.item_id = item.id
		 AND session.storage_object_id = object.id
		 AND session.drive_id = item.drive_id
		WHERE item.id = $1
	`, itemID).Scan(
		&storedItemID,
		&storedObjectID,
		&storedSessionID,
		&storedObjectKey,
		&itemBytes,
		&objectBytes,
		&sessionBytes,
		&storedItemStatus,
		&storedObjectStatus,
		&checksum,
		&uploadStatus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return handlers.HashTarget{}, handlers.ErrHashTargetNotFound
	}
	if err != nil {
		return handlers.HashTarget{}, fmt.Errorf("query hash target: %w", err)
	}

	if storedObjectID != objectID ||
		storedSessionID != sessionID ||
		storedItemID != itemID ||
		storedObjectKey != payload.ObjectKey {
		return handlers.HashTarget{}, handlers.ErrHashTargetMismatch
	}
	if uploadStatus != "completed" {
		return handlers.HashTarget{}, fmt.Errorf(
			"%w: upload session status is %q",
			handlers.ErrHashTargetState,
			uploadStatus,
		)
	}
	if storedItemStatus != storedObjectStatus ||
		(storedItemStatus != "processing" && storedItemStatus != "ready") {
		return handlers.HashTarget{}, fmt.Errorf(
			"%w: item=%q object=%q",
			handlers.ErrHashTargetState,
			storedItemStatus,
			storedObjectStatus,
		)
	}
	if !objectBytes.Valid ||
		!sessionBytes.Valid ||
		objectBytes.Int64 <= 0 ||
		itemBytes != objectBytes.Int64 ||
		sessionBytes.Int64 != objectBytes.Int64 {
		return handlers.HashTarget{}, fmt.Errorf(
			"%w: item=%d object=%v session=%v",
			handlers.ErrHashTargetMismatch,
			itemBytes,
			nullableInt64(objectBytes),
			nullableInt64(sessionBytes),
		)
	}

	target = handlers.HashTarget{
		ItemID:          storedItemID.String(),
		StorageObjectID: storedObjectID.String(),
		UploadSessionID: storedSessionID.String(),
		ObjectKey:       storedObjectKey,
		ExpectedBytes:   objectBytes.Int64,
		ItemStatus:      storedItemStatus,
		ObjectStatus:    storedObjectStatus,
	}
	if checksum.Valid {
		target.Checksum = strings.TrimSpace(checksum.String)
	}
	return target, nil
}

func (r *FileLifecyclePostgres) MarkHashReady(
	ctx context.Context,
	target handlers.HashTarget,
	result handlers.HashResult,
) error {
	if err := validateRepositoryHashResult(result); err != nil {
		return err
	}
	itemID, objectID, sessionID, err := parseTargetIDs(target)
	if err != nil {
		return err
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin mark hash ready transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		objectKey    string
		itemBytes    int64
		objectBytes  pgtype.Int8
		sessionBytes pgtype.Int8
		itemStatus   string
		objectStatus string
		uploadStatus string
		checksum     pgtype.Text
	)
	err = tx.QueryRow(ctx, `
		SELECT
			object.object_key,
			item.size_bytes,
			object.actual_size_bytes,
			session.actual_size_bytes,
			item.status::text,
			object.status::text,
			object.checksum_sha256,
			session.status::text
		FROM cloud.items AS item
		JOIN cloud.storage_objects AS object
		  ON object.id = item.storage_object_id
		 AND object.drive_id = item.drive_id
		JOIN cloud.upload_sessions AS session
		  ON session.item_id = item.id
		 AND session.storage_object_id = object.id
		 AND session.drive_id = item.drive_id
		WHERE item.id = $1
		  AND object.id = $2
		  AND session.id = $3
		FOR UPDATE OF item, object
	`, itemID, objectID, sessionID).Scan(
		&objectKey,
		&itemBytes,
		&objectBytes,
		&sessionBytes,
		&itemStatus,
		&objectStatus,
		&checksum,
		&uploadStatus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return handlers.ErrHashTargetNotFound
	}
	if err != nil {
		return fmt.Errorf("lock hash target: %w", err)
	}
	if objectKey != target.ObjectKey || uploadStatus != "completed" {
		return handlers.ErrHashTargetMismatch
	}
	if !objectBytes.Valid ||
		!sessionBytes.Valid ||
		itemBytes != result.SizeBytes ||
		objectBytes.Int64 != result.SizeBytes ||
		sessionBytes.Int64 != result.SizeBytes ||
		target.ExpectedBytes != result.SizeBytes {
		return fmt.Errorf(
			"%w: result=%d item=%d object=%v session=%v target=%d",
			handlers.ErrHashSizeMismatch,
			result.SizeBytes,
			itemBytes,
			nullableInt64(objectBytes),
			nullableInt64(sessionBytes),
			target.ExpectedBytes,
		)
	}

	storedChecksum := ""
	if checksum.Valid {
		storedChecksum = strings.TrimSpace(checksum.String)
	}
	if itemStatus == "ready" && objectStatus == "ready" {
		if storedChecksum != result.Checksum {
			return fmt.Errorf(
				"%w: stored checksum differs from computed checksum",
				handlers.ErrHashResultConflict,
			)
		}
		return tx.Commit(ctx)
	}
	if itemStatus != "processing" || objectStatus != "processing" {
		return fmt.Errorf(
			"%w: item=%q object=%q",
			handlers.ErrHashTargetState,
			itemStatus,
			objectStatus,
		)
	}
	if storedChecksum != "" && storedChecksum != result.Checksum {
		return fmt.Errorf(
			"%w: processing object already has a different checksum",
			handlers.ErrHashResultConflict,
		)
	}

	command, err := tx.Exec(ctx, `
		UPDATE cloud.storage_objects
		SET checksum_sha256 = $1,
		    status = 'ready'
		WHERE id = $2
	`, result.Checksum, objectID)
	if err != nil {
		return fmt.Errorf("mark storage object ready: %w", err)
	}
	if command.RowsAffected() != 1 {
		return handlers.ErrHashTargetNotFound
	}
	command, err = tx.Exec(ctx, `
		UPDATE cloud.items
		SET status = 'ready'
		WHERE id = $1
	`, itemID)
	if err != nil {
		return fmt.Errorf("mark file item ready: %w", err)
	}
	if command.RowsAffected() != 1 {
		return handlers.ErrHashTargetNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit hash target ready: %w", err)
	}
	return nil
}

func parseHashPayloadIDs(
	payload handlers.HashFilePayload,
) (uuid.UUID, uuid.UUID, uuid.UUID, error) {
	itemID, err := uuid.Parse(payload.ItemID)
	if err != nil {
		return uuid.Nil, uuid.Nil, uuid.Nil, fmt.Errorf("parse item ID: %w", err)
	}
	objectID, err := uuid.Parse(payload.StorageObjectID)
	if err != nil {
		return uuid.Nil, uuid.Nil, uuid.Nil, fmt.Errorf("parse storage object ID: %w", err)
	}
	sessionID, err := uuid.Parse(payload.UploadSessionID)
	if err != nil {
		return uuid.Nil, uuid.Nil, uuid.Nil, fmt.Errorf("parse upload session ID: %w", err)
	}
	return itemID, objectID, sessionID, nil
}

func parseTargetIDs(
	target handlers.HashTarget,
) (uuid.UUID, uuid.UUID, uuid.UUID, error) {
	return parseHashPayloadIDs(handlers.HashFilePayload{
		ItemID:          target.ItemID,
		StorageObjectID: target.StorageObjectID,
		UploadSessionID: target.UploadSessionID,
		ObjectKey:       target.ObjectKey,
	})
}

func validateRepositoryHashResult(result handlers.HashResult) error {
	if result.SizeBytes <= 0 ||
		len(result.Checksum) != 64 ||
		result.Checksum != strings.ToLower(result.Checksum) {
		return errors.New("invalid hash result")
	}
	if _, err := hex.DecodeString(result.Checksum); err != nil {
		return errors.New("invalid hash result")
	}
	return nil
}

func nullableInt64(value pgtype.Int8) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}
