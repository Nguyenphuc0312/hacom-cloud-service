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
	target Target
	err    error
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
