package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	cloudfile "github.com/Nguyenphuc0312/hacom-cloud-service/internal/file"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

type HashResult struct {
	Checksum  string
	SizeBytes int64
}

// HashService streams an object and calculates its SHA-256 checksum.
type HashService interface {
	HashObject(ctx context.Context, objectKey string) (HashResult, error)
}

type FileRepository interface {
	GetItem(ctx context.Context, itemID string) (cloudfile.Item, error)
	MarkReady(ctx context.Context, itemID, checksum string, sizeBytes int64) error
}

type HashFileHandler struct {
	hash  HashService
	files FileRepository
}

func NewHashFileHandler(hash HashService, files FileRepository) (*HashFileHandler, error) {
	if hash == nil {
		return nil, errors.New("hash service is required")
	}
	if files == nil {
		return nil, errors.New("file repository is required")
	}
	return &HashFileHandler{hash: hash, files: files}, nil
}

func (h *HashFileHandler) Handle(ctx context.Context, job worker.Job) error {
	var payload struct {
		ItemID    string `json:"item_id"`
		ObjectKey string `json:"object_key"`
	}
	if err := json.Unmarshal(job.Payload, &payload); err != nil {
		return fmt.Errorf("decode HASH_FILE payload: %w", err)
	}
	if payload.ItemID == "" || payload.ObjectKey == "" {
		return errors.New("HASH_FILE payload requires item_id and object_key")
	}

	item, err := h.files.GetItem(ctx, payload.ItemID)
	if err != nil {
		return fmt.Errorf("get file item: %w", err)
	}
	if item.ObjectKey != payload.ObjectKey {
		return errors.New("HASH_FILE object key does not match file item")
	}
	if item.Status == cloudfile.StatusReady {
		return nil
	}
	if item.Status != cloudfile.StatusProcessing {
		return fmt.Errorf("file item has invalid status %q for hashing", item.Status)
	}

	result, err := h.hash.HashObject(ctx, payload.ObjectKey)
	if err != nil {
		return fmt.Errorf("hash object: %w", err)
	}
	if result.SizeBytes != item.SizeBytes {
		return fmt.Errorf("hashed object size %d does not match item size %d", result.SizeBytes, item.SizeBytes)
	}
	if result.Checksum == "" {
		return errors.New("hash service returned an empty checksum")
	}
	if err := h.files.MarkReady(ctx, item.ID, result.Checksum, result.SizeBytes); err != nil {
		return fmt.Errorf("mark file item ready: %w", err)
	}
	return nil
}
