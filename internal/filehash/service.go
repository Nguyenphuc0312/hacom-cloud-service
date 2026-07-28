package filehash

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"
)

type ObjectReader interface {
	GetObject(ctx context.Context, objectKey string) (io.ReadCloser, error)
}

type Result struct {
	Checksum  string
	SizeBytes int64
}

type Service struct {
	objects ObjectReader
	logger  *slog.Logger
}

func NewService(objects ObjectReader, logger *slog.Logger) (*Service, error) {
	if objects == nil {
		return nil, errors.New("hash object reader is required")
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{objects: objects, logger: logger}, nil
}

func (s *Service) HashObject(
	ctx context.Context,
	objectKey string,
) (Result, error) {
	objectKey = strings.TrimSpace(objectKey)
	if objectKey == "" {
		return Result{}, errors.New("hash object key is required")
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}

	startedAt := time.Now()
	object, err := s.objects.GetObject(ctx, objectKey)
	if err != nil {
		return Result{}, fmt.Errorf("open object stream: %w", err)
	}

	hasher := sha256.New()
	sizeBytes, copyErr := io.Copy(hasher, object)
	closeErr := object.Close()
	if copyErr != nil {
		return Result{}, fmt.Errorf("stream object for SHA-256: %w", copyErr)
	}
	if closeErr != nil {
		return Result{}, fmt.Errorf("close object stream: %w", closeErr)
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}

	result := Result{
		Checksum:  hex.EncodeToString(hasher.Sum(nil)),
		SizeBytes: sizeBytes,
	}
	s.logger.InfoContext(
		ctx,
		"object SHA-256 calculated",
		"size_bytes", result.SizeBytes,
		"duration", time.Since(startedAt),
	)
	return result, nil
}
