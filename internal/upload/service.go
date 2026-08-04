package upload

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/google/uuid"
)

const (
	MaxFileNameRunes       = 1024
	MaxContentTypeBytes    = 255
	MaxIdempotencyKeyBytes = 128
)

type SessionStatus string

const (
	SessionInitiated  SessionStatus = "initiated"
	SessionUploaded   SessionStatus = "uploaded"
	SessionCompleting SessionStatus = "completing"
	SessionCompleted  SessionStatus = "completed"
	SessionExpired    SessionStatus = "expired"
	SessionCancelled  SessionStatus = "cancelled"
	SessionFailed     SessionStatus = "failed"
)

var (
	ErrInvalidUpload       = errors.New("invalid upload request")
	ErrFileTooLarge        = errors.New("file exceeds upload limit")
	ErrIdempotencyConflict = errors.New("idempotency key was used with different upload metadata")
	ErrSessionNotFound     = errors.New("upload session not found")
	ErrSessionExpired      = errors.New("upload session expired")
	ErrSessionRejected     = errors.New("upload session cannot be completed")
	ErrSessionCompleted    = errors.New("completed upload cannot be re-initiated")
	ErrObjectNotFound      = errors.New("uploaded object not found")
	ErrObjectSizeMismatch  = errors.New("uploaded object size does not match declared size")
	ErrObjectTypeMismatch  = errors.New("uploaded object content type does not match declared type")
	ErrCompensationFailed  = errors.New("invalid upload compensation failed")
)

type Session struct {
	ID              uuid.UUID
	DriveID         uuid.UUID
	ItemID          uuid.UUID
	StorageObjectID uuid.UUID
	OwnerUserID     uuid.UUID
	DriveStatus     string
	ObjectKey       string
	FileName        string
	ContentType     string
	DeclaredBytes   int64
	ReservedBytes   int64
	IdempotencyKey  string
	Status          SessionStatus
	ExpiresAt       time.Time
	CreatedAt       time.Time
}

type InitiateRequest struct {
	OwnerUserID    uuid.UUID
	FileName       string
	ContentType    string
	DeclaredBytes  int64
	IdempotencyKey string
}

type InitiateResult struct {
	Session         Session
	UploadURL       string
	RequiredHeaders map[string]string
	Created         bool
}

type CompleteRequest struct {
	OwnerUserID uuid.UUID
	SessionID   uuid.UUID
}

type Job struct {
	ID     uuid.UUID
	Type   string
	Status string
}

type CompleteResult struct {
	Item cloud.Item
	Job  Job
}

type InitiateDraft struct {
	SessionID       uuid.UUID
	ItemID          uuid.UUID
	StorageObjectID uuid.UUID
	OwnerUserID     uuid.UUID
	ObjectKey       string
	FileName        string
	ContentType     string
	DeclaredBytes   int64
	IdempotencyKey  string
	ExpiresAt       time.Time
}

type Repository interface {
	Initiate(ctx context.Context, draft InitiateDraft) (Session, bool, error)
	GetSession(ctx context.Context, ownerUserID, sessionID uuid.UUID) (Session, error)
	GetCompleted(
		ctx context.Context,
		ownerUserID, sessionID uuid.UUID,
	) (CompleteResult, error)
	Finalize(
		ctx context.Context,
		ownerUserID, sessionID uuid.UUID,
		object storage.ObjectInfo,
	) (CompleteResult, error)
	Reject(
		ctx context.Context,
		ownerUserID, sessionID uuid.UUID,
		failureCode, failureDetail string,
	) error
}

type ObjectStore interface {
	PresignUpload(ctx context.Context, objectKey string, expiresIn time.Duration) (string, error)
	StatObject(ctx context.Context, objectKey string) (storage.ObjectInfo, error)
	Delete(ctx context.Context, objectKey string) error
}

type Service struct {
	repository Repository
	objects    ObjectStore
	maxBytes   int64
	urlTTL     time.Duration
	now        func() time.Time
	newID      func() uuid.UUID
}

