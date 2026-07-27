package upload

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	cloudfile "github.com/Nguyenphuc0312/hacom-cloud-service/internal/file"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

var (
	ErrSessionNotFound    = errors.New("upload session not found")
	ErrSessionForbidden   = errors.New("upload session does not belong to owner")
	ErrSessionRejected    = errors.New("upload session was rejected")
	ErrObjectSizeMismatch = errors.New("object size does not match declared size")
)

type CompleteRequest struct {
	OwnerID   string
	SessionID string
}

type CompleteResult struct {
	Item cloudfile.Item
	Job  worker.Job
}

type FinalizeRequest struct {
	OwnerID   string
	SessionID string
	Item      cloudfile.Item
	Job       worker.Job
}

// CompletionRepository owns the transaction boundary for completion.
// Finalize must update the session, move reserved quota to used quota, create
// the file item and create the HASH_FILE job in one atomic transaction.
type CompletionRepository interface {
	GetSession(ctx context.Context, sessionID string) (Session, error)
	GetCompleted(ctx context.Context, ownerID, sessionID string) (CompleteResult, error)
	Finalize(ctx context.Context, request FinalizeRequest) (CompleteResult, error)
	Reject(ctx context.Context, ownerID, sessionID string) error
}

type ObjectStore interface {
	StatObject(ctx context.Context, objectKey string) (storage.ObjectInfo, error)
	Delete(ctx context.Context, objectKey string) error
}

type IDGenerator func() (string, error)

type CompleteService struct {
	repository CompletionRepository
	objects    ObjectStore
	maxBytes   int64
	newID      IDGenerator
}

func NewCompleteService(
	repository CompletionRepository,
	objects ObjectStore,
	maxBytes int64,
	options ...func(*CompleteService),
) (*CompleteService, error) {
	if repository == nil {
		return nil, errors.New("completion repository is required")
	}
	if objects == nil {
		return nil, errors.New("object store is required")
	}
	if maxBytes <= 0 {
		return nil, errors.New("maximum upload size must be positive")
	}
	service := &CompleteService{
		repository: repository,
		objects:    objects,
		maxBytes:   maxBytes,
		newID:      randomID,
	}
	for _, option := range options {
		option(service)
	}
	return service, nil
}

func WithIDGenerator(generator IDGenerator) func(*CompleteService) {
	return func(service *CompleteService) {
		if generator != nil {
			service.newID = generator
		}
	}
}

func (s *CompleteService) Complete(ctx context.Context, request CompleteRequest) (CompleteResult, error) {
	if request.OwnerID == "" {
		return CompleteResult{}, errors.New("owner ID is required")
	}
	if request.SessionID == "" {
		return CompleteResult{}, errors.New("upload session ID is required")
	}

	session, err := s.repository.GetSession(ctx, request.SessionID)
	if err != nil {
		return CompleteResult{}, fmt.Errorf("get upload session: %w", err)
	}
	if session.OwnerID != request.OwnerID {
		return CompleteResult{}, ErrSessionForbidden
	}
	switch session.Status {
	case SessionCompleted:
		return s.repository.GetCompleted(ctx, request.OwnerID, request.SessionID)
	case SessionRejected:
		return CompleteResult{}, ErrSessionRejected
	}

	info, err := s.objects.StatObject(ctx, session.ObjectKey)
	if err != nil {
		return CompleteResult{}, fmt.Errorf("stat uploaded object: %w", err)
	}
	if err := ValidateSize(info.SizeBytes, s.maxBytes); err != nil {
		return CompleteResult{}, s.rejectInvalidObject(ctx, session, err)
	}
	if info.SizeBytes != session.SizeBytes {
		return CompleteResult{}, s.rejectInvalidObject(ctx, session, ErrObjectSizeMismatch)
	}

	itemID, err := s.newID()
	if err != nil {
		return CompleteResult{}, fmt.Errorf("generate item ID: %w", err)
	}
	jobID, err := s.newID()
	if err != nil {
		return CompleteResult{}, fmt.Errorf("generate job ID: %w", err)
	}
	payload, err := json.Marshal(struct {
		ItemID    string `json:"item_id"`
		ObjectKey string `json:"object_key"`
	}{
		ItemID:    itemID,
		ObjectKey: session.ObjectKey,
	})
	if err != nil {
		return CompleteResult{}, fmt.Errorf("marshal HASH_FILE payload: %w", err)
	}

	result, err := s.repository.Finalize(ctx, FinalizeRequest{
		OwnerID:   request.OwnerID,
		SessionID: request.SessionID,
		Item: cloudfile.Item{
			ID:          itemID,
			OwnerID:     request.OwnerID,
			Name:        session.FileName,
			ObjectKey:   session.ObjectKey,
			ContentType: info.ContentType,
			SizeBytes:   info.SizeBytes,
			Status:      cloudfile.StatusProcessing,
		},
		Job: worker.Job{
			ID:      jobID,
			Type:    worker.JobHashFile,
			Payload: payload,
		},
	})
	if err != nil {
		return CompleteResult{}, fmt.Errorf("finalize upload: %w", err)
	}
	return result, nil
}

func (s *CompleteService) rejectInvalidObject(ctx context.Context, session Session, cause error) error {
	if err := s.objects.Delete(ctx, session.ObjectKey); err != nil {
		return fmt.Errorf("%w; delete invalid object: %v", cause, err)
	}
	if err := s.repository.Reject(ctx, session.OwnerID, session.ID); err != nil {
		return fmt.Errorf("%w; release reserved quota: %v", cause, err)
	}
	return cause
}

func randomID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}
