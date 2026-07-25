package worker

import "context"

type JobType string

const (
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

type Repository interface {
	Claim(ctx context.Context) (Job, error)
	Complete(ctx context.Context, jobID string) error
	Fail(ctx context.Context, jobID string, cause error) error
}

type Handler interface {
	Handle(ctx context.Context, job Job) error
}
