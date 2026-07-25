package upload

import (
	"context"
	"errors"
	"time"
)

var ErrFileTooLarge = errors.New("file exceeds upload limit")

type Session struct {
	ID        string
	OwnerID   string
	ObjectKey string
	SizeBytes int64
	ExpiresAt time.Time
}

type Repository interface {
	CreateSession(ctx context.Context, session Session) error
	CompleteSession(ctx context.Context, sessionID string) error
}

type URLSigner interface {
	PresignUpload(ctx context.Context, objectKey string, expiresIn time.Duration) (string, error)
}

func ValidateSize(sizeBytes, maximumBytes int64) error {
	if sizeBytes <= 0 {
		return errors.New("file size must be positive")
	}
	if sizeBytes > maximumBytes {
		return ErrFileTooLarge
	}
	return nil
}
