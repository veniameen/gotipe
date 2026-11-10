#!/usr/bin/env bash
# The current server owns API, sync rooms and workers in one process. Restarting
# it briefly disconnects clients; durable replication supports their reconnect.
set -euo pipefail

export IMAGE_TAG="${1:-latest}"
case "$IMAGE_TAG" in *[!a-zA-Z0-9_.-]*|'') echo "Invalid image tag" >&2; exit 2;; esac
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "$PROJECT_ROOT/infra/docker-compose.yml")

echo "Pulling GoTipe Cloud image ${IMAGE_TAG}"
"${COMPOSE[@]}" pull api

# Use the container environment for the database password and bypass pgBouncer
# for schema DDL. Do not print the resulting connection string.
echo "Applying database migrations"
"${COMPOSE[@]}" run --rm --entrypoint /bin/sh api -c \
  'export DATABASE_URL="postgres://gotipe:${POSTGRES_PASSWORD}@postgres:5432/gotipe?sslmode=disable"; exec /usr/local/bin/gotipe-cloud migrate up'

echo "Restarting API, collaboration and workers"
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 120 api
"${COMPOSE[@]}" exec -T api wget --quiet --output-document=/dev/null http://localhost:8080/readyz
echo "GoTipe Cloud ${IMAGE_TAG} is ready"
