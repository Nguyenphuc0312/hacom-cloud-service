package fileaccess

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/google/uuid"
)

type fakeRepository struct {
	target      Target
	err         error
	validateErr error
}

func (f fakeRepository) ValidateFileAccessTarget(
	context.Context,
	uuid.UUID,
	uuid.UUID,
	uuid.UUID,
	time.Time,
) error {
	return f.validateErr
}

func (f fakeRepository) GetFileAccessTarget(
	context.Context,
	uuid.UUID,
	uuid.UUID,
) (Target, error) {
	return f.target, f.err
}

type fakeObjectStore struct {
	info      storage.ObjectInfo
	statErr   error
	signedURL string
	signErr   error
	signedKey string
	signedTTL time.Duration
}

func (f *fakeObjectStore) StatObject(
	context.Context,
	string,
) (storage.ObjectInfo, error) {
	return f.info, f.statErr
}

func (f *fakeObjectStore) PresignDownload(
	_ context.Context,
	objectKey string,
	expiresIn time.Duration,
) (string, error) {
	f.signedKey = objectKey
	f.signedTTL = expiresIn
	return f.signedURL, f.signErr
}

func TestCreateAccessSignsCanonicalReadyObject(t *testing.T) {
	itemID := uuid.New()
	objects := &fakeObjectStore{
		info: storage.ObjectInfo{
			Key:         "uploads/owner/object",
			SizeBytes:   42,
			ContentType: "image/png",
		},
		signedURL: "http://minio.local/signed",
	}
	service, err := NewService(fakeRepository{target: Target{
		ItemID:      itemID,
		ObjectKey:   "uploads/owner/object",
		FileName:    "anh.png",
		ContentType: "image/png",
		SizeBytes:   42,
	}}, objects, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 31, 4, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }

	access, err := service.CreateAccess(context.Background(), uuid.New(), itemID)
	if err != nil {
		t.Fatal(err)
	}
	if access.URL != objects.signedURL ||
		access.ExpiresAt != now.Add(10*time.Minute) ||
		access.ContentType != "image/png" ||
		access.FileName != "anh.png" ||
		access.SizeBytes != 42 {
		t.Fatalf("unexpected access response: %+v", access)
	}
	if objects.signedKey != "uploads/owner/object" ||
		objects.signedTTL != 10*time.Minute {
		t.Fatalf(
			"signed key/TTL = %q/%s",
			objects.signedKey,
			objects.signedTTL,
		)
	}
}

func TestCreateAccessRejectsMissingPhysicalObject(t *testing.T) {
	itemID := uuid.New()
	objects := &fakeObjectStore{statErr: storage.ErrObjectNotFound}
	service, err := NewService(fakeRepository{target: Target{
		ItemID:      itemID,
		ObjectKey:   "uploads/owner/missing",
		FileName:    "missing.txt",
		ContentType: "text/plain",
		SizeBytes:   7,
	}}, objects, time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	_, err = service.CreateAccess(context.Background(), uuid.New(), itemID)
	if !errors.Is(err, ErrObjectUnavailable) {
		t.Fatalf("error = %v, want ErrObjectUnavailable", err)
	}
}

func TestCreateAccessRejectsMetadataSizeMismatch(t *testing.T) {
	itemID := uuid.New()
	objects := &fakeObjectStore{info: storage.ObjectInfo{SizeBytes: 8}}
	service, err := NewService(fakeRepository{target: Target{
		ItemID:      itemID,
		ObjectKey:   "uploads/owner/file",
		FileName:    "file.txt",
		ContentType: "text/plain",
		SizeBytes:   7,
	}}, objects, time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	_, err = service.CreateAccess(context.Background(), uuid.New(), itemID)
	if !errors.Is(err, ErrObjectUnavailable) {
		t.Fatalf("error = %v, want ErrObjectUnavailable", err)
	}
}

func TestCreateAccessInTrashNeverSignsPastPurgeDeadline(t *testing.T) {
	now := time.Date(2026, 8, 4, 8, 0, 0, 0, time.UTC)
	purgeAfter := now.Add(2 * time.Minute)
	objects := &fakeObjectStore{
		info:      storage.ObjectInfo{SizeBytes: 7},
		signedURL: "http://minio.local/short-lived",
	}
	service, err := NewService(fakeRepository{target: Target{
		ItemID: uuid.New(), ObjectKey: "uploads/owner/file", FileName: "file.txt",
		ContentType: "text/plain", SizeBytes: 7, PurgeAfter: &purgeAfter,
	}}, objects, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	service.now = func() time.Time { return now }
	access, err := service.CreateAccess(context.Background(), uuid.New(), uuid.New())
	if err != nil {
		t.Fatal(err)
	}
	if access.ExpiresAt != purgeAfter || objects.signedTTL != 2*time.Minute {
		t.Fatalf("access expiry=%s signed TTL=%s", access.ExpiresAt, objects.signedTTL)
	}
}

func TestCreateAccessRejectsExpiredTrashTarget(t *testing.T) {
	now := time.Now().UTC()
	purgeAfter := now.Add(-time.Second)
	service, err := NewService(fakeRepository{target: Target{
		ItemID: uuid.New(), ObjectKey: "uploads/owner/file", FileName: "file.txt",
		ContentType: "text/plain", SizeBytes: 7, PurgeAfter: &purgeAfter,
	}}, &fakeObjectStore{}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	service.now = func() time.Time { return now }
	_, err = service.CreateAccess(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrDeletePending) {
		t.Fatalf("error=%v, want ErrDeletePending", err)
	}
}

func TestCreateAccessRejectsDeadlineCrossedDuringObjectCheck(t *testing.T) {
	start := time.Now().UTC()
	purgeAfter := start.Add(500 * time.Millisecond)
	service, err := NewService(fakeRepository{target: Target{
		ItemID: uuid.New(), ObjectKey: "uploads/owner/file", FileName: "file.txt",
		ContentType: "text/plain", SizeBytes: 7, PurgeAfter: &purgeAfter,
	}}, &fakeObjectStore{info: storage.ObjectInfo{SizeBytes: 7}}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	clockCalls := 0
	service.now = func() time.Time {
		clockCalls++
		if clockCalls == 1 {
			return start
		}
		return start.Add(time.Second)
	}
	_, err = service.CreateAccess(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrDeletePending) {
		t.Fatalf("error=%v, want ErrDeletePending", err)
	}
}

func TestCreateAccessDropsSignedURLWhenDeleteWinsRevalidation(t *testing.T) {
	objects := &fakeObjectStore{
		info: storage.ObjectInfo{SizeBytes: 7}, signedURL: "http://minio.local/discarded",
	}
	service, err := NewService(fakeRepository{
		target: Target{
			ItemID: uuid.New(), StorageObjectID: uuid.New(), ObjectKey: "uploads/owner/file",
			FileName: "file.txt", ContentType: "text/plain", SizeBytes: 7,
		},
		validateErr: ErrDeletePending,
	}, objects, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.CreateAccess(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrDeletePending) {
		t.Fatalf("error=%v, want ErrDeletePending", err)
	}
	if objects.signedKey == "" {
		t.Fatal("test did not reach signing before revalidation")
	}
}
