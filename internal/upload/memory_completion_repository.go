package upload

import (
	"context"
	"errors"
	"sync"

	cloudfile "github.com/Nguyenphuc0312/hacom-cloud-service/internal/file"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

type CompletionQuota struct {
	UsedBytes     int64
	ReservedBytes int64
	LimitBytes    int64
}

type MemoryCompletionRepository struct {
	mu          sync.Mutex
	sessions    map[string]Session
	completions map[string]CompleteResult
	items       map[string]cloudfile.Item
	jobs        map[string]worker.Job
	quotas      map[string]CompletionQuota
}

func NewMemoryCompletionRepository() *MemoryCompletionRepository {
	return &MemoryCompletionRepository{
		sessions:    make(map[string]Session),
		completions: make(map[string]CompleteResult),
		items:       make(map[string]cloudfile.Item),
		jobs:        make(map[string]worker.Job),
		quotas:      make(map[string]CompletionQuota),
	}
}

func (r *MemoryCompletionRepository) Seed(session Session, quota CompletionQuota) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[session.ID] = session
	r.quotas[session.OwnerID] = quota
}

func (r *MemoryCompletionRepository) GetSession(ctx context.Context, sessionID string) (Session, error) {
	if err := ctx.Err(); err != nil {
		return Session{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	session, exists := r.sessions[sessionID]
	if !exists {
		return Session{}, ErrSessionNotFound
	}
	return session, nil
}

func (r *MemoryCompletionRepository) GetCompleted(
	ctx context.Context,
	ownerID string,
	sessionID string,
) (CompleteResult, error) {
	if err := ctx.Err(); err != nil {
		return CompleteResult{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	session, exists := r.sessions[sessionID]
	if !exists {
		return CompleteResult{}, ErrSessionNotFound
	}
	if session.OwnerID != ownerID {
		return CompleteResult{}, ErrSessionForbidden
	}
	result, exists := r.completions[sessionID]
	if !exists {
		return CompleteResult{}, errors.New("completed upload result not found")
	}
	return result, nil
}

func (r *MemoryCompletionRepository) Finalize(
	ctx context.Context,
	request FinalizeRequest,
) (CompleteResult, error) {
	if err := ctx.Err(); err != nil {
		return CompleteResult{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	session, exists := r.sessions[request.SessionID]
	if !exists {
		return CompleteResult{}, ErrSessionNotFound
	}
	if session.OwnerID != request.OwnerID {
		return CompleteResult{}, ErrSessionForbidden
	}
	if session.Status == SessionCompleted {
		return r.completions[request.SessionID], nil
	}
	if session.Status == SessionRejected {
		return CompleteResult{}, ErrSessionRejected
	}

	usage := r.quotas[request.OwnerID]
	if usage.ReservedBytes < session.SizeBytes {
		return CompleteResult{}, errors.New("reserved quota is smaller than upload session size")
	}
	if usage.UsedBytes+request.Item.SizeBytes > usage.LimitBytes {
		return CompleteResult{}, errors.New("finalized upload exceeds quota")
	}

	usage.ReservedBytes -= session.SizeBytes
	usage.UsedBytes += request.Item.SizeBytes
	session.Status = SessionCompleted
	session.ItemID = request.Item.ID
	result := CompleteResult{Item: request.Item, Job: request.Job}

	r.quotas[request.OwnerID] = usage
	r.sessions[request.SessionID] = session
	r.items[request.Item.ID] = request.Item
	r.jobs[request.Job.ID] = request.Job
	r.completions[request.SessionID] = result
	return result, nil
}

func (r *MemoryCompletionRepository) Reject(ctx context.Context, ownerID, sessionID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	session, exists := r.sessions[sessionID]
	if !exists {
		return ErrSessionNotFound
	}
	if session.OwnerID != ownerID {
		return ErrSessionForbidden
	}
	if session.Status == SessionRejected {
		return nil
	}
	if session.Status == SessionCompleted {
		return errors.New("completed upload cannot be rejected")
	}

	usage := r.quotas[ownerID]
	if usage.ReservedBytes < session.SizeBytes {
		return errors.New("reserved quota is smaller than upload session size")
	}
	usage.ReservedBytes -= session.SizeBytes
	session.Status = SessionRejected
	r.quotas[ownerID] = usage
	r.sessions[sessionID] = session
	return nil
}

func (r *MemoryCompletionRepository) Snapshot(ownerID string) (CompletionQuota, int, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.quotas[ownerID], len(r.items), len(r.jobs)
}
