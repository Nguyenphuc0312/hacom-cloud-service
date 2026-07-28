ifneq (,$(wildcard .env))
include .env
export
endif

COMPOSE_FILE ?= deployments/docker-compose.yml
COMPOSE ?= docker compose -f $(COMPOSE_FILE)

.PHONY: run-api run-worker test fmt vet up down logs ps infra-up infra-down infra-logs infra-ps

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
