package quota

import "context"

type Usage struct {
	OwnerID    string
	UsedBytes  int64
	LimitBytes int64
}

type Repository interface {
	GetUsage(ctx context.Context, ownerID string) (Usage, error)
	Reserve(ctx context.Context, ownerID string, bytes int64) error
	Commit(ctx context.Context, ownerID string, bytes int64) error
	Release(ctx context.Context, ownerID string, bytes int64) error
}
