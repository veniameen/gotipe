#!/usr/bin/env bash
# The current server owns API, sync rooms and workers in one process. Restarting
# it briefly disconnects clients; durable replication supports their reconnect.
#
# Usage: infra/scripts/deploy.sh <image tag>. The script names no host, domain or
# registry: Compose takes them from infra/.env (API_HOST, SYNC_HOST, the origins,
# CLOUD_IMAGE). The configuration check below runs first, so a missing name
# stops the script before anything changes. Caddy is not restarted here: after
# changing API_HOST or SYNC_HOST, run docker compose up -d caddy.
set -euo pipefail

export IMAGE_TAG="${1:-latest}"
case "$IMAGE_TAG" in *[!a-zA-Z0-9_.-]*|'') echo "Invalid image tag" >&2; exit 2;; esac
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_YAML="$PROJECT_ROOT/infra/docker-compose.yml"
COMPOSE=(docker compose -f "$COMPOSE_YAML")

# The backend network has a fixed subnet so Caddy keeps the address that the API
# trusts for X-Forwarded-For (TRUSTED_PROXIES). Docker never changes the subnet
# of an existing network: on a host created before the subnet was fixed, Caddy
# would keep a dynamic address and every login would share one rate limit.
# Stop before changing anything and say how to recreate the network once.
check_backend_network() {
  local config project expected networks network actual
  config="$("${COMPOSE[@]}" config --format json)"
  project="$(awk -F'"' '/^  "name":/ { print $4; exit }' <<<"$config")"
  expected="$(awk -F'"' '/"subnet":/ { print $4; exit }' <<<"$config")"
  if [ -z "$project" ] || [ -z "$expected" ]; then
    echo "Cannot read the project name or the backend subnet from $COMPOSE_YAML" >&2
    exit 3
  fi
  networks="$(docker network ls --quiet \
    --filter "label=com.docker.compose.project=${project}" \
    --filter "label=com.docker.compose.network=backend")"
  network="${networks%%$'\n'*}"
  if [ -z "$network" ]; then
    return 0 # first deployment: compose creates the network with the subnet
  fi
  actual="$(docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$network")"
  actual="${actual% }"
  case " $actual " in *" $expected "*) return 0 ;; esac
  cat >&2 <<EOF
The ${project} backend network has subnet ${actual:-(none)} but docker-compose.yml expects ${expected}.
Docker does not change an existing network, so Caddy would not get its fixed address,
TRUSTED_PROXIES would match nothing and every login would share one rate limit.
Recreate the containers and networks once; volumes and data are kept:
  docker compose -f ${COMPOSE_YAML} --profile monitoring down
  $0 ${IMAGE_TAG}
  IMAGE_TAG=${IMAGE_TAG} docker compose -f ${COMPOSE_YAML} up -d
Add --profile monitoring to the last command if you run Prometheus and Grafana.
EOF
  exit 3
}
check_backend_network

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
