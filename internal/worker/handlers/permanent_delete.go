package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
	"github.com/google/uuid"
)

var (
	ErrPermanentDeleteTargetNotFound = errors.New("permanent delete target not found")
	ErrPermanentDeleteTargetState    = errors.New("permanent delete target state is invalid")
)

type PermanentDeletePayload struct {
	OperationID string `json:"operation_id"`
}

type PermanentDeleteTarget struct {
	JobID            uuid.UUID
	DriveID          uuid.UUID
	StorageObjectID  uuid.UUID
	ObjectKey        string
	AlreadyFinalized bool
}

type PermanentDeleteRepository interface {
	GetPermanentDeleteTarget(context.Context, uuid.UUID) (PermanentDeleteTarget, error)
	FinalizePermanentDelete(context.Context, uuid.UUID, bool) (bool, error)
}

type PermanentDeleteObjectStore interface {
	StatObject(context.Context, string) (storage.ObjectInfo, error)
	Delete(context.Context, string) error
}

type PurgeMetrics interface {
	RecordPurgeCompleted(missingObject bool)
}

type PermanentDeleteHandler struct {
	repository PermanentDeleteRepository
	objects    PermanentDeleteObjectStore
	metrics    PurgeMetrics
}

func NewPermanentDeleteHandler(
	repository PermanentDeleteRepository,
	objects PermanentDeleteObjectStore,
	metrics PurgeMetrics,
) (*PermanentDeleteHandler, error) {
	if repository == nil {
		return nil, errors.New("permanent delete repository is required")
	}
	if objects == nil {
		return nil, errors.New("permanent delete object store is required")
	}
	return &PermanentDeleteHandler{repository: repository, objects: objects, metrics: metrics}, nil
}

func (h *PermanentDeleteHandler) Handle(ctx context.Context, job worker.Job) error {
	if job.Type != worker.JobPermanentDelete {
		return fmt.Errorf("permanent delete handler received job type %q", job.Type)
	}
	jobID, err := uuid.Parse(job.ID)
	if err != nil || jobID == uuid.Nil {
		return errors.New("permanent delete job ID must be a valid UUID")
	}
	var payload PermanentDeletePayload
	if err := decodeStrictJSON(job.Payload, &payload); err != nil {
		return fmt.Errorf("decode permanent delete payload: %w", err)
	}
	if payload.OperationID == "" {
		return errors.New("permanent delete operation_id is required")
	}

	// This query completes before any MinIO call. It validates DB state and
	// deliberately returns only the canonical object key to the Worker.
	target, err := h.repository.GetPermanentDeleteTarget(ctx, jobID)
	if err != nil {
		return fmt.Errorf("get permanent delete target: %w", err)
	}
	if target.AlreadyFinalized {
		return nil
	}

	missingObject := false
	if _, err := h.objects.StatObject(ctx, target.ObjectKey); err != nil {
		if errors.Is(err, storage.ErrObjectNotFound) {
			missingObject = true
		} else {
			return fmt.Errorf("stat permanent delete object: %w", err)
		}
	}
	if !missingObject {
		if err := h.objects.Delete(ctx, target.ObjectKey); err != nil {
			if errors.Is(err, storage.ErrObjectNotFound) {
				missingObject = true
			} else {
				return fmt.Errorf("delete permanent object: %w", err)
			}
		}
	}

	// Finalize is a new short transaction. A crash before this point is safe:
	// stale-lease recovery repeats the idempotent delete and reaches finalize.
	finalized, err := h.repository.FinalizePermanentDelete(ctx, jobID, missingObject)
	if err != nil {
		return fmt.Errorf("finalize permanent delete: %w", err)
	}
	if finalized && h.metrics != nil {
		h.metrics.RecordPurgeCompleted(missingObject)
	}
	return nil
}

func NewPermanentDeleteJob(jobID, operationID string) (worker.Job, error) {
	parsedJobID, err := uuid.Parse(jobID)
	if err != nil || parsedJobID == uuid.Nil {
		return worker.Job{}, errors.New("permanent delete job ID must be a valid UUID")
	}
	if operationID == "" {
		return worker.Job{}, errors.New("permanent delete operation ID is required")
	}
	payload, err := json.Marshal(PermanentDeletePayload{OperationID: operationID})
	if err != nil {
		return worker.Job{}, fmt.Errorf("marshal permanent delete payload: %w", err)
	}
	return worker.Job{ID: parsedJobID.String(), Type: worker.JobPermanentDelete, Payload: payload}, nil
}
