package fileaccess

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/google/uuid"
)

var (
	ErrInvalidInput      = errors.New("invalid file access input")
	ErrNotFound          = errors.New("cloud file not found")
	ErrNotFile           = errors.New("cloud item is not a file")
	ErrNotReady          = errors.New("cloud file is not ready")
	ErrDeletePending     = errors.New("cloud file permanent delete is pending")
	ErrObjectUnavailable = errors.New("cloud file object is unavailable")
)

type Target struct {
	ItemID      uuid.UUID
	ObjectKey   string
	FileName    string
	ContentType string
	SizeBytes   int64
	PurgeAfter  *time.Time
}

type Access struct {
	ItemID      uuid.UUID
	URL         string
	ExpiresAt   time.Time
	FileName    string
	ContentType string
	SizeBytes   int64
}

type Repository interface {
	GetFileAccessTarget(
		ctx context.Context,
		ownerUserID uuid.UUID,
		itemID uuid.UUID,
	) (Target, error)
}

type ObjectStore interface {
	StatObject(ctx context.Context, objectKey string) (storage.ObjectInfo, error)
	PresignDownload(
		ctx context.Context,
		objectKey string,
		expiresIn time.Duration,
	) (string, error)
}

type Service struct {
	repository Repository
	objects    ObjectStore
	urlTTL     time.Duration
	now        func() time.Time
}

func NewService(
	repository Repository,
	objects ObjectStore,
	urlTTL time.Duration,
) (*Service, error) {
	if repository == nil {
		return nil, errors.New("file access repository is required")
	}
	if objects == nil {
		return nil, errors.New("file access object store is required")
	}
	if urlTTL <= 0 {
		return nil, errors.New("download URL TTL must be positive")
	}
	return &Service{
		repository: repository,
		objects:    objects,
		urlTTL:     urlTTL,
		now:        time.Now,
	}, nil
}

func (s *Service) CreateAccess(
	ctx context.Context,
	ownerUserID uuid.UUID,
	itemID uuid.UUID,
) (Access, error) {
	if ownerUserID == uuid.Nil || itemID == uuid.Nil {
		return Access{}, ErrInvalidInput
	}

	target, err := s.repository.GetFileAccessTarget(ctx, ownerUserID, itemID)
	if err != nil {
		return Access{}, err
	}
	if strings.TrimSpace(target.ObjectKey) == "" ||
		strings.TrimSpace(target.FileName) == "" ||
		strings.TrimSpace(target.ContentType) == "" ||
		target.SizeBytes <= 0 {
		return Access{}, ErrObjectUnavailable
	}
	now := s.now().UTC()
	if target.PurgeAfter != nil && !now.Before(*target.PurgeAfter) {
		return Access{}, ErrDeletePending
	}

	info, err := s.objects.StatObject(ctx, target.ObjectKey)
	if errors.Is(err, storage.ErrObjectNotFound) {
		return Access{}, ErrObjectUnavailable
	}
	if err != nil {
		return Access{}, fmt.Errorf("stat file object before signing: %w", err)
	}
	if info.SizeBytes != target.SizeBytes {
		return Access{}, fmt.Errorf(
			"%w: object has %d bytes, metadata expects %d",
			ErrObjectUnavailable,
			info.SizeBytes,
			target.SizeBytes,
		)
	}

	// StatObject can consume part of the remaining restore window. Re-read the
	// clock so the signed URL can never outlive purgeAfter because of that I/O.
	now = s.now().UTC()
	if target.PurgeAfter != nil && !now.Before(*target.PurgeAfter) {
		return Access{}, ErrDeletePending
	}
	accessTTL := s.urlTTL
	if target.PurgeAfter != nil && target.PurgeAfter.Sub(now) < accessTTL {
		accessTTL = target.PurgeAfter.Sub(now)
	}
	if accessTTL < time.Second {
		return Access{}, ErrDeletePending
	}
	signedURL, err := s.objects.PresignDownload(
		ctx,
		target.ObjectKey,
		accessTTL,
	)
	if err != nil {
		return Access{}, fmt.Errorf("presign cloud file download: %w", err)
	}
	return Access{
		ItemID:      target.ItemID,
		URL:         signedURL,
		ExpiresAt:   now.Add(accessTTL),
		FileName:    target.FileName,
		ContentType: target.ContentType,
		SizeBytes:   target.SizeBytes,
	}, nil
}
