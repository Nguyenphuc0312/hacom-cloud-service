package health

import (
	"context"

	"github.com/minio/minio-go/v7"
)

type PostgresPinger interface {
	PingContext(ctx context.Context) error
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
	return c.db.PingContext(ctx)
}

type MinIOBucketLister interface {
	ListBuckets(ctx context.Context) ([]minio.BucketInfo, error)
}

type MinIOChecker struct {
	client MinIOBucketLister
}

func NewMinIOChecker(client MinIOBucketLister) *MinIOChecker {
	return &MinIOChecker{client: client}
}

func (c *MinIOChecker) Name() string {
	return "minio"
}

func (c *MinIOChecker) Check(ctx context.Context) error {
	_, err := c.client.ListBuckets(ctx)
	return err
}
