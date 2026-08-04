package health

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

const minimumSchemaVersion int64 = 8

type PostgresReadinessClient interface {
	Ping(ctx context.Context) error
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type PostgresChecker struct {
	db PostgresReadinessClient
}

func NewPostgresChecker(db PostgresReadinessClient) *PostgresChecker {
	return &PostgresChecker{db: db}
}

func (c *PostgresChecker) Name() string {
	return "postgres"
}

func (c *PostgresChecker) Check(ctx context.Context) error {
	if err := c.db.Ping(ctx); err != nil {
		return fmt.Errorf("ping PostgreSQL: %w", err)
	}

	var (
		version     int64
		dirty       bool
		schemaReady bool
	)
	err := c.db.QueryRow(ctx, `
		SELECT
			version,
			dirty,
			to_regclass('cloud.drives') IS NOT NULL
				AND to_regclass('cloud.quotas') IS NOT NULL
				AND to_regclass('cloud.items') IS NOT NULL
				AND to_regclass('cloud.item_lifecycle_operations') IS NOT NULL
				AND to_regclass('cloud.quota_requests') IS NOT NULL
				AND to_regclass('cloud.outbox_events') IS NOT NULL
				AND to_regclass('cloud.usage_ledger') IS NOT NULL
		FROM public.schema_migrations
		LIMIT 1
	`).Scan(&version, &dirty, &schemaReady)
	if err != nil {
		return fmt.Errorf("read migration state: %w", err)
	}
	if dirty {
		return errors.New("database migration is dirty")
	}
	if version < minimumSchemaVersion {
		return fmt.Errorf(
			"database schema version %d is below required version %d",
			version,
			minimumSchemaVersion,
		)
	}
	if !schemaReady {
		return errors.New("required cloud schema objects are missing")
	}
	return nil
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
