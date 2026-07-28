package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
)

type MinIOStore struct {
	client *minio.Client
	bucket string
}

func NewMinIOStore(client *minio.Client, bucket string) (*MinIOStore, error) {
	if client == nil {
		return nil, errors.New("MinIO client is required")
	}
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, errors.New("MinIO bucket is required")
	}
	return &MinIOStore{client: client, bucket: bucket}, nil
}

func (s *MinIOStore) Put(
	ctx context.Context,
	objectKey string,
	body io.Reader,
	size int64,
	contentType string,
) error {
	_, err := s.client.PutObject(
		ctx,
		s.bucket,
		objectKey,
		body,
		size,
		minio.PutObjectOptions{ContentType: contentType},
	)
	if err != nil {
		return fmt.Errorf("put MinIO object: %w", err)
	}
	return nil
}

func (s *MinIOStore) GetObject(
	ctx context.Context,
	objectKey string,
) (io.ReadCloser, error) {
	object, err := s.client.GetObject(
		ctx,
		s.bucket,
		objectKey,
		minio.GetObjectOptions{},
	)
	if err != nil {
		return nil, fmt.Errorf("get MinIO object: %w", err)
	}

	// MinIO GetObject is lazy and can return an object handle even when the key
	// does not exist. Stat before handing the stream to callers so missing
	// objects have a stable storage-level error.
	if _, err := object.Stat(); err != nil {
		_ = object.Close()
		if isMinIONotFound(err) {
			return nil, ErrObjectNotFound
		}
		return nil, fmt.Errorf("stat MinIO object before streaming: %w", err)
	}
	return object, nil
}

func (s *MinIOStore) StatObject(
	ctx context.Context,
	objectKey string,
) (ObjectInfo, error) {
	info, err := s.client.StatObject(
		ctx,
		s.bucket,
		objectKey,
		minio.StatObjectOptions{},
	)
	if err != nil {
		if isMinIONotFound(err) {
			return ObjectInfo{}, ErrObjectNotFound
		}
		return ObjectInfo{}, fmt.Errorf("stat MinIO object: %w", err)
	}
	return ObjectInfo{
		Key:         info.Key,
		SizeBytes:   info.Size,
		ContentType: info.ContentType,
		ETag:        info.ETag,
	}, nil
}

func (s *MinIOStore) Delete(ctx context.Context, objectKey string) error {
	err := s.client.RemoveObject(
		ctx,
		s.bucket,
		objectKey,
		minio.RemoveObjectOptions{},
	)
	if err != nil {
		return fmt.Errorf("delete MinIO object: %w", err)
	}
	return nil
}

func (s *MinIOStore) PresignUpload(
	ctx context.Context,
	objectKey string,
	expiresIn time.Duration,
) (string, error) {
	headers := make(http.Header)
	headers.Set("If-None-Match", "*")
	signedURL, err := s.client.PresignHeader(
		ctx,
		http.MethodPut,
		s.bucket,
		objectKey,
		expiresIn,
		url.Values{},
		headers,
	)
	if err != nil {
		return "", fmt.Errorf("presign MinIO PUT: %w", err)
	}
	return signedURL.String(), nil
}

func isMinIONotFound(err error) bool {
	response := minio.ToErrorResponse(err)
	return response.Code == "NoSuchKey" ||
		response.Code == "NoSuchObject" ||
		response.Code == "NoSuchBucket"
}

func (s *MinIOStore) PresignDownload(
	ctx context.Context,
	objectKey string,
	expiresIn time.Duration,
) (string, error) {
	signedURL, err := s.client.PresignedGetObject(
		ctx,
		s.bucket,
		objectKey,
		expiresIn,
		url.Values{},
	)
	if err != nil {
		return "", fmt.Errorf("presign MinIO GET: %w", err)
	}
	return signedURL.String(), nil
}
