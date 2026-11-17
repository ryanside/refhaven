#!/usr/bin/env bash
# Launch, check, drive, and stop refhaven for a verification run.
# Usage: verify.sh up | doctor [run] | drive <run> <feature> <script> [args] | rows <table> [limit] | logs [count] | down <run>
set -euo pipefail

ROOT=$(cd "$(git rev-parse --show-toplevel)" && pwd -P)
WEB="$ROOT/apps/web"
BACKEND="$ROOT/packages/backend"
ENV_FILE="$BACKEND/.env.local"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/verify-refhaven"
URL="http://localhost:3000"
HERE=$(cd "$(dirname "$0")" && pwd -P)

die() {
  echo "error: $*" >&2
  exit 1
}

port_pid() { lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | head -1; }
pid_cwd() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'; }
deployment_of() { sed -n 's/^CONVEX_DEPLOYMENT=\([^ #]*\).*/\1/p' "$1" 2>/dev/null | head -1; }
run_dir() {
  [ -n "${1:-}" ] || die "name the run that 'up' printed"
  [ -d "$CACHE/$1" ] || die "no run named $1 under $CACHE"
  echo "$CACHE/$1"
}

# Another checkout whose `convex dev` pushes to the same dev deployment would overwrite this one's functions.
other_writer() {
  local pid cwd
  for pid in $(pgrep -f "bin/convex dev" 2>/dev/null || true); do
    cwd=$(pid_cwd "$pid")
    if [ -n "$cwd" ] && [ "$cwd" != "$BACKEND" ] &&
      [ "$(deployment_of "$cwd/.env.local")" = "$(deployment_of "$ENV_FILE")" ]; then
      echo "$cwd"
      return 0
    fi
  done
  return 1
}

cmd_up() {
  [ -f "$ENV_FILE" ] || die "packages/backend/.env.local is missing. In a git worktree, copy it from the main checkout:
  cp \"\$(git worktree list --porcelain | sed -n '1s/^worktree //p')/packages/backend/.env.local\" packages/backend/.env.local
On a machine with no Convex project yet, run: cd packages/backend && bunx convex dev --once"
  case "$(deployment_of "$ENV_FILE")" in
  dev:*) ;;
  *) die "CONVEX_DEPLOYMENT is not a dev deployment. This skill never drives production." ;;
  esac
  local writer
  if writer=$(other_writer); then
    die "the checkout at ${writer%/packages/backend} is running 'convex dev' against the same dev deployment. Two checkouts cannot push to it at once. Ask the operator which one to stop."
  fi
  [ -d "$ROOT/node_modules" ] || (cd "$ROOT" && bun install)

  local run dir pid
  run=$(date +%Y%m%d-%H%M%S)
  dir="$CACHE/$run"
  mkdir -p "$dir/evidence"
  echo "$ROOT" >"$dir/checkout"

  pid=$(port_pid || true)
  if [ -n "$pid" ]; then
    [ "$(pid_cwd "$pid")" = "$WEB" ] ||
      die "port 3000 belongs to pid $pid, which runs in $(pid_cwd "$pid"). refhaven only works on $URL. Ask the operator to free the port."
    echo reused >"$dir/mode"
  else
    set -m
    (cd "$ROOT" && exec nohup bun dev) >"$dir/dev.log" 2>&1 &
    echo $! >"$dir/pid"
    echo started >"$dir/mode"
    set +m
    local waited=0
    until [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/" || true)" = 200 ] &&
      grep -q "Convex functions ready" "$dir/dev.log" &&
      grep -q "Generated files are up-to-date" "$dir/dev.log"; do
      kill -0 "$(cat "$dir/pid")" 2>/dev/null || die "bun dev exited. Read $dir/dev.log"
      [ "$waited" -lt 180 ] || die "bun dev was not ready after 180 s. Read $dir/dev.log, then run: $0 down $run"
      sleep 2
      waited=$((waited + 2))
    done
  fi

  (cd "$WEB" && bunx playwright install chromium >/dev/null)
  mkdir -p "$WEB/checks/scratch/$run"
  echo "ready: run=$run url=$URL mode=$(cat "$dir/mode") evidence=$dir/evidence scratch=apps/web/checks/scratch/$run"
}

