#!/usr/bin/env bash

set -euo pipefail

DEV_DIR="${HOME}/.loomlet/dev"
LOG_FILE="${DEV_DIR}/dev.log"

# Dev dashboard always binds this port. dev.sh frees it before (re)starting so a
# restart deterministically rebinds the same port instead of drifting upward via
# the server's EADDRINUSE retry. Read before the env scrub; override with
# PIKILOOM_DEV_PORT if you really need a different one.
DEV_PORT="${PIKILOOM_DEV_PORT:-3940}"

# Neither pkill nor lsof reaches a native Windows process from Git Bash — pkill is often
# not even on a non-interactive PATH, and lsof simply is not installed. Both greps silently
# found nothing, so every `npm run dev` left the previous worker alive: N runtimes polling
# one Telegram bot (HTTP 409 "terminated by other getUpdates request") and the dashboard
# drifting off ${DEV_PORT} on EADDRINUSE. Query the OS instead, per platform.

# PIDs of dev workers, matched on the tsx command line.
_dev_worker_pids() {
  if [[ "${OS:-}" == "Windows_NT" ]]; then
    powershell -NoProfile -Command \
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*src/cli/main.ts*--no-daemon*' } | ForEach-Object { \$_.ProcessId }" \
      2>/dev/null | tr -d '\r' | grep -E '^[0-9]+$' || true
  else
    pgrep -f 'tsx src/cli/main.ts --no-daemon' 2>/dev/null || true
  fi
}

# PIDs listening on $1.
_port_listener_pids() {
  if [[ "${OS:-}" == "Windows_NT" ]]; then
    netstat -ano 2>/dev/null | tr -d '\r' \
      | awk -v port=":$1" '$1 ~ /^TCP$/ && $2 ~ port"$" && $4 == "LISTENING" { print $5 }' \
      | grep -E '^[0-9]+$' | sort -u || true
  else
    lsof -ti "tcp:$1" 2>/dev/null || true
  fi
}

# Kill a whole process tree; $2 non-empty forces it.
_kill_tree() {
  local pid="$1" force="${2:-}"
  [[ -z "$pid" ]] && return 0
  if [[ "${OS:-}" == "Windows_NT" ]]; then
    if [[ -n "$force" ]]; then taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
    else taskkill //PID "$pid" //T >/dev/null 2>&1 || true; fi
  else
    if [[ -n "$force" ]]; then kill -9 "$pid" 2>/dev/null || true
    else kill "$pid" 2>/dev/null || true; fi
  fi
}


# `dev.sh --stop`: tear the dev runtime down and exit. Handled here, before the detach
# decision, so the flag is never forwarded to the worker as a runtime argument.
if [[ "${1:-}" == "--stop" ]]; then
  _stopped=0
  for _pass in '' force; do
    while IFS= read -r _pid; do
      [[ -z "$_pid" ]] && continue
      _kill_tree "$_pid" "$_pass"
      _stopped=1
    done < <(_dev_worker_pids)
    while IFS= read -r _pid; do
      [[ -z "$_pid" ]] && continue
      _kill_tree "$_pid" "$_pass"
      _stopped=1
    done < <(_port_listener_pids "${DEV_PORT}")
    [[ -z "$(_dev_worker_pids)$(_port_listener_pids "${DEV_PORT}")" ]] && break
    sleep 0.5
  done
  rm -f "${DEV_DIR}/dev.pid"
  if (( _stopped )); then echo "[dev.sh] dev runtime stopped"; else echo "[dev.sh] nothing to stop"; fi
  exit 0
fi

# Dev mode must stay on the local source tree.
# Do not hop into the upstream production/self-bootstrap `npx pikiloom@latest` chain.
mkdir -p "${DEV_DIR}"

