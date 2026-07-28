package upload

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/google/uuid"
)

type fakeRepository struct {
	initiate     func(context.Context, InitiateDraft) (Session, bool, error)
	getSession   func(context.Context, uuid.UUID, uuid.UUID) (Session, error)
	getCompleted func(context.Context, uuid.UUID, uuid.UUID) (CompleteResult, error)
	finalize     func(
		context.Context,
		uuid.UUID,
		uuid.UUID,
		storage.ObjectInfo,
	) (CompleteResult, error)
	reject func(context.Context, uuid.UUID, uuid.UUID, string, string) error
}

func (r fakeRepository) Initiate(
	ctx context.Context,
	draft InitiateDraft,
) (Session, bool, error) {
	return r.initiate(ctx, draft)
}

func (r fakeRepository) GetSession(
	ctx context.Context,
	ownerID, sessionID uuid.UUID,
) (Session, error) {
	session, err := r.getSession(ctx, ownerID, sessionID)
	if session.DriveStatus == "" {
		session.DriveStatus = cloud.DriveStatusActive
	}
	return session, err
}

func (r fakeRepository) GetCompleted(
	ctx context.Context,
	ownerID, sessionID uuid.UUID,
) (CompleteResult, error) {
	return r.getCompleted(ctx, ownerID, sessionID)
}

func (r fakeRepository) Finalize(
	ctx context.Context,
	ownerID, sessionID uuid.UUID,
	object storage.ObjectInfo,
) (CompleteResult, error) {
	return r.finalize(ctx, ownerID, sessionID, object)
}

func (r fakeRepository) Reject(
	ctx context.Context,
	ownerID, sessionID uuid.UUID,
	code, detail string,
) error {
	return r.reject(ctx, ownerID, sessionID, code, detail)
}

type fakeObjectStore struct {
	presign func(context.Context, string, time.Duration) (string, error)
	stat    func(context.Context, string) (storage.ObjectInfo, error)
	delete  func(context.Context, string) error
}

func (s fakeObjectStore) PresignUpload(
	ctx context.Context,
	key string,
	ttl time.Duration,
) (string, error) {
	return s.presign(ctx, key, ttl)
}

func (s fakeObjectStore) StatObject(
	ctx context.Context,
	key string,
) (storage.ObjectInfo, error) {
	return s.stat(ctx, key)
}

func (s fakeObjectStore) Delete(ctx context.Context, key string) error {
	return s.delete(ctx, key)
}

func newInitiateService(
	t *testing.T,
	repository Repository,
	objects ObjectStore,
) *Service {
	t.Helper()
	service, err := NewService(repository, objects, 100_000_000, 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	service.now = func() time.Time {
		return time.Date(2026, 7, 28, 8, 0, 0, 0, time.UTC)
	}
	return service
}

func TestInitiateBuildsSafeObjectKeyAndNormalizesMetadata(t *testing.T) {
	ownerID := uuid.New()
	var received InitiateDraft
	repository := fakeRepository{
		initiate: func(
			_ context.Context,
			draft InitiateDraft,
		) (Session, bool, error) {
			received = draft
			return sessionFromDraft(draft), true, nil
		},
	}
	var signedKey string
	objects := fakeObjectStore{
		presign: func(
			_ context.Context,
			key string,
			ttl time.Duration,
		) (string, error) {
			signedKey = key
			if ttl != 15*time.Minute {
				t.Fatalf("presign TTL = %s", ttl)
			}
			return "http://minio/upload", nil
		},
	}
	service := newInitiateService(t, repository, objects)

	result, err := service.Initiate(context.Background(), InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "  ../../Báo cáo.pdf  ",
		ContentType:    "application/pdf; charset=binary",
		DeclaredBytes:  100_000_000,
		IdempotencyKey: " upload-1 ",
	})
	if err != nil {
		t.Fatal(err)
	}

	if result.UploadURL != "http://minio/upload" || !result.Created {
		t.Fatalf("initiate result = %+v", result)
	}
	if received.FileName != "Báo cáo.pdf" ||
		received.ContentType != "application/pdf" ||
		received.IdempotencyKey != "upload-1" {
		t.Fatalf("normalized draft = %+v", received)
	}
	if signedKey != received.ObjectKey ||
		!strings.HasPrefix(signedKey, "uploads/"+ownerID.String()+"/") {
		t.Fatalf("object key = %q", signedKey)
	}
	if strings.Contains(signedKey, "Báo cáo") || strings.Contains(signedKey, "..") {
		t.Fatalf("object key must not contain user file name: %q", signedKey)
	}
	if result.RequiredHeaders["Content-Type"] != "application/pdf" {
		t.Fatalf("required headers = %+v", result.RequiredHeaders)
	}
	if result.RequiredHeaders["If-None-Match"] != "*" {
		t.Fatalf("required headers = %+v", result.RequiredHeaders)
	}
}