cmd_doctor() {
  local dev_log=""
  if [ -n "${1:-}" ]; then
    local dir
    dir=$(run_dir "$1")
    echo "run=$1 mode=$(cat "$dir/mode") checkout=$(cat "$dir/checkout")"
    # Only a run that started the dev server has its log.
    [ "$(cat "$dir/mode")" = started ] && dev_log="$dir/dev.log"
  fi
  ROOT="$ROOT" VERIFY_URL="$URL" DEV_LOG="$dev_log" bun "$HERE/doctor.ts"
}

cmd_drive() {
  [ $# -ge 3 ] || die "usage: verify.sh drive <run> <feature> <script> [args]"
  local dir feature script evidence
  dir=$(run_dir "$1")
  feature=$2
  case "$3" in
  /*) script=$3 ;;
  *) script="$ROOT/$3" ;;
  esac
  shift 3
  [ -f "$script" ] || die "no script at $script"
  case "$script" in
  "$WEB"/*) ;;
  *) die "the script must live under apps/web, so it can import playwright and the helpers in checks/browser.ts" ;;
  esac
  evidence="$dir/evidence/$feature"
  mkdir -p "$evidence"
  cp "$script" "$evidence/"
  set +e
  (cd "$WEB" && EVIDENCE="$evidence" SCREENSHOT="$evidence/final.png" \
    bun --env-file=../../packages/backend/.env.local "$script" "$@") 2>&1 | tee "$evidence/transcript.txt"
  local status=${PIPESTATUS[0]}
  set -e
  echo "exit=$status evidence=$evidence"
  return "$status"
}

cmd_rows() {
  [ -n "${1:-}" ] || die "usage: verify.sh rows <table> [limit]"
  (cd "$BACKEND" && bunx convex data "$1" --limit "${2:-50}" --format jsonLines)
}

# `convex logs` streams until stopped, so this reads the recent history and stops its own process.
cmd_logs() {
  (cd "$BACKEND" && exec bunx convex logs --history "${1:-40}" --success) &
  local pid=$!
  sleep 8
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

descendants() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null || true); do
    echo "$child"
    descendants "$child"
  done
}

any_alive() {
  local pid
  for pid in "$@"; do
    kill -0 "$pid" 2>/dev/null && return 0
  done
  return 1
}

cmd_down() {
  local dir pid tree waited=0
  dir=$(run_dir "${1:-}")
  if [ "$(cat "$dir/mode")" = started ] && [ -f "$dir/pid" ]; then
    pid=$(cat "$dir/pid")
    if kill -0 "$pid" 2>/dev/null; then
      # Turborepo runs each task in its own process group, so the whole tree is recorded first.
      # The interrupt lets Turborepo stop its tasks, and anything still alive after 20 s is killed by pid.
      tree="$pid $(descendants "$pid" | tr '\n' ' ')"
      kill -INT -- "-$pid" 2>/dev/null || true
      # shellcheck disable=SC2086
      while any_alive $tree && [ "$waited" -lt 20 ]; do
        sleep 1
        waited=$((waited + 1))
      done
      # shellcheck disable=SC2086
      if any_alive $tree; then
        kill -KILL $tree 2>/dev/null || true
      fi
    fi
    rm -f "$dir/pid"
    [ -z "$(port_pid || true)" ] || die "port 3000 is still in use after the stop"
    echo "stopped the dev server this run started"
  else
    echo "left the dev server running, because this run did not start it"
  fi
  rm -rf "$WEB/checks/scratch/$1"
  rmdir "$WEB/checks/scratch" 2>/dev/null || true
  echo "kept: $dir/evidence"
}

command=${1:-}
[ $# -gt 0 ] && shift
case "$command" in
up) cmd_up ;;
doctor) cmd_doctor "$@" ;;
drive) cmd_drive "$@" ;;
rows) cmd_rows "$@" ;;
logs) cmd_logs "$@" ;;
down) cmd_down "$@" ;;
*) die "usage: verify.sh up | doctor [run] | drive <run> <feature> <script> [args] | rows <table> [limit] | logs [count] | down <run>" ;;
esac
