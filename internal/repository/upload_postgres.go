package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/upload"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func (r *CloudPostgres) Initiate(
	ctx context.Context,
	draft upload.InitiateDraft,
) (upload.Session, bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return upload.Session{}, false, fmt.Errorf("begin initiate upload transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	drive, err := r.ensureDriveAndQuota(ctx, tx, draft.OwnerUserID)
	if err != nil {
		return upload.Session{}, false, err
	}
	if drive.Status != cloud.DriveStatusActive {
		return upload.Session{}, false, cloud.ErrDriveNotActive
	}

	quota, err := scanQuota(tx.QueryRow(ctx, `
		SELECT drive_id, quota_bytes, used_bytes, trash_bytes, reserved_bytes, updated_at
		FROM cloud.quotas
		WHERE drive_id = $1
		FOR UPDATE
	`, drive.ID))
	if err != nil {
		return upload.Session{}, false, fmt.Errorf("lock cloud quota: %w", err)
	}

	existing, err := scanUploadSession(tx.QueryRow(ctx, uploadSessionSelect+`
		WHERE session.drive_id = $1
		  AND session.idempotency_key = $2
	`, drive.ID, draft.IdempotencyKey))
	if err == nil {
		if existing.FileName != draft.FileName ||
			existing.ContentType != draft.ContentType ||
			existing.DeclaredBytes != draft.DeclaredBytes {
			return upload.Session{}, false, upload.ErrIdempotencyConflict
		}
		switch existing.Status {
		case upload.SessionCompleted:
			return upload.Session{}, false, upload.ErrSessionCompleted
		case upload.SessionExpired:
			return upload.Session{}, false, upload.ErrSessionExpired
		case upload.SessionCancelled, upload.SessionFailed:
			return upload.Session{}, false, upload.ErrSessionRejected
		}
		if !time.Now().Before(existing.ExpiresAt) {
			return upload.Session{}, false, upload.ErrSessionExpired
		}
		if err := tx.Commit(ctx); err != nil {
			return upload.Session{}, false, fmt.Errorf(
				"commit idempotent upload initiation: %w",
				err,
			)
		}
		return existing, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return upload.Session{}, false, fmt.Errorf("find idempotent upload: %w", err)
	}

	if quota.UsedBytes+quota.ReservedBytes+draft.DeclaredBytes > quota.LimitBytes {
		return upload.Session{}, false, cloud.ErrQuotaExceeded
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO cloud.storage_objects (
			id,
			drive_id,
			bucket,
			object_key,
			original_name,
			content_type,
			declared_size_bytes,
			status
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'reserved')
	`,
		draft.StorageObjectID,
		drive.ID,
		r.storageBucket,
		draft.ObjectKey,
		draft.FileName,
		draft.ContentType,
		draft.DeclaredBytes,
	)
	if err != nil {
		return upload.Session{}, false, fmt.Errorf("insert storage object: %w", err)
	}

	itemType := uploadItemType(draft.ContentType)
	title := truncateRunes(draft.FileName, cloud.MaxTitleRunes)
	_, err = tx.Exec(ctx, `
		INSERT INTO cloud.items (
			id,
			drive_id,
			item_type,
			status,
			title,
			storage_object_id,
			size_bytes,
			billable_bytes,
			source_type
		)
		VALUES ($1, $2, $3, 'pending', $4, $5, $6, $6, 'cloud_upload')
	`,
		draft.ItemID,
		drive.ID,
		itemType,
		title,
		draft.StorageObjectID,
		draft.DeclaredBytes,
	)
	if err != nil {
		return upload.Session{}, false, fmt.Errorf("insert pending file item: %w", err)
	}

	session, err := scanUploadSession(tx.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO cloud.upload_sessions (
				id,
				drive_id,
				item_id,
				storage_object_id,
				status,
				original_name,
				content_type,
				declared_size_bytes,
				reserved_bytes,
				idempotency_key,
				expires_at
			)
			VALUES ($1, $2, $3, $4, 'initiated', $5, $6, $7, $7, $8, $9)
			RETURNING *
		)
		SELECT
			inserted.id,
			inserted.drive_id,
			inserted.item_id,
			inserted.storage_object_id,
			drive.owner_user_id,
			drive.status::text,
			object.object_key,
			inserted.original_name,
			inserted.content_type,
			inserted.declared_size_bytes,
			inserted.reserved_bytes,
			inserted.idempotency_key,
			inserted.status::text,
			inserted.expires_at,
			inserted.created_at
		FROM inserted
		JOIN cloud.drives AS drive ON drive.id = inserted.drive_id
		JOIN cloud.storage_objects AS object ON object.id = inserted.storage_object_id
	`,
		draft.SessionID,
		drive.ID,
		draft.ItemID,
		draft.StorageObjectID,
		draft.FileName,
		draft.ContentType,
		draft.DeclaredBytes,
		draft.IdempotencyKey,
		draft.ExpiresAt,
	))
	if err != nil {
		return upload.Session{}, false, fmt.Errorf("insert upload session: %w", err)
	}

	command, err := tx.Exec(ctx, `
		UPDATE cloud.quotas
		SET reserved_bytes = reserved_bytes + $1,
		    version = version + 1
		WHERE drive_id = $2
		  AND used_bytes + reserved_bytes + $1 <= quota_bytes
	`, draft.DeclaredBytes, drive.ID)
	if err != nil {
		return upload.Session{}, false, fmt.Errorf("reserve upload quota: %w", err)
	}
	if command.RowsAffected() != 1 {
		return upload.Session{}, false, cloud.ErrQuotaExceeded
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
			'reserve',
			0,
			$4,
			$5,
			jsonb_build_object('file_name', $6::text)
		)
	`,
		drive.ID,
		draft.ItemID,
		draft.SessionID,
		draft.DeclaredBytes,
		"reserve:upload:"+draft.SessionID.String(),
		draft.FileName,
	)
	if err != nil {
		return upload.Session{}, false, fmt.Errorf("append upload reservation ledger: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return upload.Session{}, false, fmt.Errorf("commit upload initiation: %w", err)
	}
	return session, true, nil
}

func (r *CloudPostgres) GetSession(
	ctx context.Context,
	ownerUserID, sessionID uuid.UUID,
) (upload.Session, error) {
	session, err := scanUploadSession(r.pool.QueryRow(ctx, uploadSessionSelect+`
		WHERE session.id = $1
		  AND drive.owner_user_id = $2
	`, sessionID, ownerUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return upload.Session{}, upload.ErrSessionNotFound
	}
	if err != nil {
		return upload.Session{}, fmt.Errorf("get upload session: %w", err)
	}
	return session, nil
}

func (r *CloudPostgres) GetCompleted(
	ctx context.Context,
	ownerUserID, sessionID uuid.UUID,
) (upload.CompleteResult, error) {
	result, err := scanCompletedUpload(r.pool.QueryRow(
		ctx,
		completedUploadSelect,
		sessionID,
		ownerUserID,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return upload.CompleteResult{}, upload.ErrSessionNotFound
	}
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("get completed upload: %w", err)
	}
	return result, nil
}

func (r *CloudPostgres) Finalize(
	ctx context.Context,
	ownerUserID, sessionID uuid.UUID,
	object storage.ObjectInfo,
) (upload.CompleteResult, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("begin finalize upload transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	session, err := scanUploadSession(tx.QueryRow(ctx, uploadSessionSelect+`
		WHERE session.id = $1
		  AND drive.owner_user_id = $2
		FOR UPDATE OF session
	`, sessionID, ownerUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return upload.CompleteResult{}, upload.ErrSessionNotFound
	}
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("lock upload session: %w", err)
	}
	if session.Status == upload.SessionCompleted {
		result, resultErr := scanCompletedUpload(tx.QueryRow(
			ctx,
			completedUploadSelect,
			sessionID,
			ownerUserID,
		))
		if resultErr != nil {
			return upload.CompleteResult{}, fmt.Errorf(
				"read idempotent completion: %w",
				resultErr,
			)
		}
		if err := tx.Commit(ctx); err != nil {
			return upload.CompleteResult{}, fmt.Errorf(
				"commit idempotent completion: %w",
				err,
			)
		}
		return result, nil
	}
	if session.DriveStatus != cloud.DriveStatusActive {
		return upload.CompleteResult{}, cloud.ErrDriveNotActive
	}
	switch session.Status {
	case upload.SessionExpired:
		return upload.CompleteResult{}, upload.ErrSessionExpired
	case upload.SessionCancelled, upload.SessionFailed:
		return upload.CompleteResult{}, upload.ErrSessionRejected
	}
	if !time.Now().Before(session.ExpiresAt) {
		return upload.CompleteResult{}, upload.ErrSessionExpired
	}
	if object.SizeBytes != session.DeclaredBytes {
		return upload.CompleteResult{}, upload.ErrObjectSizeMismatch
	}

	_, err = scanQuota(tx.QueryRow(ctx, `
		SELECT drive_id, quota_bytes, used_bytes, trash_bytes, reserved_bytes, updated_at
		FROM cloud.quotas
		WHERE drive_id = $1
		FOR UPDATE
	`, session.DriveID))
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("lock quota for completion: %w", err)
	}

	command, err := tx.Exec(ctx, `
		UPDATE cloud.quotas
		SET reserved_bytes = reserved_bytes - $1,
		    used_bytes = used_bytes + $2,
		    version = version + 1
		WHERE drive_id = $3
		  AND reserved_bytes >= $1
		  AND used_bytes + reserved_bytes - $1 + $2 <= quota_bytes
	`, session.ReservedBytes, object.SizeBytes, session.DriveID)
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("commit upload quota: %w", err)
	}
	if command.RowsAffected() != 1 {
		return upload.CompleteResult{}, errors.New(
			"reserved quota is inconsistent with upload session",
		)
	}

	_, err = tx.Exec(ctx, `
		UPDATE cloud.storage_objects
		SET status = 'processing',
		    actual_size_bytes = $1,
		    etag = NULLIF($2, ''),
		    uploaded_at = NOW(),
		    verified_at = NOW()
		WHERE id = $3
		  AND drive_id = $4
	`, object.SizeBytes, object.ETag, session.StorageObjectID, session.DriveID)
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("update storage object: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE cloud.items
		SET status = 'processing',
		    size_bytes = $1,
		    billable_bytes = $1
		WHERE id = $2
		  AND drive_id = $3
	`, object.SizeBytes, session.ItemID, session.DriveID)
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("update file item: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE cloud.upload_sessions
		SET status = 'completed',
		    actual_size_bytes = $1,
		    uploaded_at = NOW(),
		    completed_at = NOW()
		WHERE id = $2
		  AND drive_id = $3
	`, object.SizeBytes, session.ID, session.DriveID)
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("complete upload session: %w", err)
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
			'commit',
			$4,
			(-$5::bigint),
			$6,
			jsonb_build_object('object_key', $7::text)
		)
	`,
		session.DriveID,
		session.ItemID,
		session.ID,
		object.SizeBytes,
		session.ReservedBytes,
		"commit:upload:"+session.ID.String(),
		session.ObjectKey,
	)
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("append upload commit ledger: %w", err)
	}

	_, err = tx.Exec(ctx, `
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
		VALUES (
			'hash_file',
			'pending',
			$1::uuid,
			$2::uuid,
			$3::uuid,
			$4::uuid,
			jsonb_build_object(
				'item_id', $2::uuid::text,
				'storage_object_id', $3::uuid::text,
				'upload_session_id', $4::uuid::text,
				'object_key', $5::text
			),
			$6
		)
		ON CONFLICT DO NOTHING
	`,
		session.DriveID,
		session.ItemID,
		session.StorageObjectID,
		session.ID,
		session.ObjectKey,
		"hash_file:"+session.StorageObjectID.String(),
	)
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("enqueue hash file job: %w", err)
	}

	result, err := scanCompletedUpload(tx.QueryRow(
		ctx,
		completedUploadSelect,
		sessionID,
		ownerUserID,
	))
	if err != nil {
		return upload.CompleteResult{}, fmt.Errorf("read finalized upload: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return upload.CompleteResult{}, fmt.Errorf("commit finalized upload: %w", err)
	}
	return result, nil
}

