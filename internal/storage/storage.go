package storage

import (
	"context"
	"io"
	"time"
)

// ObjectStore abstracts MinIO so business logic is not coupled to its SDK.
type ObjectStore interface {
	Put(ctx context.Context, objectKey string, body io.Reader, size int64, contentType string) error
	Delete(ctx context.Context, objectKey string) error
	PresignUpload(ctx context.Context, objectKey string, expiresIn time.Duration) (string, error)
	PresignDownload(ctx context.Context, objectKey string, expiresIn time.Duration) (string, error)
}