func TestInitiateRejectsInvalidInputBeforePresignOrDatabase(t *testing.T) {
	repositoryCalls := 0
	presignCalls := 0
	repository := fakeRepository{
		initiate: func(
			context.Context,
			InitiateDraft,
		) (Session, bool, error) {
			repositoryCalls++
			return Session{}, false, nil
		},
	}
	objects := fakeObjectStore{
		presign: func(context.Context, string, time.Duration) (string, error) {
			presignCalls++
			return "", nil
		},
	}
	service := newInitiateService(t, repository, objects)

	tests := []InitiateRequest{
		{OwnerUserID: uuid.New(), FileName: "", ContentType: "text/plain", DeclaredBytes: 1, IdempotencyKey: "a"},
		{OwnerUserID: uuid.New(), FileName: "a.txt", ContentType: "invalid", DeclaredBytes: 1, IdempotencyKey: "a"},
		{OwnerUserID: uuid.New(), FileName: "a.txt", ContentType: "text/plain", DeclaredBytes: 0, IdempotencyKey: "a"},
		{OwnerUserID: uuid.New(), FileName: "a.txt", ContentType: "text/plain", DeclaredBytes: 100_000_001, IdempotencyKey: "a"},
		{OwnerUserID: uuid.New(), FileName: "a.txt", ContentType: "text/plain", DeclaredBytes: 1},
	}
	for _, input := range tests {
		if _, err := service.Initiate(context.Background(), input); err == nil {
			t.Fatalf("expected validation error for %+v", input)
		}
	}
	if repositoryCalls != 0 || presignCalls != 0 {
		t.Fatalf("repository/presign calls = %d/%d, want 0/0", repositoryCalls, presignCalls)
	}
}

func TestPresignFailureDoesNotReserveQuota(t *testing.T) {
	repositoryCalls := 0
	service := newInitiateService(t, fakeRepository{
		initiate: func(
			context.Context,
			InitiateDraft,
		) (Session, bool, error) {
			repositoryCalls++
			return Session{}, false, nil
		},
	}, fakeObjectStore{
		presign: func(context.Context, string, time.Duration) (string, error) {
			return "", errors.New("signer unavailable")
		},
	})

	_, err := service.Initiate(context.Background(), InitiateRequest{
		OwnerUserID:    uuid.New(),
		FileName:       "a.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  1,
		IdempotencyKey: "key",
	})
	if err == nil || repositoryCalls != 0 {
		t.Fatalf("error/repository calls = %v/%d", err, repositoryCalls)
	}
}