func (r *CloudPostgres) Reject(
	ctx context.Context,
	ownerUserID, sessionID uuid.UUID,
	failureCode, failureDetail string,
) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin reject upload transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	session, err := scanUploadSession(tx.QueryRow(ctx, uploadSessionSelect+`
		WHERE session.id = $1
		  AND drive.owner_user_id = $2
		FOR UPDATE OF session
	`, sessionID, ownerUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return upload.ErrSessionNotFound
	}
	if err != nil {
		return fmt.Errorf("lock rejected upload session: %w", err)
	}
	if session.Status == upload.SessionFailed {
		return tx.Commit(ctx)
	}
	if session.Status == upload.SessionCompleted {
		return upload.ErrSessionCompleted
	}

	_, err = scanQuota(tx.QueryRow(ctx, `
		SELECT drive_id, quota_bytes, used_bytes, trash_bytes, reserved_bytes, updated_at
		FROM cloud.quotas
		WHERE drive_id = $1
		FOR UPDATE
	`, session.DriveID))
	if err != nil {
		return fmt.Errorf("lock quota for rejected upload: %w", err)
	}

	command, err := tx.Exec(ctx, `
		UPDATE cloud.quotas
		SET reserved_bytes = reserved_bytes - $1,
		    version = version + 1
		WHERE drive_id = $2
		  AND reserved_bytes >= $1
	`, session.ReservedBytes, session.DriveID)
	if err != nil {
		return fmt.Errorf("release rejected upload quota: %w", err)
	}
	if command.RowsAffected() != 1 {
		return errors.New("reserved quota is inconsistent with rejected upload")
	}

	_, err = tx.Exec(ctx, `
		UPDATE cloud.upload_sessions
		SET status = 'failed',
		    failure_code = $1,
		    failure_detail = $2
		WHERE id = $3
		  AND drive_id = $4
	`, failureCode, failureDetail, session.ID, session.DriveID)
	if err != nil {
		return fmt.Errorf("mark upload session failed: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE cloud.storage_objects
		SET status = 'failed'
		WHERE id = $1
		  AND drive_id = $2
	`, session.StorageObjectID, session.DriveID)
	if err != nil {
		return fmt.Errorf("mark storage object failed: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE cloud.items
		SET status = 'failed'
		WHERE id = $1
		  AND drive_id = $2
	`, session.ItemID, session.DriveID)
	if err != nil {
		return fmt.Errorf("mark file item failed: %w", err)
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
		VALUES ($1, $2, $3, 'release', 0, (-$4::bigint), $5, $6)
	`,
		session.DriveID,
		session.ItemID,
		session.ID,
		session.ReservedBytes,
		"release:upload:"+session.ID.String(),
		map[string]string{"failure_code": failureCode},
	)
	if err != nil {
		return fmt.Errorf("append upload release ledger: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit rejected upload: %w", err)
	}
	return nil
}

const uploadSessionSelect = `
	SELECT
		session.id,
		session.drive_id,
		session.item_id,
		session.storage_object_id,
		drive.owner_user_id,
		drive.status::text,
		object.object_key,
		session.original_name,
		session.content_type,
		session.declared_size_bytes,
		session.reserved_bytes,
		session.idempotency_key,
		session.status::text,
		session.expires_at,
		session.created_at
	FROM cloud.upload_sessions AS session
	JOIN cloud.drives AS drive ON drive.id = session.drive_id
	JOIN cloud.storage_objects AS object
	  ON object.id = session.storage_object_id
	 AND object.drive_id = session.drive_id
`

const completedUploadSelect = `
	SELECT
		item.id,
		item.drive_id,
		item.storage_object_id,
		item.item_type::text,
		item.status::text,
		item.title,
		item.size_bytes,
		item.created_at,
		item.updated_at,
		job.id,
		job.job_type::text,
		job.status::text
	FROM cloud.upload_sessions AS session
	JOIN cloud.drives AS drive ON drive.id = session.drive_id
	JOIN cloud.items AS item
	  ON item.id = session.item_id
	 AND item.drive_id = session.drive_id
	JOIN cloud.jobs AS job
	  ON job.upload_session_id = session.id
	 AND job.drive_id = session.drive_id
	 AND job.job_type = 'hash_file'
	WHERE session.id = $1
	  AND drive.owner_user_id = $2
	  AND session.status = 'completed'
	ORDER BY job.created_at
	LIMIT 1
`

func scanUploadSession(row rowScanner) (upload.Session, error) {
	var (
		session upload.Session
		status  string
	)
	err := row.Scan(
		&session.ID,
		&session.DriveID,
		&session.ItemID,
		&session.StorageObjectID,
		&session.OwnerUserID,
		&session.DriveStatus,
		&session.ObjectKey,
		&session.FileName,
		&session.ContentType,
		&session.DeclaredBytes,
		&session.ReservedBytes,
		&session.IdempotencyKey,
		&status,
		&session.ExpiresAt,
		&session.CreatedAt,
	)
	session.Status = upload.SessionStatus(status)
	return session, err
}

func scanCompletedUpload(row rowScanner) (upload.CompleteResult, error) {
	var (
		result     upload.CompleteResult
		itemType   string
		itemStatus string
		title      pgtype.Text
		jobType    string
		jobStatus  string
	)
	err := row.Scan(
		&result.Item.ID,
		&result.Item.DriveID,
		&result.Item.StorageObjectID,
		&itemType,
		&itemStatus,
		&title,
		&result.Item.SizeBytes,
		&result.Item.CreatedAt,
		&result.Item.UpdatedAt,
		&result.Job.ID,
		&jobType,
		&jobStatus,
	)
	result.Item.Type = cloud.ItemType(itemType)
	result.Item.Status = cloud.ItemStatus(itemStatus)
	result.Item.Title = optionalString(title)
	result.Job.Type = jobType
	result.Job.Status = jobStatus
	return result, err
}

func uploadItemType(contentType string) cloud.ItemType {
	switch {
	case strings.HasPrefix(contentType, "image/"):
		return cloud.ItemTypeImage
	case strings.HasPrefix(contentType, "video/"):
		return cloud.ItemTypeVideo
	case strings.HasPrefix(contentType, "audio/"):
		return cloud.ItemTypeAudio
	default:
		return cloud.ItemTypeFile
	}
}

func truncateRunes(value string, maximum int) string {
	runes := []rune(value)
	if len(runes) <= maximum {
		return value
	}
	return string(runes[:maximum])
}
