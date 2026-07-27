package health

import (
	"context"
	"errors"
	"testing"
)

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