func TestIdempotentInitiatePresignsExistingObject(t *testing.T) {
	ownerID := uuid.New()
	existingKey := "uploads/" + ownerID.String() + "/" + uuid.NewString()
	existing := Session{
		ID:             uuid.New(),
		ItemID:         uuid.New(),
		OwnerUserID:    ownerID,
		ObjectKey:      existingKey,
		FileName:       "a.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  4,
		ReservedBytes:  4,
		IdempotencyKey: "same",
		Status:         SessionInitiated,
		ExpiresAt:      time.Date(2026, 7, 28, 8, 10, 0, 0, time.UTC),
	}
	var signedKeys []string
	service := newInitiateService(t, fakeRepository{
		initiate: func(
			context.Context,
			InitiateDraft,
		) (Session, bool, error) {
			return existing, false, nil
		},
	}, fakeObjectStore{
		presign: func(_ context.Context, key string, _ time.Duration) (string, error) {
			signedKeys = append(signedKeys, key)
			return "http://minio/" + key, nil
		},
	})

	result, err := service.Initiate(context.Background(), InitiateRequest{
		OwnerUserID:    ownerID,
		FileName:       "a.txt",
		ContentType:    "text/plain",
		DeclaredBytes:  4,
		IdempotencyKey: "same",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Created || result.Session.ID != existing.ID ||
		result.UploadURL != "http://minio/"+existingKey {
		t.Fatalf("idempotent result = %+v", result)
	}
	if len(signedKeys) != 2 || signedKeys[1] != existingKey {
		t.Fatalf("signed keys = %v", signedKeys)
	}
}

func TestCompleteFinalizesVerifiedObject(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	itemID := uuid.New()
	session := Session{
		ID:            sessionID,
		OwnerUserID:   ownerID,
		ObjectKey:     "uploads/object",
		ContentType:   "text/plain",
		DeclaredBytes: 4,
		ReservedBytes: 4,
		Status:        SessionInitiated,
		ExpiresAt:     time.Date(2026, 7, 28, 8, 10, 0, 0, time.UTC),
	}
	var finalized storage.ObjectInfo
	service := newInitiateService(t, fakeRepository{
		getSession: func(context.Context, uuid.UUID, uuid.UUID) (Session, error) {
			return session, nil
		},
		finalize: func(
			_ context.Context,
			_, _ uuid.UUID,
			object storage.ObjectInfo,
		) (CompleteResult, error) {
			finalized = object
			return CompleteResult{
				Item: cloud.Item{ID: itemID, Status: cloud.ItemStatusProcessing},
			}, nil
		},
	}, fakeObjectStore{
		stat: func(context.Context, string) (storage.ObjectInfo, error) {
			return storage.ObjectInfo{
				SizeBytes:   4,
				ContentType: "text/plain",
				ETag:        "etag",
			}, nil
		},
	})

	result, err := service.Complete(context.Background(), CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   sessionID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Item.ID != itemID || finalized.SizeBytes != 4 {
		t.Fatalf("result/object = %+v/%+v", result, finalized)
	}
}

func TestCompleteRejectsContentTypeMismatch(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	rejectedCode := ""
	service := newInitiateService(t, fakeRepository{
		getSession: func(context.Context, uuid.UUID, uuid.UUID) (Session, error) {
			return Session{
				ID:            sessionID,
				OwnerUserID:   ownerID,
				ObjectKey:     "uploads/object",
				ContentType:   "application/pdf",
				DeclaredBytes: 4,
				ReservedBytes: 4,
				Status:        SessionInitiated,
				ExpiresAt:     time.Date(2026, 7, 28, 8, 10, 0, 0, time.UTC),
			}, nil
		},
		reject: func(
			_ context.Context,
			_, _ uuid.UUID,
			code, _ string,
		) error {
			rejectedCode = code
			return nil
		},
	}, fakeObjectStore{
		stat: func(context.Context, string) (storage.ObjectInfo, error) {
			return storage.ObjectInfo{SizeBytes: 4, ContentType: "text/plain"}, nil
		},
		delete: func(context.Context, string) error { return nil },
	})

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   sessionID,
	})
	if !errors.Is(err, ErrObjectTypeMismatch) ||
		rejectedCode != "CONTENT_TYPE_MISMATCH" {
		t.Fatalf("error/code = %v/%s", err, rejectedCode)
	}
}

func TestCompleteRejectsSizeMismatchAndDeletesObject(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	session := Session{
		ID:            sessionID,
		OwnerUserID:   ownerID,
		ObjectKey:     "uploads/object",
		DeclaredBytes: 10,
		ReservedBytes: 10,
		Status:        SessionInitiated,
		ExpiresAt:     time.Date(2026, 7, 28, 8, 10, 0, 0, time.UTC),
	}
	rejected := false
	deleted := false
	service := newInitiateService(t, fakeRepository{
		getSession: func(context.Context, uuid.UUID, uuid.UUID) (Session, error) {
			return session, nil
		},
		reject: func(
			_ context.Context,
			_, _ uuid.UUID,
			code, _ string,
		) error {
			rejected = code == "SIZE_MISMATCH"
			return nil
		},
	}, fakeObjectStore{
		stat: func(context.Context, string) (storage.ObjectInfo, error) {
			return storage.ObjectInfo{SizeBytes: 5}, nil
		},
		delete: func(_ context.Context, key string) error {
			deleted = key == session.ObjectKey
			return nil
		},
	})

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   sessionID,
	})
	if !errors.Is(err, ErrObjectSizeMismatch) || !rejected || !deleted {
		t.Fatalf("error/rejected/deleted = %v/%v/%v", err, rejected, deleted)
	}
}

func TestInvalidObjectCompensationFailureIsReportedAsInternal(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	service := newInitiateService(t, fakeRepository{
		getSession: func(context.Context, uuid.UUID, uuid.UUID) (Session, error) {
			return Session{
				ID:            sessionID,
				OwnerUserID:   ownerID,
				ObjectKey:     "uploads/object",
				DeclaredBytes: 10,
				ReservedBytes: 10,
				Status:        SessionInitiated,
				ExpiresAt:     time.Date(2026, 7, 28, 8, 10, 0, 0, time.UTC),
			}, nil
		},
		reject: func(context.Context, uuid.UUID, uuid.UUID, string, string) error {
			return errors.New("database unavailable")
		},
	}, fakeObjectStore{
		stat: func(context.Context, string) (storage.ObjectInfo, error) {
			return storage.ObjectInfo{SizeBytes: 5}, nil
		},
	})

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   sessionID,
	})
	if !errors.Is(err, ErrCompensationFailed) ||
		errors.Is(err, ErrObjectSizeMismatch) {
		t.Fatalf("error = %v, want only ErrCompensationFailed", err)
	}
}

