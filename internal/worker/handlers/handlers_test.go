package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"testing"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

const (
	testItemID    = "11111111-1111-4111-8111-111111111111"
	testObjectID  = "22222222-2222-4222-8222-222222222222"
	testSessionID = "33333333-3333-4333-8333-333333333333"
)

type fakeHashService struct {
	mu         sync.Mutex
	result     HashResult
	err        error
	calls      int
	objectKeys []string
}

func (s *fakeHashService) HashObject(
	ctx context.Context,
	objectKey string,
) (HashResult, error) {
	if err := ctx.Err(); err != nil {
		return HashResult{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	s.objectKeys = append(s.objectKeys, objectKey)
	return s.result, s.err
}

type memoryFileLifecycle struct {
	mu        sync.Mutex
	target    HashTarget
	getErr    error
	markErr   error
	markCalls int
}

func (r *memoryFileLifecycle) GetHashTarget(
	ctx context.Context,
	_ HashFilePayload,
) (HashTarget, error) {
	if err := ctx.Err(); err != nil {
		return HashTarget{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.target, r.getErr
}

func (r *memoryFileLifecycle) MarkHashReady(
	ctx context.Context,
	target HashTarget,
	result HashResult,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.markCalls++
	if r.markErr != nil {
		return r.markErr
	}
	if r.target.ItemStatus == "ready" && r.target.ObjectStatus == "ready" {
		if r.target.Checksum != result.Checksum ||
			r.target.ExpectedBytes != result.SizeBytes {
			return ErrHashResultConflict
		}
		return nil
	}
	if r.target.ItemStatus != "processing" ||
		r.target.ObjectStatus != "processing" {
		return ErrHashTargetState
	}
	r.target.ItemStatus = "ready"
	r.target.ObjectStatus = "ready"
	r.target.Checksum = result.Checksum
	return nil
}

func hashFixture(content []byte, status string) (*HashFileHandler, *fakeHashService, *memoryFileLifecycle) {
	sum := sha256.Sum256(content)
	checksum := hex.EncodeToString(sum[:])
	hash := &fakeHashService{result: HashResult{
		Checksum:  checksum,
		SizeBytes: int64(len(content)),
	}}
	lifecycle := &memoryFileLifecycle{target: HashTarget{
		ItemID:          testItemID,
		StorageObjectID: testObjectID,
		UploadSessionID: testSessionID,
		ObjectKey:       "uploads/owner/object",
		ExpectedBytes:   int64(len(content)),
		ItemStatus:      status,
		ObjectStatus:    status,
	}}
	if status == "ready" {
		lifecycle.target.Checksum = checksum
	}
	handler, err := NewHashFileHandler(hash, lifecycle)
	if err != nil {
		panic(err)
	}
	return handler, hash, lifecycle
}

func hashJob() worker.Job {
	return worker.Job{
		ID:   "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		Type: worker.JobHashFile,
		Payload: []byte(`{
			"item_id":"` + testItemID + `",
			"storage_object_id":"` + testObjectID + `",
			"upload_session_id":"` + testSessionID + `",
			"object_key":"uploads/owner/object"
		}`),
	}
}

func TestHashFileHandlerMovesProcessingTargetToReady(t *testing.T) {
	handler, hash, lifecycle := hashFixture([]byte("hacom cloud"), "processing")

	if err := handler.Handle(context.Background(), hashJob()); err != nil {
		t.Fatal(err)
	}
	if lifecycle.target.ItemStatus != "ready" ||
		lifecycle.target.ObjectStatus != "ready" ||
		lifecycle.target.Checksum != hash.result.Checksum {
		t.Fatalf("target after hash = %+v", lifecycle.target)
	}
	if len(hash.objectKeys) != 1 ||
		hash.objectKeys[0] != lifecycle.target.ObjectKey {
		t.Fatalf("hashed object keys = %v", hash.objectKeys)
	}
}

func TestHashFileHandlerReadyRetryVerifiesSameHash(t *testing.T) {
	handler, hash, lifecycle := hashFixture([]byte("retry-safe"), "ready")

	if err := handler.Handle(context.Background(), hashJob()); err != nil {
		t.Fatal(err)
	}
	if hash.calls != 1 || lifecycle.markCalls != 1 {
		t.Fatalf("hash/mark calls = %d/%d, want 1/1", hash.calls, lifecycle.markCalls)
	}
}

func TestHashFileHandlerReadyRetryRejectsDifferentChecksum(t *testing.T) {
	handler, hash, _ := hashFixture([]byte("original"), "ready")
	different := sha256.Sum256([]byte("changed!"))
	hash.result.Checksum = hex.EncodeToString(different[:])

	err := handler.Handle(context.Background(), hashJob())
	if !errors.Is(err, ErrHashResultConflict) {
		t.Fatalf("Handle() error = %v, want ErrHashResultConflict", err)
	}
}

func TestHashFileHandlerRejectsSizeMismatch(t *testing.T) {
	handler, hash, lifecycle := hashFixture([]byte("ten bytes!"), "processing")
	hash.result.SizeBytes--

	err := handler.Handle(context.Background(), hashJob())
	if !errors.Is(err, ErrHashSizeMismatch) {
		t.Fatalf("Handle() error = %v, want ErrHashSizeMismatch", err)
	}
	if lifecycle.markCalls != 0 {
		t.Fatalf("MarkHashReady calls = %d, want 0", lifecycle.markCalls)
	}
}

func TestHashFileHandlerRejectsInvalidOrUntrustedPayload(t *testing.T) {
	handler, _, lifecycle := hashFixture([]byte("payload"), "processing")
	tests := []worker.Job{
		{
			Type:    worker.JobHashFile,
			Payload: []byte(`{"item_id":"not-a-uuid","storage_object_id":"` + testObjectID + `","upload_session_id":"` + testSessionID + `","object_key":"key"}`),
		},
		{
			Type:    worker.JobHashFile,
			Payload: []byte(`{"item_id":"` + testItemID + `","storage_object_id":"` + testObjectID + `","upload_session_id":"` + testSessionID + `","object_key":"key","unexpected":true}`),
		},
		{
			Type:    worker.JobCleanupExpired,
			Payload: hashJob().Payload,
		},
	}
	for _, job := range tests {
		if err := handler.Handle(context.Background(), job); err == nil {
			t.Fatalf("Handle(%s) error = nil", job.Payload)
		}
	}

	lifecycle.getErr = ErrHashTargetMismatch
	err := handler.Handle(context.Background(), hashJob())
	if !errors.Is(err, ErrHashTargetMismatch) {
		t.Fatalf("relationship mismatch error = %v", err)
	}
}

type memoryCleanupRepository struct {
	mu            sync.Mutex
	target        CleanupTarget
	getErr        error
	completeErr   error
	completeCalls int
	releases      int
}

func (r *memoryCleanupRepository) EnqueueExpiredUploadJobs(
	context.Context,
	int,
) (int, error) {
	return 0, nil
}

func (r *memoryCleanupRepository) GetCleanupTarget(
	ctx context.Context,
	_ string,
) (CleanupTarget, error) {
	if err := ctx.Err(); err != nil {
		return CleanupTarget{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.target, r.getErr
}

func (r *memoryCleanupRepository) CompleteCleanup(
	ctx context.Context,
	_ string,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.completeCalls++
	if r.completeErr != nil {
		return r.completeErr
	}
	if r.target.AlreadyCleaned {
		return nil
	}
	r.target.AlreadyCleaned = true
	r.releases++
	return nil
}

type fakeObjectRemover struct {
	mu      sync.Mutex
	deleted map[string]bool
	err     error
	calls   int
}

func (r *fakeObjectRemover) Delete(ctx context.Context, objectKey string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	if r.err != nil {
		return r.err
	}
	r.deleted[objectKey] = true
	return nil
}

func cleanupFixture() (*CleanupExpiredUploadHandler, *memoryCleanupRepository, *fakeObjectRemover) {
	repository := &memoryCleanupRepository{target: CleanupTarget{
		SessionID:       testSessionID,
		DriveID:         "44444444-4444-4444-8444-444444444444",
		ItemID:          testItemID,
		StorageObjectID: testObjectID,
		ObjectKey:       "uploads/owner/expired",
		ReservedBytes:   1024,
	}}
	objects := &fakeObjectRemover{deleted: make(map[string]bool)}
	handler, err := NewCleanupExpiredUploadHandler(repository, objects)
	if err != nil {
		panic(err)
	}
	return handler, repository, objects
}

func TestCleanupHandlerDeletesObjectAndCompletesExactlyOnce(t *testing.T) {
	handler, repository, objects := cleanupFixture()
	job, err := NewCleanupJob("cleanup-job", testSessionID)
	if err != nil {
		t.Fatal(err)
	}

	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if !objects.deleted["uploads/owner/expired"] ||
		repository.releases != 1 {
		t.Fatalf("deleted=%v releases=%d", objects.deleted, repository.releases)
	}

	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if objects.calls != 1 || repository.releases != 1 {
		t.Fatalf("retry duplicated cleanup: deletes=%d releases=%d", objects.calls, repository.releases)
	}
}

func TestCleanupHandlerTreatsMissingObjectAsSuccessfulDeletion(t *testing.T) {
	handler, repository, _ := cleanupFixture()
	job, _ := NewCleanupJob("cleanup-job", testSessionID)

	// ObjectRemover's contract represents a missing object as nil.
	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if repository.releases != 1 {
		t.Fatalf("release count = %d, want 1", repository.releases)
	}
}

func TestCleanupHandlerDoesNotCompleteWhenObjectDeletionFails(t *testing.T) {
	handler, repository, objects := cleanupFixture()
	objects.err = errors.New("MinIO temporarily unavailable")
	job, _ := NewCleanupJob("cleanup-job", testSessionID)

	if err := handler.Handle(context.Background(), job); err == nil {
		t.Fatal("Handle() error = nil")
	}
	if repository.completeCalls != 0 {
		t.Fatalf("complete calls = %d, want 0", repository.completeCalls)
	}
}

func TestCleanupHandlerRejectsInvalidPayloadAndIneligibleTarget(t *testing.T) {
	handler, repository, _ := cleanupFixture()
	err := handler.Handle(context.Background(), worker.Job{
		Type:    worker.JobCleanupExpired,
		Payload: []byte(`{"session_id":"not-a-uuid"}`),
	})
	if err == nil {
		t.Fatal("invalid UUID error = nil")
	}

	repository.getErr = ErrCleanupNotExpired
	job, _ := NewCleanupJob("cleanup-job", testSessionID)
	err = handler.Handle(context.Background(), job)
	if !errors.Is(err, ErrCleanupNotExpired) {
		t.Fatalf("not expired error = %v", err)
	}
}

func TestNewCleanupJob(t *testing.T) {
	job, err := NewCleanupJob("job-1", testSessionID)
	if err != nil {
		t.Fatal(err)
	}
	if job.Type != worker.JobCleanupExpired ||
		string(job.Payload) != `{"session_id":"`+testSessionID+`"}` {
		t.Fatalf("cleanup job = %+v", job)
	}
}

func TestRegisterLifecycleHandlers(t *testing.T) {
	runner, err := worker.New(worker.NewDemoRepository())
	if err != nil {
		t.Fatal(err)
	}
	hash, _, _ := hashFixture([]byte("register"), "processing")
	cleanup, _, _ := cleanupFixture()
	if err := RegisterLifecycleHandlers(runner, hash, cleanup); err != nil {
		t.Fatal(err)
	}
}
