package worker

import (
	"context"
	"errors"
)

var ErrNoJob = errors.New("no job available")

type JobType string

const (
	JobDemo            JobType = "DEMO"
	JobHashFile        JobType = "HASH_FILE"
	JobVirusScan       JobType = "VIRUS_SCAN"
	JobCreateThumbnail JobType = "CREATE_THUMBNAIL"
	JobCleanupExpired  JobType = "CLEANUP_EXPIRED_UPLOAD"
	JobReconcileQuota  JobType = "RECONCILE_QUOTA"
)

type Job struct {
	ID      string
	Type    JobType
	Payload []byte
}

type JobRepository interface {
	Claim(ctx context.Context) (Job, error)
	Complete(ctx context.Context, jobID string) error
	Fail(ctx context.Context, jobID string, cause error) error
}

type JobHandler interface {
	Handle(ctx context.Context, job Job) error
}