func TestCompleteMissingObjectKeepsReservation(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	rejectCalls := 0
	service := newInitiateService(t, fakeRepository{
		getSession: func(context.Context, uuid.UUID, uuid.UUID) (Session, error) {
			return Session{
				ID:            sessionID,
				OwnerUserID:   ownerID,
				ObjectKey:     "uploads/missing",
				DeclaredBytes: 4,
				Status:        SessionInitiated,
				ExpiresAt:     time.Date(2026, 7, 28, 8, 10, 0, 0, time.UTC),
			}, nil
		},
		reject: func(context.Context, uuid.UUID, uuid.UUID, string, string) error {
			rejectCalls++
			return nil
		},
	}, fakeObjectStore{
		stat: func(context.Context, string) (storage.ObjectInfo, error) {
			return storage.ObjectInfo{}, storage.ErrObjectNotFound
		},
	})

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   sessionID,
	})
	if !errors.Is(err, ErrObjectNotFound) || rejectCalls != 0 {
		t.Fatalf("error/reject calls = %v/%d", err, rejectCalls)
	}
}

func TestCompletedRetrySkipsMinIOAndReturnsStoredResult(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	expected := CompleteResult{Item: cloud.Item{ID: uuid.New()}}
	statCalls := 0
	service := newInitiateService(t, fakeRepository{
		getSession: func(context.Context, uuid.UUID, uuid.UUID) (Session, error) {
			return Session{ID: sessionID, OwnerUserID: ownerID, Status: SessionCompleted}, nil
		},
		getCompleted: func(context.Context, uuid.UUID, uuid.UUID) (CompleteResult, error) {
			return expected, nil
		},
	}, fakeObjectStore{
		stat: func(context.Context, string) (storage.ObjectInfo, error) {
			statCalls++
			return storage.ObjectInfo{}, nil
		},
	})

	result, err := service.Complete(context.Background(), CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   sessionID,
	})
	if err != nil || result.Item.ID != expected.Item.ID || statCalls != 0 {
		t.Fatalf("result/error/stat calls = %+v/%v/%d", result, err, statCalls)
	}
}

func TestCompleteRejectsSuspendedDriveBeforeMinIO(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	statCalls := 0
	service := newInitiateService(t, fakeRepository{
		getSession: func(context.Context, uuid.UUID, uuid.UUID) (Session, error) {
			return Session{
				ID:          sessionID,
				OwnerUserID: ownerID,
				DriveStatus: "suspended",
				Status:      SessionInitiated,
			}, nil
		},
	}, fakeObjectStore{
		stat: func(context.Context, string) (storage.ObjectInfo, error) {
			statCalls++
			return storage.ObjectInfo{}, nil
		},
	})

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   sessionID,
	})
	if !errors.Is(err, cloud.ErrDriveNotActive) || statCalls != 0 {
		t.Fatalf("error/stat calls = %v/%d", err, statCalls)
	}
}

func TestCompleteRejectsExpiredSessionBeforeMinIO(t *testing.T) {
	ownerID := uuid.New()
	sessionID := uuid.New()
	statCalls := 0
	service := newInitiateService(t, fakeRepository{
		getSession: func(context.Context, uuid.UUID, uuid.UUID) (Session, error) {
			return Session{
				ID:          sessionID,
				OwnerUserID: ownerID,
				Status:      SessionInitiated,
				ExpiresAt:   time.Date(2026, 7, 28, 7, 59, 59, 0, time.UTC),
			}, nil
		},
	}, fakeObjectStore{
		stat: func(context.Context, string) (storage.ObjectInfo, error) {
			statCalls++
			return storage.ObjectInfo{}, nil
		},
	})

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerUserID: ownerID,
		SessionID:   sessionID,
	})
	if !errors.Is(err, ErrSessionExpired) || statCalls != 0 {
		t.Fatalf("error/stat calls = %v/%d", err, statCalls)
	}
}

func sessionFromDraft(draft InitiateDraft) Session {
	return Session{
		ID:              draft.SessionID,
		ItemID:          draft.ItemID,
		StorageObjectID: draft.StorageObjectID,
		OwnerUserID:     draft.OwnerUserID,
		DriveStatus:     cloud.DriveStatusActive,
		ObjectKey:       draft.ObjectKey,
		FileName:        draft.FileName,
		ContentType:     draft.ContentType,
		DeclaredBytes:   draft.DeclaredBytes,
		ReservedBytes:   draft.DeclaredBytes,
		IdempotencyKey:  draft.IdempotencyKey,
		Status:          SessionInitiated,
		ExpiresAt:       draft.ExpiresAt,
	}
}
