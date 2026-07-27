package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"testing"

	cloudfile "github.com/Nguyenphuc0312/hacom-cloud-service/internal/file"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

type fakeHashService struct {
	mu     sync.Mutex
	result HashResult
	err    error
	calls  int
}

func (s *fakeHashService) HashObject(ctx context.Context, _ string) (HashResult, error) {
	if err := ctx.Err(); err != nil {
		return HashResult{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	return s.result, s.err
}

type memoryFileRepository struct {
	mu    sync.Mutex
	items map[string]cloudfile.Item
}

func (r *memoryFileRepository) GetItem(ctx context.Context, itemID string) (cloudfile.Item, error) {
	if err := ctx.Err(); err != nil {
		return cloudfile.Item{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	item, exists := r.items[itemID]
	if !exists {
		return cloudfile.Item{}, errors.New("item not found")
	}
	return item, nil
}

func (r *memoryFileRepository) MarkReady(
	ctx context.Context,
	itemID string,
	checksum string,
	sizeBytes int64,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	item, exists := r.items[itemID]
	if !exists {
		return errors.New("item not found")
	}
	if item.Status == cloudfile.StatusReady {
		return nil
	}
	if item.Status != cloudfile.StatusProcessing {
		return errors.New("item is not processing")
	}
	item.Status = cloudfile.StatusReady
	item.Checksum = checksum
	item.SizeBytes = sizeBytes
	r.items[itemID] = item
	return nil
}

func TestHashFileHandlerMovesProcessingItemToReady(t *testing.T) {
	content := []byte("hacom cloud")
	sum := sha256.Sum256(content)
	checksum := hex.EncodeToString(sum[:])
	hash := &fakeHashService{result: HashResult{
		Checksum:  checksum,
		SizeBytes: int64(len(content)),
	}}
	files := &memoryFileRepository{items: map[string]cloudfile.Item{
		"item-1": {
			ID:        "item-1",
			ObjectKey: "owner/object-1",
			SizeBytes: int64(len(content)),
			Status:    cloudfile.StatusProcessing,
		},
	}}
	handler, err := NewHashFileHandler(hash, files)
	if err != nil {
		t.Fatal(err)
	}

	err = handler.Handle(context.Background(), worker.Job{
		ID:      "job-1",
		Type:    worker.JobHashFile,
		Payload: []byte(`{"item_id":"item-1","object_key":"owner/object-1"}`),
	})
	if err != nil {
		t.Fatal(err)
	}

	item, err := files.GetItem(context.Background(), "item-1")
	if err != nil {
		t.Fatal(err)
	}
	if item.Status != cloudfile.StatusReady || item.Checksum != checksum {
		t.Fatalf("item after hash = %+v", item)
	}
}

func TestHashFileHandlerRetryIsIdempotent(t *testing.T) {
	hash := &fakeHashService{result: HashResult{Checksum: "unused", SizeBytes: 10}}
	files := &memoryFileRepository{items: map[string]cloudfile.Item{
		"item-1": {
			ID:        "item-1",
			ObjectKey: "owner/object-1",
			SizeBytes: 10,
			Checksum:  "existing-checksum",
			Status:    cloudfile.StatusReady,
		},
	}}
	handler, err := NewHashFileHandler(hash, files)
	if err != nil {
		t.Fatal(err)
	}

	err = handler.Handle(context.Background(), worker.Job{
		Payload: []byte(`{"item_id":"item-1","object_key":"owner/object-1"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if hash.calls != 0 {
		t.Fatalf("hash calls = %d, want 0 for READY item", hash.calls)
	}
	item, _ := files.GetItem(context.Background(), "item-1")
	if item.Checksum != "existing-checksum" {
		t.Fatalf("retry replaced checksum with %q", item.Checksum)
	}
}

func TestHashFileHandlerRejectsSizeMismatch(t *testing.T) {
	hash := &fakeHashService{result: HashResult{Checksum: "checksum", SizeBytes: 9}}
	files := &memoryFileRepository{items: map[string]cloudfile.Item{
		"item-1": {
			ID:        "item-1",
			ObjectKey: "owner/object-1",
			SizeBytes: 10,
			Status:    cloudfile.StatusProcessing,
		},
	}}
	handler, _ := NewHashFileHandler(hash, files)
	err := handler.Handle(context.Background(), worker.Job{
		Payload: []byte(`{"item_id":"item-1","object_key":"owner/object-1"}`),
	})
	if err == nil {
		t.Fatal("size mismatch error = nil")
	}
	item, _ := files.GetItem(context.Background(), "item-1")
	if item.Status != cloudfile.StatusProcessing {
		t.Fatalf("item status = %q, want PROCESSING", item.Status)
	}
}

type memoryCleanupRepository struct {
	mu            sync.Mutex
	records       map[string]CleanupRecord
	reservedBytes int64
	ledgerEvents  int
}

func (r *memoryCleanupRepository) GetCleanupRecord(
	ctx context.Context,
	sessionID string,
) (CleanupRecord, error) {
	if err := ctx.Err(); err != nil {
		return CleanupRecord{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	record, exists := r.records[sessionID]
	if !exists {
		return CleanupRecord{}, errors.New("session not found")
	}
	return record, nil
}

func (r *memoryCleanupRepository) CompleteCleanup(ctx context.Context, sessionID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	record := r.records[sessionID]
	if record.Cleaned {
		return nil
	}
	r.reservedBytes -= record.ReservedBytes
	r.ledgerEvents++
	record.Cleaned = true
	r.records[sessionID] = record
	return nil
}

type fakeObjectRemover struct {
	mu      sync.Mutex
	deleted map[string]bool
	calls   int
}

func (r *fakeObjectRemover) Delete(ctx context.Context, objectKey string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	r.deleted[objectKey] = true
	return nil
}

func TestCleanupHandlerDeletesObjectReleasesQuotaAndWritesLedger(t *testing.T) {
	repository := &memoryCleanupRepository{
		records: map[string]CleanupRecord{
			"session-1": {
				SessionID:     "session-1",
				OwnerID:       "owner-1",
				ObjectKey:     "owner/temp-1",
				ReservedBytes: 1024,
			},
		},
		reservedBytes: 1024,
	}
	objects := &fakeObjectRemover{deleted: make(map[string]bool)}
	handler, err := NewCleanupExpiredUploadHandler(repository, objects)
	if err != nil {
		t.Fatal(err)
	}
	job, err := NewCleanupJob("cleanup-1", "session-1")
	if err != nil {
		t.Fatal(err)
	}

	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if !objects.deleted["owner/temp-1"] {
		t.Fatal("expired object was not deleted")
	}
	if repository.reservedBytes != 0 || repository.ledgerEvents != 1 {
		t.Fatalf("reserved=%d ledger events=%d, want 0 and 1", repository.reservedBytes, repository.ledgerEvents)
	}

	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if repository.reservedBytes != 0 || repository.ledgerEvents != 1 || objects.calls != 1 {
		t.Fatalf(
			"retry duplicated cleanup: reserved=%d ledger=%d deletes=%d",
			repository.reservedBytes,
			repository.ledgerEvents,
			objects.calls,
		)
	}
}

func TestNewCleanupJob(t *testing.T) {
	job, err := NewCleanupJob("job-1", "session-1")
	if err != nil {
		t.Fatal(err)
	}
	if job.Type != worker.JobCleanupExpired ||
		string(job.Payload) != `{"session_id":"session-1"}` {
		t.Fatalf("cleanup job = %+v", job)
	}
}

func TestRegisterLifecycleHandlers(t *testing.T) {
	runner, err := worker.New(worker.NewDemoRepository())
	if err != nil {
		t.Fatal(err)
	}
	hash, _ := NewHashFileHandler(
		&fakeHashService{},
		&memoryFileRepository{items: make(map[string]cloudfile.Item)},
	)
	cleanup, _ := NewCleanupExpiredUploadHandler(
		&memoryCleanupRepository{records: make(map[string]CleanupRecord)},
		&fakeObjectRemover{deleted: make(map[string]bool)},
	)
	if err := RegisterLifecycleHandlers(runner, hash, cleanup); err != nil {
		t.Fatal(err)
	}
}
