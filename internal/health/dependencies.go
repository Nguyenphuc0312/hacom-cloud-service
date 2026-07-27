package health

import (
	"context"
	"fmt"
)

type PostgresPinger interface {
	Ping(ctx context.Context) error
}

type PostgresChecker struct {
	db PostgresPinger
}

func NewPostgresChecker(db PostgresPinger) *PostgresChecker {
	return &PostgresChecker{db: db}
}

func (c *PostgresChecker) Name() string {
	return "postgres"
}

func (c *PostgresChecker) Check(ctx context.Context) error {
	return c.db.Ping(ctx)
}

type MinIOBucketChecker interface {
	BucketExists(ctx context.Context, bucketName string) (bool, error)
}

type MinIOChecker struct {
	client MinIOBucketChecker
	bucket string
}

func NewMinIOChecker(client MinIOBucketChecker, bucket string) *MinIOChecker {
	return &MinIOChecker{client: client, bucket: bucket}
}

func (c *MinIOChecker) Name() string {
	return "minio"
}

func (c *MinIOChecker) Check(ctx context.Context) error {
	exists, err := c.client.BucketExists(ctx, c.bucket)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("required bucket %q does not exist", c.bucket)
	}
	return nil
}