# Decide whether to detach early.
#
# Why this happens FIRST, before any kill / build:
# dev.sh restarts the running loomlet runtime, and when invoked from inside an
# agent session (Codex app-server, Claude `-p`, …) that runtime IS the host
# process for the agent. If we kill the runtime while still living in the
# agent's bash subtree, the agent's stdio breaks mid-script: Codex cancels the
# current turn and tears down the bash subprocess, killing dev.sh before it can
# hand off to nohup, so the new dev never starts. Detaching first severs us
# from that subtree so the subsequent kill is safe.
#
# Priority:
#   already detached (PIKILOOM_DEV_DETACHED=1)   -> no, we ARE the worker
#   PIKILOOM_DEV_BACKGROUND=1                    -> yes
#   PIKILOOM_DEV_FOREGROUND=1                    -> no
#   no controlling TTY (agent Bash tool, piped)  -> yes
#   otherwise                                    -> no (interactive terminal)
_should_detach=0
if [[ "${PIKILOOM_DEV_DETACHED:-0}" == "1" ]]; then
  _should_detach=0
elif [[ "${PIKILOOM_DEV_BACKGROUND:-0}" == "1" ]]; then
  _should_detach=1
elif [[ "${PIKILOOM_DEV_FOREGROUND:-0}" == "1" ]]; then
  _should_detach=0
elif [[ ! -t 1 ]]; then
  _should_detach=1
fi

if (( _should_detach )); then
  : > "${LOG_FILE}"
  # Agent tool runners can clean up the shell's remaining child process tree
  # after this parent exits. Launch the worker in a new session from a short
  # Python parent so it is reparented before the tool runner performs cleanup.
  #
  # Probe by running python3, not by `command -v`: Windows ships an App Execute
  # Alias stub at python3.exe that resolves on PATH but only prints a Microsoft
  # Store advert and exits non-zero. Trusting `command -v` there takes this
  # branch, produces no pid, and silently spawns nothing.
  if python3 -c '' >/dev/null 2>&1; then
    _bg_pid=$(python3 - "$0" "${LOG_FILE}" "$(pwd)" "$@" <<'PY'
import os
import subprocess
import sys

script, log_file, workdir, *args = sys.argv[1:]
env = os.environ.copy()
env["PIKILOOM_DEV_DETACHED"] = "1"
with open(os.devnull, "rb") as stdin, open(log_file, "ab", buffering=0) as log:
    proc = subprocess.Popen(
        ["bash", script, *args],
        cwd=workdir,
        env=env,
        stdin=stdin,
        stdout=log,
        stderr=subprocess.STDOUT,
        close_fds=True,
        start_new_session=True,
    )
print(proc.pid)
PY
)
    if [[ ! "${_bg_pid}" =~ ^[0-9]+$ ]]; then
      _bg_pid="(spawned)"
    fi
  else
    nohup env PIKILOOM_DEV_DETACHED=1 bash "$0" "$@" </dev/null >>"${LOG_FILE}" 2>&1 &
    _bg_pid=$!
    disown "$_bg_pid" 2>/dev/null || true
  fi
  cat <<EOF
[dev.sh] detached worker spawned (pid=${_bg_pid}); restart proceeds outside caller's process tree
[dev.sh]   log:  ${LOG_FILE}     (tail -f to follow)
[dev.sh]   stop: bash scripts/dev.sh --stop
[dev.sh]   force foreground next time: PIKILOOM_DEV_FOREGROUND=1 npm run dev
EOF
  exit 0
fi

# ---------------------------------------------------------------------------
# Below runs either as the TTY foreground process, or as the detached worker.
# Both are now safe to kill the running loomlet runtime — neither shares a
# stdio/process-group dependency with the agent that invoked us.
# ---------------------------------------------------------------------------

# Kill any previous dev processes (npm -> bash -> tsx -> node tree)
_killed=0
# 1) Kill previous dev workers, matched on their tsx command line.
while IFS= read -r _pid; do
  [[ -z "$_pid" ]] && continue
  _kill_tree "$_pid"
  _killed=1
done < <(_dev_worker_pids)

# 2) Kill whatever else is still listening on the dev dashboard port.
while IFS= read -r _pid; do
  [[ -z "$_pid" ]] && continue
  _kill_tree "$_pid"
  _killed=1
done < <(_port_listener_pids "${DEV_PORT}")

