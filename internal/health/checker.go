package health

import (
	"context"
	"time"
)

const (
	StatusUp   = "UP"
	StatusDown = "DOWN"
)

type Checker interface {
	Name() string
	Check(ctx context.Context) error
}

type DependencyStatus struct {
	Status    string `json:"status"`
	LatencyMS int64  `json:"latencyMs"`
	Error     string `json:"error,omitempty"`
}

type Response struct {
	Status  string                      `json:"status"`
	Service string                      `json:"service"`
	Checks  map[string]DependencyStatus `json:"checks"`
}

type Service struct {
	timeout  time.Duration
	checkers []Checker
}

func NewService(timeout time.Duration, checkers ...Checker) *Service {
	return &Service{
		timeout:  timeout,
		checkers: append([]Checker(nil), checkers...),
	}
}

func (s *Service) Check(ctx context.Context) Response {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	type result struct {
		name   string
		status DependencyStatus
	}

	results := make(chan result, len(s.checkers))
	for _, checker := range s.checkers {
		checker := checker
		go func() {
			startedAt := time.Now()
			err := checker.Check(ctx)
			status := DependencyStatus{
				Status:    StatusUp,
				LatencyMS: time.Since(startedAt).Milliseconds(),
			}
			if err != nil {
				status.Status = StatusDown
				status.Error = "unavailable"
			}
			results <- result{name: checker.Name(), status: status}
		}()
	}

	response := Response{
		Status:  StatusUp,
		Service: "cloud-api",
		Checks:  make(map[string]DependencyStatus, len(s.checkers)),
	}

	for range s.checkers {
		current := <-results
		response.Checks[current.name] = current.status
		if current.status.Status == StatusDown {
			response.Status = StatusDown
		}
	}

	return response
}
