ifneq (,$(wildcard .env))
include .env
export
endif

MIGRATE ?= migrate

.PHONY: run-api run-worker test fmt vet infra-up infra-down infra-ps \
	migrate-up migrate-down migrate-version db-verify

run-api:
	go run ./cmd/api

run-worker:
	go run ./cmd/worker

test:
	go test ./...

fmt:
	gofmt -w ./cmd ./internal

vet:
	go vet ./...

infra-up:
	docker compose -f deployments/docker-compose.yml up -d

infra-down:
	docker compose -f deployments/docker-compose.yml down

infra-ps:
	docker compose -f deployments/docker-compose.yml ps

migrate-up:
	$(MIGRATE) -path migrations -database "$(DATABASE_URL)" up

migrate-down:
	$(MIGRATE) -path migrations -database "$(DATABASE_URL)" down 1

migrate-version:
	$(MIGRATE) -path migrations -database "$(DATABASE_URL)" version

db-verify:
	docker compose -f deployments/docker-compose.yml exec -T postgres \
		psql -v ON_ERROR_STOP=1 -U hacom -d hacom_cloud \
		-f /dev/stdin < scripts/verify-schema.sql
