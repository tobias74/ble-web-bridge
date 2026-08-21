#!/usr/bin/env sh
set -eu

compose_file="compose.e2e.yml"
project_name="blebridge-e2e"
BLEBRIDGE_E2E_UID="$(id -u)"
BLEBRIDGE_E2E_GID="$(id -g)"
export BLEBRIDGE_E2E_UID BLEBRIDGE_E2E_GID

cleanup() {
  docker compose -p "$project_name" -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

docker compose -p "$project_name" -f "$compose_file" config --quiet
docker compose -p "$project_name" -f "$compose_file" up --abort-on-container-exit --exit-code-from cypress cypress