func NewService(
	repository Repository,
	objects ObjectStore,
	maxBytes int64,
	urlTTL time.Duration,
) (*Service, error) {
	if repository == nil {
		return nil, errors.New("upload repository is required")
	}
	if objects == nil {
		return nil, errors.New("upload object store is required")
	}
	if maxBytes <= 0 {
		return nil, errors.New("maximum upload size must be positive")
	}
	if urlTTL <= 0 {
		return nil, errors.New("upload URL TTL must be positive")
	}
	return &Service{
		repository: repository,
		objects:    objects,
		maxBytes:   maxBytes,
		urlTTL:     urlTTL,
		now:        time.Now,
		newID:      uuid.New,
	}, nil
}

func (s *Service) Initiate(
	ctx context.Context,
	request InitiateRequest,
) (InitiateResult, error) {
	request.FileName = normalizeFileName(request.FileName)
	request.IdempotencyKey = strings.TrimSpace(request.IdempotencyKey)
	mediaType, _, mediaTypeErr := mime.ParseMediaType(request.ContentType)

	switch {
	case request.OwnerUserID == uuid.Nil:
		return InitiateResult{}, fmt.Errorf("%w: owner user ID is required", ErrInvalidUpload)
	case request.FileName == "":
		return InitiateResult{}, fmt.Errorf("%w: file name is required", ErrInvalidUpload)
	case strings.ContainsRune(request.FileName, '\x00'):
		return InitiateResult{}, fmt.Errorf("%w: file name contains an invalid character", ErrInvalidUpload)
	case utf8.RuneCountInString(request.FileName) > MaxFileNameRunes:
		return InitiateResult{}, fmt.Errorf(
			"%w: file name must not exceed %d characters",
			ErrInvalidUpload,
			MaxFileNameRunes,
		)
	case mediaTypeErr != nil ||
		!validMediaType(mediaType) ||
		len(mediaType) > MaxContentTypeBytes:
		return InitiateResult{}, fmt.Errorf("%w: content type is invalid", ErrInvalidUpload)
	case request.IdempotencyKey == "":
		return InitiateResult{}, fmt.Errorf("%w: Idempotency-Key is required", ErrInvalidUpload)
	case len(request.IdempotencyKey) > MaxIdempotencyKeyBytes:
		return InitiateResult{}, fmt.Errorf(
			"%w: Idempotency-Key must not exceed %d bytes",
			ErrInvalidUpload,
			MaxIdempotencyKeyBytes,
		)
	}
	if err := ValidateSize(request.DeclaredBytes, s.maxBytes); err != nil {
		return InitiateResult{}, err
	}
	request.ContentType = mediaType

	now := s.now().UTC()
	objectID := s.newID()
	draft := InitiateDraft{
		SessionID:       s.newID(),
		ItemID:          s.newID(),
		StorageObjectID: objectID,
		OwnerUserID:     request.OwnerUserID,
		ObjectKey: fmt.Sprintf(
			"uploads/%s/%s",
			request.OwnerUserID.String(),
			objectID.String(),
		),
		FileName:       request.FileName,
		ContentType:    request.ContentType,
		DeclaredBytes:  request.DeclaredBytes,
		IdempotencyKey: request.IdempotencyKey,
		ExpiresAt:      now.Add(s.urlTTL),
	}

	// Presigning is performed before quota reservation. If signing fails,
	// PostgreSQL remains unchanged and there is no quota to compensate.
	draftURL, err := s.objects.PresignUpload(ctx, draft.ObjectKey, s.urlTTL)
	if err != nil {
		return InitiateResult{}, fmt.Errorf("presign upload: %w", err)
	}

	session, created, err := s.repository.Initiate(ctx, draft)
	if err != nil {
		return InitiateResult{}, fmt.Errorf("initiate upload: %w", err)
	}

	uploadURL := draftURL
	if session.ObjectKey != draft.ObjectKey {
		remaining := session.ExpiresAt.Sub(now)
		if remaining <= 0 {
			return InitiateResult{}, ErrSessionExpired
		}
		uploadURL, err = s.objects.PresignUpload(ctx, session.ObjectKey, remaining)
		if err != nil {
			return InitiateResult{}, fmt.Errorf("presign existing upload: %w", err)
		}
	}

	return InitiateResult{
		Session:   session,
		UploadURL: uploadURL,
		RequiredHeaders: map[string]string{
			"Content-Type":  session.ContentType,
			"If-None-Match": "*",
		},
		Created: created,
	}, nil
}

