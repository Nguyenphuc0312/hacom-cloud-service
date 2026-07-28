package handlers

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
	"github.com/google/uuid"
)

var (
	ErrHashTargetNotFound = errors.New("hash target not found")
	ErrHashTargetMismatch = errors.New("hash target does not match payload")
	ErrHashTargetState    = errors.New("hash target has invalid lifecycle state")
	ErrHashResultConflict = errors.New("hash result conflicts with ready file")
	ErrHashSizeMismatch   = errors.New("hashed object size does not match metadata")
)

type HashFilePayload struct {
	ItemID          string `json:"item_id"`
	StorageObjectID string `json:"storage_object_id"`
	UploadSessionID string `json:"upload_session_id"`
	ObjectKey       string `json:"object_key"`
}

type HashResult struct {
	Checksum  string
	SizeBytes int64
}

// HashService streams an object and calculates its SHA-256 checksum.
type HashService interface {
	HashObject(ctx context.Context, objectKey string) (HashResult, error)
}

type HashTarget struct {
	ItemID          string
	StorageObjectID string
	UploadSessionID string
	ObjectKey       string
	ExpectedBytes   int64
	ItemStatus      string
	ObjectStatus    string
	Checksum        string
}

type FileLifecycleRepository interface {
	GetHashTarget(ctx context.Context, payload HashFilePayload) (HashTarget, error)
	MarkHashReady(ctx context.Context, target HashTarget, result HashResult) error
}

type HashFileHandler struct {
	hash      HashService
	lifecycle FileLifecycleRepository
}

func NewHashFileHandler(
	hash HashService,
	lifecycle FileLifecycleRepository,
) (*HashFileHandler, error) {
	if hash == nil {
		return nil, errors.New("hash service is required")
	}
	if lifecycle == nil {
		return nil, errors.New("file lifecycle repository is required")
	}
	return &HashFileHandler{hash: hash, lifecycle: lifecycle}, nil
}

func (h *HashFileHandler) Handle(ctx context.Context, job worker.Job) error {
	if job.Type != worker.JobHashFile {
		return fmt.Errorf("HASH_FILE handler received job type %q", job.Type)
	}

	var payload HashFilePayload
	if err := decodeStrictJSON(job.Payload, &payload); err != nil {
		return fmt.Errorf("decode HASH_FILE payload: %w", err)
	}
	if err := validateHashFilePayload(payload); err != nil {
		return err
	}

	target, err := h.lifecycle.GetHashTarget(ctx, payload)
	if err != nil {
		return fmt.Errorf("get hash target: %w", err)
	}

	// Hash the canonical key loaded from PostgreSQL. The repository has already
	// compared it with the untrusted payload.
	result, err := h.hash.HashObject(ctx, target.ObjectKey)
	if err != nil {
		return fmt.Errorf("hash object: %w", err)
	}
	if err := validateHashResult(result); err != nil {
		return err
	}
	if result.SizeBytes != target.ExpectedBytes {
		return fmt.Errorf(
			"%w: got %d bytes, expected %d",
			ErrHashSizeMismatch,
			result.SizeBytes,
			target.ExpectedBytes,
		)
	}
	if err := h.lifecycle.MarkHashReady(ctx, target, result); err != nil {
		return fmt.Errorf("mark hash target ready: %w", err)
	}
	return nil
}

func validateHashFilePayload(payload HashFilePayload) error {
	identifiers := []struct {
		name  string
		value string
	}{
		{name: "item_id", value: payload.ItemID},
		{name: "storage_object_id", value: payload.StorageObjectID},
		{name: "upload_session_id", value: payload.UploadSessionID},
	}
	for _, identifier := range identifiers {
		if _, err := uuid.Parse(identifier.value); err != nil {
			return fmt.Errorf(
				"HASH_FILE payload %s must be a valid UUID: %w",
				identifier.name,
				err,
			)
		}
	}
	if payload.ObjectKey == "" {
		return errors.New("HASH_FILE payload object_key is required")
	}
	return nil
}

func validateHashResult(result HashResult) error {
	if result.SizeBytes <= 0 {
		return errors.New("hash service returned a non-positive object size")
	}
	if len(result.Checksum) != 64 || result.Checksum != strings.ToLower(result.Checksum) {
		return errors.New("hash service returned an invalid SHA-256 checksum")
	}
	if _, err := hex.DecodeString(result.Checksum); err != nil {
		return errors.New("hash service returned an invalid SHA-256 checksum")
	}
	return nil
}

func decodeStrictJSON(payload []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("payload must contain exactly one JSON object")
		}
		return err
	}
	return nil
}
