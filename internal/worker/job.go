package worker

import (
	"context"
	"errors"
)

var ErrNoJob = errors.New("no job available")

type JobType string

const (
	JobDemo            JobType = "demo"
	JobHashFile        JobType = "hash_file"
	JobVirusScan       JobType = "virus_scan"
	JobCreateThumbnail JobType = "create_thumbnail"
	JobCleanupExpired  JobType = "cleanup_expired_upload"
	JobReconcileQuota  JobType = "reconcile_quota"
	JobPermanentDelete JobType = "permanent_delete"
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
