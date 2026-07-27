package quota

import (
	"context"
	"errors"
	"fmt"
)

const DefaultLimitBytes int64 = 5 * 1024 * 1024 * 1024

var (
	ErrInvalidOwner          = errors.New("owner ID is required")
	ErrInvalidIdempotencyKey = errors.New("idempotency key is required")
	ErrEmptyContent          = errors.New("content must not be empty")
	ErrQuotaExceeded         = errors.New("quota exceeded")
	ErrIdempotencyConflict   = errors.New("idempotency key was already used for another operation")
)

type Usage struct {
	OwnerID       string
	UsedBytes     int64
	ReservedBytes int64
	LimitBytes    int64
}

type EventType string

const (
	EventTextCreated    EventType = "TEXT_CREATED"
	EventLinkCreated    EventType = "LINK_CREATED"
	EventUploadReleased EventType = "UPLOAD_RELEASED"
)

type LedgerEntry struct {
	OwnerID        string
	IdempotencyKey string
	EventType      EventType
	DeltaBytes     int64
}

type ApplyRequest struct {
	OwnerID        string
	IdempotencyKey string
	EventType      EventType
	DeltaBytes     int64
}

type ApplyResult struct {
	Usage   Usage
	Entry   LedgerEntry
	Applied bool
}

// Repository is the persistence contract for quota and its usage ledger.
// ApplyUsage must atomically update used bytes and append the ledger entry.
// Repeating an identical idempotency key must return the original result
// without changing either value.
type Repository interface {
	EnsureQuota(ctx context.Context, ownerID string, limitBytes int64) (Usage, error)
	GetUsage(ctx context.Context, ownerID string) (Usage, error)
	ApplyUsage(ctx context.Context, request ApplyRequest) (ApplyResult, error)
}

type Service struct {
	repository Repository
}

func NewService(repository Repository) (*Service, error) {
	if repository == nil {
		return nil, errors.New("quota repository is required")
	}
	return &Service{repository: repository}, nil
}

func (s *Service) EnsureDefaultQuota(ctx context.Context, ownerID string) (Usage, error) {
	if ownerID == "" {
		return Usage{}, ErrInvalidOwner
	}
	return s.repository.EnsureQuota(ctx, ownerID, DefaultLimitBytes)
}

func (s *Service) GetUsage(ctx context.Context, ownerID string) (Usage, error) {
	if ownerID == "" {
		return Usage{}, ErrInvalidOwner
	}
	return s.repository.GetUsage(ctx, ownerID)
}

func (s *Service) AddText(ctx context.Context, ownerID, content, idempotencyKey string) (ApplyResult, error) {
	return s.addContent(ctx, ownerID, content, idempotencyKey, EventTextCreated)
}

func (s *Service) AddLink(ctx context.Context, ownerID, link, idempotencyKey string) (ApplyResult, error) {
	return s.addContent(ctx, ownerID, link, idempotencyKey, EventLinkCreated)
}

func (s *Service) addContent(
	ctx context.Context,
	ownerID string,
	content string,
	idempotencyKey string,
	eventType EventType,
) (ApplyResult, error) {
	if ownerID == "" {
		return ApplyResult{}, ErrInvalidOwner
	}
	if idempotencyKey == "" {
		return ApplyResult{}, ErrInvalidIdempotencyKey
	}
	if content == "" {
		return ApplyResult{}, ErrEmptyContent
	}

	if _, err := s.EnsureDefaultQuota(ctx, ownerID); err != nil {
		return ApplyResult{}, fmt.Errorf("ensure default quota: %w", err)
	}

	result, err := s.repository.ApplyUsage(ctx, ApplyRequest{
		OwnerID:        ownerID,
		IdempotencyKey: idempotencyKey,
		EventType:      eventType,
		DeltaBytes:     UTF8Bytes(content),
	})
	if err != nil {
		return ApplyResult{}, fmt.Errorf("apply quota usage: %w", err)
	}
	return result, nil
}

func UTF8Bytes(value string) int64 {
	return int64(len([]byte(value)))
}