if (( _killed )); then
  echo "[dev.sh] killed previous dev process(es), waiting for port ${DEV_PORT} to free..."
  # Bounded wait for the port to actually release, so we always rebind ${DEV_PORT}
  # rather than letting the server drift to ${DEV_PORT}+1 on EADDRINUSE.
  for _i in $(seq 1 30); do
    _port_pid=$(_port_listener_pids "${DEV_PORT}" | head -1)
    [[ -z "$_port_pid" ]] && break
    sleep 0.2
  done
  # Last resort: force-kill anything still holding the port.
  while IFS= read -r _pid; do
    [[ -z "$_pid" ]] && continue
    _kill_tree "$_pid" force
  done < <(_port_listener_pids "${DEV_PORT}")
  # And any worker that ignored the polite signal.
  while IFS= read -r _pid; do
    [[ -z "$_pid" ]] && continue
    _kill_tree "$_pid" force
  done < <(_dev_worker_pids)
  sleep 0.3
fi
rm -f "${DEV_DIR}/dev.pid"

# Remember whether this invocation is the detached worker, BEFORE the env
# scrub below wipes PIKILOOM_DEV_DETACHED along with the rest of PIKILOOM_*.
# The flag controls whether we truncate the log (the worker must not — its
# parent already did, and the worker's own stdout/stderr is being appended
# to that file).
_is_detached_worker=0
[[ "${PIKILOOM_DEV_DETACHED:-0}" == "1" ]] && _is_detached_worker=1

# Dev isolates setting.json only. The managed browser profile intentionally
# stays at ~/.loomlet/browser/chrome-profile so dev and the main runtime reuse
# the same browser login state.
#
# Clean inherited env vars that leak when launched from inside a running loomlet
# or Claude Code session. Without this, the dev process inherits agent permissions,
# channel credentials, daemon flags, workdir overrides, etc. from the parent.
# Use pattern-based unset to catch everything rather than maintaining an explicit list.
#
# Whitelist: user-set runtime switches for the Claude driver must survive the
# scrub so the child runtime can see them. `PIKILOOM_CLAUDE_PRINT=1` forces
# print mode (the new opt-out, since TUI is the default), `PIKILOOM_CLAUDE_TUI*`
# covers the legacy on/off plus the `_DEBUG` / `_KEEP_API_KEY` sub-flags.
while IFS= read -r _var; do
  unset "$_var"
done < <(env | grep -oE '^(PIKILOOM_|CLAUDECODE|CLAUDE_CODE_|CLAUDE_MODEL|CLAUDE_PERMISSION_|CODEX_|GEMINI_|DEFAULT_AGENT|FEISHU_|TELEGRAM_|WEIXIN_)[^=]*' \
  | grep -vE '^PIKILOOM_CLAUDE_(TUI|PRINT)' || true)

# Set dev-specific env AFTER the cleanup so they are not wiped.
export PIKILOOM_CONFIG="${DEV_DIR}/setting.json"
export PIKILOOM_LOG_LEVEL="${PIKILOOM_LOG_LEVEL:-debug}"

echo $$ > "${DEV_DIR}/dev.pid"
trap 'rm -f "${DEV_DIR}/dev.pid"' EXIT

# TTY mode truncates here. The detached worker inherits an already-truncated
# log from its parent (see early-detach branch above) AND has been writing its
# own stdout/stderr to that file since spawn, so re-truncating would wipe its
# own startup chatter.
if (( ! _is_detached_worker )); then
  : > "${LOG_FILE}"
fi

if (( _is_detached_worker )); then
  {
    npm run build:kernel
    npm run build:dashboard
    npx tsx src/cli/main.ts --no-daemon --dashboard-port "${DEV_PORT}" "$@"
  } >>"${LOG_FILE}" 2>&1
else
  {
    npm run build:kernel
    npm run build:dashboard
    npx tsx src/cli/main.ts --no-daemon --dashboard-port "${DEV_PORT}" "$@"
  } 2>&1 | node scripts/retained-tee.mjs "${LOG_FILE}"
fi
