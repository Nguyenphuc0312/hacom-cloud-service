SHELL := /bin/sh

APP_NAME := chat-admin-panel
IMAGE_NAME ?= hacom/$(APP_NAME)
IMAGE_TAG ?= local
CONTAINER_NAME ?= $(APP_NAME)-local
HOST_PORT ?= 5174

.PHONY: help install dev build start lint typecheck clean docker-build docker-run docker-stop docker-logs docker-shell

.DEFAULT_GOAL := help

help:
	@printf "Available targets for %s:\n" "$(APP_NAME)"
	@printf "  %-14s %s\n" "install" "Install dependencies with npm ci"
	@printf "  %-14s %s\n" "dev" "Run Vite dev server"
	@printf "  %-14s %s\n" "build" "Create the production bundle"
	@printf "  %-14s %s\n" "start" "Preview the production bundle"
	@printf "  %-14s %s\n" "lint" "Run ESLint"
	@printf "  %-14s %s\n" "typecheck" "Run TypeScript type checking"
	@printf "  %-14s %s\n" "clean" "Remove build artifacts"
	@printf "  %-14s %s\n" "docker-build" "Build the production image"
	@printf "  %-14s %s\n" "docker-run" "Run the production image on port $(HOST_PORT)"
	@printf "  %-14s %s\n" "docker-stop" "Stop the local container"
	@printf "  %-14s %s\n" "docker-logs" "Tail container logs"
	@printf "  %-14s %s\n" "docker-shell" "Open a shell inside the running container"

install:
	npm ci

dev:
	npm run dev -- --host 0.0.0.0 --port 5174

build:
	npm run build

start:
	npm run preview -- --host 0.0.0.0 --port 5174

lint:
	npm run lint

typecheck:
	npx tsc --noEmit -p tsconfig.json

clean:
	rm -rf dist

docker-build:
	docker build --target production -t $(IMAGE_NAME):$(IMAGE_TAG) .

docker-run:
	docker run --rm -d \
		--name $(CONTAINER_NAME) \
		-p $(HOST_PORT):80 \
		$(IMAGE_NAME):$(IMAGE_TAG)

docker-stop:
	-docker rm -f $(CONTAINER_NAME)

docker-logs:
	docker logs -f $(CONTAINER_NAME)

docker-shell:
	docker exec -it $(CONTAINER_NAME) /bin/sh
