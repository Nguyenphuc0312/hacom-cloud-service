package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

type CleanupRecord struct {
	SessionID     string
	OwnerID       string
	ObjectKey     string
	ReservedBytes int64
	Cleaned       bool
}

func NewCleanupJob(jobID, sessionID string) (worker.Job, error) {
	if jobID == "" {
		return worker.Job{}, errors.New("cleanup job ID is required")
	}
	if sessionID == "" {
		return worker.Job{}, errors.New("cleanup session ID is required")
	}
	payload, err := json.Marshal(struct {
		SessionID string `json:"session_id"`
	}{SessionID: sessionID})
	if err != nil {
		return worker.Job{}, fmt.Errorf("marshal cleanup payload: %w", err)
	}
	return worker.Job{
		ID:      jobID,
		Type:    worker.JobCleanupExpired,
		Payload: payload,
	}, nil
}

// CleanupRepository owns the database transaction that marks a session
// expired, releases reserved quota and appends UPLOAD_RELEASED to the ledger.
type CleanupRepository interface {
	GetCleanupRecord(ctx context.Context, sessionID string) (CleanupRecord, error)
	CompleteCleanup(ctx context.Context, sessionID string) error
}

// ObjectRemover must treat deletion of a missing object as success so a
// cleanup job remains safe when retried after a partial failure.
type ObjectRemover interface {
	Delete(ctx context.Context, objectKey string) error
}

type CleanupExpiredUploadHandler struct {
	repository CleanupRepository
	objects    ObjectRemover
}

func NewCleanupExpiredUploadHandler(
	repository CleanupRepository,
	objects ObjectRemover,
) (*CleanupExpiredUploadHandler, error) {
	if repository == nil {
		return nil, errors.New("cleanup repository is required")
	}
	if objects == nil {
		return nil, errors.New("object remover is required")
	}
	return &CleanupExpiredUploadHandler{repository: repository, objects: objects}, nil
}

func (h *CleanupExpiredUploadHandler) Handle(ctx context.Context, job worker.Job) error {
	var payload struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal(job.Payload, &payload); err != nil {
		return fmt.Errorf("decode cleanup payload: %w", err)
	}
	if payload.SessionID == "" {
		return errors.New("cleanup payload requires session_id")
	}

	record, err := h.repository.GetCleanupRecord(ctx, payload.SessionID)
	if err != nil {
		return fmt.Errorf("get cleanup record: %w", err)
	}
	if record.Cleaned {
		return nil
	}
	if err := h.objects.Delete(ctx, record.ObjectKey); err != nil {
		return fmt.Errorf("delete expired upload object: %w", err)
	}
	if err := h.repository.CompleteCleanup(ctx, record.SessionID); err != nil {
		return fmt.Errorf("complete expired upload cleanup: %w", err)
	}
	return nil
}
