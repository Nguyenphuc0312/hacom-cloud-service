package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
	"github.com/google/uuid"
)

var (
	ErrCleanupTargetNotFound = errors.New("cleanup target not found")
	ErrCleanupNotExpired     = errors.New("upload session has not expired")
	ErrCleanupNotEligible    = errors.New("upload session is not eligible for cleanup")
	ErrCleanupQuotaInvariant = errors.New("reserved quota is inconsistent with upload session")
)

type CleanupExpiredUploadPayload struct {
	SessionID string `json:"session_id"`
}

type CleanupTarget struct {
	SessionID       string
	DriveID         string
	ItemID          string
	StorageObjectID string
	ObjectKey       string
	ReservedBytes   int64
	AlreadyCleaned  bool
}

func NewCleanupJob(jobID, sessionID string) (worker.Job, error) {
	if jobID == "" {
		return worker.Job{}, errors.New("cleanup job ID is required")
	}
	if _, err := uuid.Parse(sessionID); err != nil {
		return worker.Job{}, fmt.Errorf("cleanup session ID must be a valid UUID: %w", err)
	}
	payload, err := json.Marshal(CleanupExpiredUploadPayload{SessionID: sessionID})
	if err != nil {
		return worker.Job{}, fmt.Errorf("marshal cleanup payload: %w", err)
	}
	return worker.Job{
		ID:      jobID,
		Type:    worker.JobCleanupExpired,
		Payload: payload,
	}, nil
}

// CleanupRepository owns the database transactions for enqueueing expired
// sessions and releasing their reserved quota exactly once.
type CleanupRepository interface {
	EnqueueExpiredUploadJobs(ctx context.Context, limit int) (int, error)
	GetCleanupTarget(ctx context.Context, sessionID string) (CleanupTarget, error)
	CompleteCleanup(ctx context.Context, sessionID string) error
}

// ObjectRemover must treat deletion of a missing object as success so cleanup
// remains safe when retried after a partial failure.
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
	if job.Type != worker.JobCleanupExpired {
		return fmt.Errorf("cleanup handler received job type %q", job.Type)
	}

	var payload CleanupExpiredUploadPayload
	if err := decodeStrictJSON(job.Payload, &payload); err != nil {
		return fmt.Errorf("decode cleanup payload: %w", err)
	}
	if _, err := uuid.Parse(payload.SessionID); err != nil {
		return fmt.Errorf("cleanup payload session_id must be a valid UUID: %w", err)
	}

	target, err := h.repository.GetCleanupTarget(ctx, payload.SessionID)
	if err != nil {
		return fmt.Errorf("get cleanup target: %w", err)
	}
	if target.AlreadyCleaned {
		return nil
	}
	if err := h.objects.Delete(ctx, target.ObjectKey); err != nil {
		return fmt.Errorf("delete expired upload object: %w", err)
	}
	if err := h.repository.CompleteCleanup(ctx, target.SessionID); err != nil {
		return fmt.Errorf("complete expired upload cleanup: %w", err)
	}
	return nil
}
