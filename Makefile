SHELL := /bin/sh

APP_NAME := chat-web-client
IMAGE_NAME ?= hacom/$(APP_NAME)
IMAGE_TAG ?= local
CONTAINER_NAME ?= $(APP_NAME)-local
DOCKER_CONTEXT ?= ..
HOST_PORT ?= 5100
API_UPSTREAM ?= http://host.docker.internal:3001
AUTH_UPSTREAM ?= http://host.docker.internal:3101
WS_UPSTREAM ?= http://host.docker.internal:8001

.PHONY: help install kill-port dev build start lint typecheck clean docker-build docker-run docker-stop docker-logs docker-shell

.DEFAULT_GOAL := help

help:
	@printf "Available targets for %s:\n" "$(APP_NAME)"
	@printf "  %-14s %s\n" "install" "Install dependencies with npm ci"
	@printf "  %-14s %s\n" "kill-port" "Dừng tiến trình đang giữ port $(HOST_PORT)"
	@printf "  %-14s %s\n" "dev" "Run Vite dev server (tự dọn port $(HOST_PORT) trước)"
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

# Vite chạy strictPort (vite.config.ts) — port 5100 hardcode ở Dockerfile,
# nginx và các config Playwright, nên fail còn hơn âm thầm nhảy sang 5101.
# Hệ quả: dev server cũ còn sống là lần chạy sau chết. Dọn trước khi start.
kill-port:
	@pid=$$(ss -ltnpH "sport = :$(HOST_PORT)" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1); \
	if [ -n "$$pid" ]; then \
		echo "Port $(HOST_PORT) đang bị pid $$pid giữ — dừng nó."; \
		kill $$pid 2>/dev/null || true; \
		for i in 1 2 3 4 5 6 7 8 9 10; do \
			kill -0 $$pid 2>/dev/null || break; \
			sleep 0.3; \
		done; \
		kill -0 $$pid 2>/dev/null && { echo "Không tự thoát — kill -9."; kill -9 $$pid 2>/dev/null || true; sleep 0.3; } || true; \
	fi

dev: kill-port
	npm run dev -- --host 0.0.0.0 --port $(HOST_PORT)

build:
	npm run build

start:
	npm run preview -- --host 0.0.0.0 --port 5100

lint:
	npm run lint

typecheck:
	npm exec tsc --noEmit -p tsconfig.app.json
	npm exec tsc --noEmit -p tsconfig.node.json

clean:
	rm -rf dist

docker-build:
	docker build --target production -f Dockerfile -t $(IMAGE_NAME):$(IMAGE_TAG) $(DOCKER_CONTEXT)

docker-run:
	docker run --rm -d \
		--name $(CONTAINER_NAME) \
		--add-host=host.docker.internal:host-gateway \
		-p $(HOST_PORT):80 \
		-e API_UPSTREAM=$(API_UPSTREAM) \
		-e AUTH_UPSTREAM=$(AUTH_UPSTREAM) \
		-e WS_UPSTREAM=$(WS_UPSTREAM) \
		$(IMAGE_NAME):$(IMAGE_TAG)

docker-stop:
	-docker rm -f $(CONTAINER_NAME)

docker-logs:
	docker logs -f $(CONTAINER_NAME)

docker-shell:
	docker exec -it $(CONTAINER_NAME) /bin/sh
