package quota

import (
	"context"
	"errors"
	"sync"
)

type MemoryRepository struct {
	mu     sync.Mutex
	quotas map[string]Usage
	ledger map[string]LedgerEntry
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{
		quotas: make(map[string]Usage),
		ledger: make(map[string]LedgerEntry),
	}
}

func (r *MemoryRepository) EnsureQuota(ctx context.Context, ownerID string, limitBytes int64) (Usage, error) {
	if err := ctx.Err(); err != nil {
		return Usage{}, err
	}
	if ownerID == "" {
		return Usage{}, ErrInvalidOwner
	}
	if limitBytes <= 0 {
		return Usage{}, errors.New("quota limit must be positive")
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if usage, exists := r.quotas[ownerID]; exists {
		return usage, nil
	}

	usage := Usage{OwnerID: ownerID, LimitBytes: limitBytes}
	r.quotas[ownerID] = usage
	return usage, nil
}

func (r *MemoryRepository) GetUsage(ctx context.Context, ownerID string) (Usage, error) {
	if err := ctx.Err(); err != nil {
		return Usage{}, err
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	usage, exists := r.quotas[ownerID]
	if !exists {
		return Usage{}, errors.New("quota not found")
	}
	return usage, nil
}

func (r *MemoryRepository) ApplyUsage(ctx context.Context, request ApplyRequest) (ApplyResult, error) {
	if err := ctx.Err(); err != nil {
		return ApplyResult{}, err
	}
	if request.DeltaBytes <= 0 {
		return ApplyResult{}, errors.New("usage delta must be positive")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if existing, exists := r.ledger[request.IdempotencyKey]; exists {
		if existing.OwnerID != request.OwnerID ||
			existing.EventType != request.EventType ||
			existing.DeltaBytes != request.DeltaBytes {
			return ApplyResult{}, ErrIdempotencyConflict
		}
		return ApplyResult{
			Usage:   r.quotas[request.OwnerID],
			Entry:   existing,
			Applied: false,
		}, nil
	}

	usage, exists := r.quotas[request.OwnerID]
	if !exists {
		return ApplyResult{}, errors.New("quota not found")
	}
	if usage.UsedBytes+usage.ReservedBytes+request.DeltaBytes > usage.LimitBytes {
		return ApplyResult{}, ErrQuotaExceeded
	}

	entry := LedgerEntry{
		OwnerID:        request.OwnerID,
		IdempotencyKey: request.IdempotencyKey,
		EventType:      request.EventType,
		DeltaBytes:     request.DeltaBytes,
	}
	usage.UsedBytes += request.DeltaBytes
	r.quotas[request.OwnerID] = usage
	r.ledger[request.IdempotencyKey] = entry

	return ApplyResult{Usage: usage, Entry: entry, Applied: true}, nil
}

func (r *MemoryRepository) LedgerEntries() []LedgerEntry {
	r.mu.Lock()
	defer r.mu.Unlock()

	entries := make([]LedgerEntry, 0, len(r.ledger))
	for _, entry := range r.ledger {
		entries = append(entries, entry)
	}
	return entries
}
