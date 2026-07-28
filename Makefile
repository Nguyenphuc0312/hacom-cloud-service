ifneq (,$(wildcard .env))
include .env
export
endif

COMPOSE_FILE ?= deployments/docker-compose.yml
COMPOSE ?= docker compose -f $(COMPOSE_FILE)
MIGRATE ?= migrate
TEST_DATABASE_URL ?= postgres://hacom:hacom@localhost:5432/hacom_cloud_integration_test?sslmode=disable
TEST_MINIO_ENDPOINT ?= localhost:9000
POSTMAN_COLLECTION ?= tests/postman/Hacom-Cloud-Process-2.postman_collection.json
POSTMAN_ENVIRONMENT ?= tests/postman/Hacom-Cloud-Local.postman_environment.json
POSTMAN_PROCESS3_COLLECTION ?= tests/postman/Hacom-Cloud-Process-3-Upload.postman_collection.json

.PHONY: run-api run-worker test fmt vet up down logs ps \
	infra-up infra-down infra-logs infra-ps \
	migrate-up migrate-down migrate-version db-verify \
	test-integration test-integration-clean test-postman test-postman-process3 \
	test-integration-process4 \
	win-up win-down win-logs win-ps

run-api:
	go run ./cmd/api

run-worker:
	go run ./cmd/worker

test:
	go test ./...

test-integration:
	TEST_DATABASE_URL="$(TEST_DATABASE_URL)" \
	TEST_MINIO_ENDPOINT="$(TEST_MINIO_ENDPOINT)" \
	go test ./internal/repository ./internal/filehash -count=1 -v

test-integration-clean:
	sh scripts/test-integration.sh

test-integration-process4:
	sh scripts/test-process4-integration.sh

test-postman:
	npx --yes newman run "$(POSTMAN_COLLECTION)" \
		-e "$(POSTMAN_ENVIRONMENT)" --reporters cli

test-postman-process3:
	npx --yes newman run "$(POSTMAN_PROCESS3_COLLECTION)" \
		-e "$(POSTMAN_ENVIRONMENT)" --reporters cli

fmt:
	gofmt -w ./cmd ./internal

vet:
	go vet ./...

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

infra-up:
	$(MAKE) up

infra-down:
	$(MAKE) down

infra-logs:
	$(MAKE) logs

infra-ps:
	$(MAKE) ps

win-up:
	powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 up

win-down:
	powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 down

win-logs:
	powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 logs

win-ps:
	powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 ps

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