func (s *Service) Complete(
	ctx context.Context,
	request CompleteRequest,
) (CompleteResult, error) {
	if request.OwnerUserID == uuid.Nil || request.SessionID == uuid.Nil {
		return CompleteResult{}, fmt.Errorf(
			"%w: owner user ID and upload session ID are required",
			ErrInvalidUpload,
		)
	}

	session, err := s.repository.GetSession(
		ctx,
		request.OwnerUserID,
		request.SessionID,
	)
	if err != nil {
		return CompleteResult{}, fmt.Errorf("get upload session: %w", err)
	}
	switch session.Status {
	case SessionCompleted:
		return s.repository.GetCompleted(ctx, request.OwnerUserID, request.SessionID)
	case SessionExpired:
		return CompleteResult{}, ErrSessionExpired
	case SessionCancelled, SessionFailed:
		return CompleteResult{}, ErrSessionRejected
	}
	if session.DriveStatus != cloud.DriveStatusActive {
		return CompleteResult{}, cloud.ErrDriveNotActive
	}
	if !s.now().Before(session.ExpiresAt) {
		return CompleteResult{}, ErrSessionExpired
	}

	info, err := s.objects.StatObject(ctx, session.ObjectKey)
	if errors.Is(err, storage.ErrObjectNotFound) {
		return CompleteResult{}, ErrObjectNotFound
	}
	if err != nil {
		return CompleteResult{}, fmt.Errorf("stat uploaded object: %w", err)
	}
	if err := ValidateSize(info.SizeBytes, s.maxBytes); err != nil {
		return CompleteResult{}, s.rejectInvalidObject(ctx, session, "FILE_TOO_LARGE", err)
	}
	if info.SizeBytes != session.DeclaredBytes {
		return CompleteResult{}, s.rejectInvalidObject(
			ctx,
			session,
			"SIZE_MISMATCH",
			ErrObjectSizeMismatch,
		)
	}
	actualType, _, typeErr := mime.ParseMediaType(info.ContentType)
	if typeErr != nil || actualType != session.ContentType {
		return CompleteResult{}, s.rejectInvalidObject(
			ctx,
			session,
			"CONTENT_TYPE_MISMATCH",
			ErrObjectTypeMismatch,
		)
	}
	info.ContentType = actualType

	result, err := s.repository.Finalize(
		ctx,
		request.OwnerUserID,
		request.SessionID,
		info,
	)
	if err != nil {
		return CompleteResult{}, fmt.Errorf("finalize upload: %w", err)
	}
	return result, nil
}

func (s *Service) rejectInvalidObject(
	ctx context.Context,
	session Session,
	failureCode string,
	cause error,
) error {
	if err := s.repository.Reject(
		ctx,
		session.OwnerUserID,
		session.ID,
		failureCode,
		cause.Error(),
	); err != nil {
		return fmt.Errorf("%w: reject upload metadata: %v", ErrCompensationFailed, err)
	}
	if err := s.objects.Delete(ctx, session.ObjectKey); err != nil {
		return fmt.Errorf("%w: delete invalid object: %v", ErrCompensationFailed, err)
	}
	return cause
}

func normalizeFileName(value string) string {
	value = strings.TrimSpace(strings.ReplaceAll(value, `\`, "/"))
	value = path.Base(value)
	if value == "." || value == ".." || value == "/" {
		return ""
	}
	return strings.TrimSpace(value)
}

func validMediaType(value string) bool {
	major, minor, found := strings.Cut(value, "/")
	return found && major != "" && minor != "" && !strings.Contains(minor, "/")
}

func ValidateSize(sizeBytes, maximumBytes int64) error {
	if sizeBytes <= 0 {
		return fmt.Errorf("%w: file size must be positive", ErrInvalidUpload)
	}
	if sizeBytes > maximumBytes {
		return fmt.Errorf(
			"%w: file is %d bytes; maximum is %d bytes",
			ErrFileTooLarge,
			sizeBytes,
			maximumBytes,
		)
	}
	return nil
}
