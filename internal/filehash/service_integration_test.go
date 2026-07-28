package filehash_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/filehash"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func TestMinIOHashObjectIntegration(t *testing.T) {
	endpoint := os.Getenv("TEST_MINIO_ENDPOINT")
	if endpoint == "" {
		t.Skip("TEST_MINIO_ENDPOINT is not configured")
	}
	useSSL, err := strconv.ParseBool(environmentOr("MINIO_USE_SSL", "false"))
	if err != nil {
		t.Fatalf("parse MINIO_USE_SSL: %v", err)
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds: credentials.NewStaticV4(
			environmentOr("MINIO_ACCESS_KEY", "minioadmin"),
			environmentOr("MINIO_SECRET_KEY", "minioadmin"),
			"",
		),
		Secure: useSSL,
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	bucket := environmentOr("MINIO_BUCKET", "hacom-cloud-private")
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		t.Fatalf("check MinIO bucket: %v", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			t.Fatalf("create MinIO bucket: %v", err)
		}
	}

	objects, err := storage.NewMinIOStore(client, bucket)
	if err != nil {
		t.Fatal(err)
	}
	objectKey := "integration/hash/" + uuid.NewString()
	payload := bytes.Repeat([]byte("hacom-cloud-stream-"), 64*1024)
	if err := objects.Put(
		ctx,
		objectKey,
		bytes.NewReader(payload),
		int64(len(payload)),
		"application/octet-stream",
	); err != nil {
		t.Fatalf("put integration object: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(
			context.Background(),
			10*time.Second,
		)
		defer cleanupCancel()
		if err := objects.Delete(cleanupCtx, objectKey); err != nil {
			t.Errorf("delete integration object: %v", err)
		}
	})

	service, err := filehash.NewService(objects, nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err := service.HashObject(ctx, objectKey)
	if err != nil {
		t.Fatal(err)
	}
	expected := sha256.Sum256(payload)
	if result.Checksum != hex.EncodeToString(expected[:]) {
		t.Fatalf("checksum = %q, want %x", result.Checksum, expected)
	}
	if result.SizeBytes != int64(len(payload)) {
		t.Fatalf("size = %d, want %d", result.SizeBytes, len(payload))
	}

	_, err = objects.GetObject(ctx, objectKey+"-missing")
	if !errors.Is(err, storage.ErrObjectNotFound) {
		t.Fatalf("missing object error = %v, want ErrObjectNotFound", err)
	}
}

func environmentOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
