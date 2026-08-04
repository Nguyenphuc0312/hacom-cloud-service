package health

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type fakePostgresRow struct {
	version     int64
	dirty       bool
	schemaReady bool
	err         error
}

func (r fakePostgresRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*dest[0].(*int64) = r.version
	*dest[1].(*bool) = r.dirty
	*dest[2].(*bool) = r.schemaReady
	return nil
}

type fakePostgresClient struct {
	pingErr error
	row     fakePostgresRow
	query   string
}

func (c *fakePostgresClient) Ping(context.Context) error {
	return c.pingErr
}

func (c *fakePostgresClient) QueryRow(
	_ context.Context,
	query string,
	_ ...any,
) pgx.Row {
	c.query = query
	return c.row
}

func TestPostgresCheckerRequiresHealthyMigratedSchema(t *testing.T) {
	client := &fakePostgresClient{
		row: fakePostgresRow{
			version:     minimumSchemaVersion,
			schemaReady: true,
		},
	}
	checker := NewPostgresChecker(client)

	if err := checker.Check(context.Background()); err != nil {
		t.Fatalf("check PostgreSQL: %v", err)
	}
	if !strings.Contains(client.query, "schema_migrations") ||
		!strings.Contains(client.query, "cloud.items") ||
		!strings.Contains(client.query, "cloud.quota_requests") {
		t.Fatalf("readiness query does not validate migration and cloud schema: %s", client.query)
	}
}

func TestPostgresCheckerRejectsUnreadyDatabase(t *testing.T) {
	tests := []struct {
		name   string
		client *fakePostgresClient
	}{
		{
			name:   "ping failure",
			client: &fakePostgresClient{pingErr: errors.New("connection refused")},
		},
		{
			name: "migration table missing",
			client: &fakePostgresClient{
				row: fakePostgresRow{err: errors.New("relation does not exist")},
			},
		},
		{
			name: "dirty migration",
			client: &fakePostgresClient{
				row: fakePostgresRow{
					version:     minimumSchemaVersion,
					dirty:       true,
					schemaReady: true,
				},
			},
		},
		{
			name: "old migration",
			client: &fakePostgresClient{
				row: fakePostgresRow{
					version:     minimumSchemaVersion - 1,
					schemaReady: true,
				},
			},
		},
		{
			name: "required table missing",
			client: &fakePostgresClient{
				row: fakePostgresRow{
					version: minimumSchemaVersion,
				},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := NewPostgresChecker(test.client).Check(context.Background()); err == nil {
				t.Fatal("expected readiness error")
			}
		})
	}
}

type fakeBucketChecker struct {
	exists bool
	err    error
	bucket string
}

func (c *fakeBucketChecker) BucketExists(_ context.Context, bucket string) (bool, error) {
	c.bucket = bucket
	return c.exists, c.err
}

func TestMinIOCheckerRequiresConfiguredBucket(t *testing.T) {
	client := &fakeBucketChecker{exists: true}
	checker := NewMinIOChecker(client, "hacom-cloud-private")

	if err := checker.Check(context.Background()); err != nil {
		t.Fatalf("check bucket: %v", err)
	}
	if client.bucket != "hacom-cloud-private" {
		t.Fatalf("checked bucket = %q", client.bucket)
	}
}

func TestMinIOCheckerRejectsMissingBucket(t *testing.T) {
	checker := NewMinIOChecker(&fakeBucketChecker{}, "hacom-cloud-private")

	if err := checker.Check(context.Background()); err == nil {
		t.Fatal("expected missing bucket error")
	}
}

func TestMinIOCheckerReturnsClientError(t *testing.T) {
	expected := errors.New("connection refused")
	checker := NewMinIOChecker(
		&fakeBucketChecker{err: expected},
		"hacom-cloud-private",
	)

	if err := checker.Check(context.Background()); !errors.Is(err, expected) {
		t.Fatalf("check error = %v, want %v", err, expected)
	}
}
