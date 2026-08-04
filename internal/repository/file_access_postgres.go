package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/fileaccess"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (r *CloudPostgres) GetFileAccessTarget(
	ctx context.Context,
	ownerUserID uuid.UUID,
	itemID uuid.UUID,
) (fileaccess.Target, error) {
	var (
		target       fileaccess.Target
		itemType     string
		itemStatus   string
		objectStatus sql.NullString
		objectKey    sql.NullString
		originalName sql.NullString
		contentType  sql.NullString
		purgeAfter   sql.NullTime
	)
	err := r.pool.QueryRow(ctx, `
		SELECT
			item.id,
			item.storage_object_id,
			item.item_type::text,
			item.status::text,
			object.status::text,
			object.object_key,
			object.original_name,
			object.content_type,
			item.size_bytes,
			item.purge_after
		FROM cloud.items AS item
		JOIN cloud.drives AS drive
		  ON drive.id = item.drive_id
		LEFT JOIN cloud.storage_objects AS object
		  ON object.id = item.storage_object_id
		 AND object.drive_id = item.drive_id
		WHERE item.id = $1
		  AND drive.owner_user_id = $2
	`, itemID, ownerUserID).Scan(
		&target.ItemID,
		&target.StorageObjectID,
		&itemType,
		&itemStatus,
		&objectStatus,
		&objectKey,
		&originalName,
		&contentType,
		&target.SizeBytes,
		&purgeAfter,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return fileaccess.Target{}, fileaccess.ErrNotFound
	}
	if err != nil {
		return fileaccess.Target{}, fmt.Errorf("get file access target: %w", err)
	}

	switch itemType {
	case "file", "image", "video", "audio":
	default:
		return fileaccess.Target{}, fileaccess.ErrNotFile
	}
	if itemStatus == "trashed" {
		if !purgeAfter.Valid || !time.Now().UTC().Before(purgeAfter.Time) {
			return fileaccess.Target{}, fileaccess.ErrDeletePending
		}
		value := purgeAfter.Time.UTC()
		target.PurgeAfter = &value
	} else if itemStatus != "ready" {
		return fileaccess.Target{}, fileaccess.ErrNotReady
	}
	if !objectStatus.Valid ||
		objectStatus.String != "ready" {
		return fileaccess.Target{}, fileaccess.ErrNotReady
	}
	if !objectKey.Valid ||
		!originalName.Valid ||
		!contentType.Valid ||
		strings.TrimSpace(objectKey.String) == "" ||
		strings.TrimSpace(originalName.String) == "" ||
		strings.TrimSpace(contentType.String) == "" {
		return fileaccess.Target{}, fileaccess.ErrObjectUnavailable
	}

	target.ObjectKey = objectKey.String
	target.FileName = originalName.String
	target.ContentType = contentType.String
	return target, nil
}

func (r *CloudPostgres) ValidateFileAccessTarget(
	ctx context.Context,
	ownerUserID, itemID, storageObjectID uuid.UUID,
	accessedAt time.Time,
) error {
	var itemStatus, objectStatus string
	var purgeAfter sql.NullTime
	err := r.pool.QueryRow(ctx, `
		SELECT item.status::TEXT, object.status::TEXT, item.purge_after
		FROM cloud.items AS item
		JOIN cloud.drives AS drive ON drive.id = item.drive_id
		JOIN cloud.storage_objects AS object
		  ON object.id = item.storage_object_id
		 AND object.drive_id = item.drive_id
		WHERE item.id = $1
		  AND item.storage_object_id = $2
		  AND drive.owner_user_id = $3
	`, itemID, storageObjectID, ownerUserID).Scan(&itemStatus, &objectStatus, &purgeAfter)
	if errors.Is(err, pgx.ErrNoRows) {
		var deletePending bool
		checkErr := r.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM cloud.jobs AS job
				JOIN cloud.drives AS drive ON drive.id = job.drive_id
				WHERE job.storage_object_id = $1
				  AND drive.owner_user_id = $2
				  AND job.job_type = 'permanent_delete'
				  AND job.status IN ('pending', 'processing', 'failed')
			)
		`, storageObjectID, ownerUserID).Scan(&deletePending)
		if checkErr != nil {
			return fmt.Errorf("check file delete race: %w", checkErr)
		}
		if deletePending {
			return fileaccess.ErrDeletePending
		}
		return fileaccess.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("revalidate file access target: %w", err)
	}
	if objectStatus != "ready" {
		return fileaccess.ErrDeletePending
	}
	if itemStatus == "ready" {
		return nil
	}
	if itemStatus == "trashed" && purgeAfter.Valid && accessedAt.UTC().Before(purgeAfter.Time) {
		return nil
	}
	return fileaccess.ErrDeletePending
}
