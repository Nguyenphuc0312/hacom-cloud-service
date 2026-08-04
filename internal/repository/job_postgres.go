package repository

import (
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
	"github.com/jackc/pgx/v5/pgxpool"
)

type JobPostgres = worker.JobPostgres
type RetryPolicy = worker.RetryPolicy
type JobRepository = worker.JobRepository
type Job = worker.Job
type JobType = worker.JobType
type JobStatus = worker.JobStatus
type JobPostgresOption = worker.JobPostgresOption

const (
	JobDemo            = worker.JobDemo
	JobHashFile        = worker.JobHashFile
	JobVirusScan       = worker.JobVirusScan
	JobCreateThumbnail = worker.JobCreateThumbnail
	JobCleanupExpired  = worker.JobCleanupExpired
	JobReconcileQuota  = worker.JobReconcileQuota
	JobPermanentDelete = worker.JobPermanentDelete
	JobPending         = worker.JobPending
	JobProcessing      = worker.JobProcessing
	JobCompleted       = worker.JobCompleted
	JobFailed          = worker.JobFailed
	JobDead            = worker.JobDead
)

var ErrNoJob = worker.ErrNoJob

func NewJobPostgres(
	pool *pgxpool.Pool,
	workerID string,
	policy RetryPolicy,
	options ...JobPostgresOption,
) (*JobPostgres, error) {
	return worker.NewJobPostgres(pool, workerID, policy, options...)
}
