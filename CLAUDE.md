# Loomlet

A layered, open Agent orchestrator — a streamlined fork of [pikiloom](https://github.com/xiaotonng/pikiloom). **Not** "an IM bridge for coding agents" — IM is one of several pluggable terminals.

**Four layers (top → bottom):**

1. **Terminal** — IM channels (Telegram, Feishu) and the Web Dashboard are equal, pluggable entry points.
2. **Agent** — Wraps Claude Code and Codex through a driver registry; `claude-tui` is a PTY-passthrough backend of the claude driver, not a separately registered one.
3. **Model** — Routes across frontier models (Claude, GPT/Codex), domestic Chinese series (DeepSeek, 豆包, MiMo, MiniMax), OpenRouter, and any OpenAI-compatible proxy. Providers + Profiles vault injects credentials per agent at spawn time.
4. **Tool** — Skills, MCP servers, CLI tools, merged across global / workspace scopes.

The orchestrator is the product. Lead with the layered framing.

## Fork notes

Removed relative to upstream: the weixin / wecom / slack / discord / dingtalk channels, the
`gemini` and `hermes` drivers (in **both** `src/agent/drivers` and `packages/kernel/src/drivers`,
so kernel is no longer a drop-in match for the published `@pikiloom/kernel`), the local-model
catalog pages, and the marketing site. Merging from `upstream` will conflict in those areas.

State dir is `~/.loomlet`; `~/.pikiloom` and `~/.pikiclaw` are migrated on first launch by
`migrateLegacyStateDir()`. The env prefix stays `PIKILOOM_*` because dozens of reads spell the
variable names out as literals — `LOOMLET_*` is accepted as an alias and hydrated at startup.

## Project Structure

```text
src/
  core/                        Zero-business-logic infrastructure
    constants.ts               Centralized timeouts, retries, numeric constants
    logging.ts                 Structured logging with scoped writers
    platform.ts                Cross-platform OS primitives (IS_WIN, path, which)
    process-control.ts         Restart coordination, watchdog, process tree kill
    utils.ts                   Pure utilities
    version.ts                 Package version
    config/
      user-config.ts           ~/.loomlet/setting.json load/save/sync
      runtime-config.ts        Runtime agent / model / effort resolution
      validation.ts            Channel credential validation

  catalog/                     Data-only manifests for the Extensions page
    mcp-servers.ts             Recommended MCP servers
    cli-tools.ts               Recommended CLIs
    skill-repos.ts             Recommended skill repos

  agent/                       Agent abstraction layer
    driver.ts                  AgentDriver interface + pluggable registry
    drivers/{claude,claude-tui,codex}.ts
    session.ts                 Session workspace CRUD, classification
    stream.ts                  CLI spawn framework, stream orchestration
    skills.ts                  Project skill discovery (.loomlet/skills)
    skill-installer.ts         Wrapper around `npx skills add`
    auto-update.ts             Background agent CLI version checking
    cli/                       External CLI tool detection + OAuth-web auth
    mcp/
      bridge.ts                Per-stream MCP bridge orchestration
      session-server.ts        Stdio MCP server for agent CLIs
      registry.ts              Recommended MCP server types
      extensions.ts            MCP extension CRUD + session merge
      oauth.ts                 MCP OAuth 2.1 + Dynamic Client Registration
      tools/{workspace,ask-user,types}.ts

  bot/                         Channel-agnostic bot runtime
    bot.ts                     Bot base class: chat state, runStream()
    commands.ts                Structured command data
    command-ui.ts              Selection UI models, action executor
    orchestration.ts           Message pipeline helpers
    human-loop.ts              Human-in-the-loop state machine (Codex + im_ask_user)
    streaming.ts / render-shared.ts / menu.ts / host.ts / session-hub.ts / session-status.ts

  channels/                    Physically isolated IM implementations
    base.ts                    Abstract Channel transport + capability flags
    telegram/  feishu/

  model/                       Providers + Profiles credential vault (NOT "local models")
    store.ts                   Provider / Profile CRUD in setting.json
    injector.ts                Per-spawn credential + model injection, local-provider routing
    validation.ts              Live provider credential checks
    anthropic-bridge.ts        Anthropic-wire → OpenAI-compatible upstream
    responses-bridge.ts        Responses-wire → Chat Completions upstream

  dashboard/                   Hono HTTP server + React SPA (SPA source lives in /dashboard)
    server.ts / runtime.ts / platform.ts / session-control.ts
    routes/{config,agents,sessions,extensions,cli,models,accounts}.ts

  pikichannel/                 WebRTC rendezvous so an off-LAN browser reaches this Dashboard

  cli/                         CLI entry points
    main.ts                    --daemon / --no-daemon / --setup / MCP serve
    channels.ts / channel-supervisor.ts / setup-wizard.ts / onboarding.ts / run.ts

  browser-profile.ts           Managed Chromium profile dir for Playwright
  browser-supervisor.ts        Process-singleton: probe / ensure / invalidate

packages/kernel/               Reusable orchestration core (own tsconfig + vitest config)
dashboard/                     React SPA source built by vite into dashboard/dist
```

## Layered Dependencies

Imports flow strictly downward — no layer imports from a layer above it:

```
cli/  →  dashboard/  →  channels/*  →  bot/  →  agent/  →  catalog/, core/
```

## Key Concepts

- `bot/bot.ts` owns shared runtime state and `runStream()`
- `agent/stream.ts` is the CLI spawn framework; `agent/driver.ts` keeps agents pluggable
- `agent/mcp/bridge.ts` injects session-scoped MCP tools per stream; `agent/mcp/extensions.ts` merges global + workspace MCP config and resolves OAuth bearers
- `bot/human-loop.ts` is the single state machine for both Codex user-input and the `im_ask_user` MCP tool
- `browser-supervisor.ts` is the process-level singleton for the managed Chrome — streams call `ensure()`, never relaunch directly
- Each channel in `channels/*/` is physically isolated — touching Telegram never requires touching Feishu code

## Quick Reference

| Task | Files to read |
|------|---------------|
| Add an agent driver | `agent/driver.ts`, `agent/drivers/codex.ts` as example |
| Providers / Profiles / BYOK | `model/store.ts`, `model/injector.ts` |
| Add a recommended MCP / CLI / skill | `catalog/{mcp-servers,cli-tools,skill-repos}.ts` |
| Session management | `agent/session.ts`, `agent/types.ts` |
| Streaming behavior | `agent/stream.ts`, `bot/bot.ts` (`runStream`) |
| Add a Telegram command | `channels/telegram/bot.ts`, `bot/commands.ts` |
| Feishu rendering | `channels/feishu/render.ts`, `bot/render-shared.ts` |
| Dashboard API route | `dashboard/routes/*.ts`, `dashboard/runtime.ts` |
| MCP tool behavior | `agent/mcp/tools/*.ts`, `agent/mcp/bridge.ts` |
| MCP extension CRUD / OAuth | `agent/mcp/extensions.ts`, `agent/mcp/oauth.ts` |
| External CLI detection / auth | `agent/cli/detector.ts`, `agent/cli/auth.ts` |
| User config schema | `core/config/user-config.ts` |
| Cross-platform OS behavior | `core/platform.ts` |
| Managed browser lifecycle | `browser-supervisor.ts`, `browser-profile.ts` |

## Test Commands

```bash
npm install
npm run verify:toolchain               # also checks TS 7.0.2 + Node 22 types + Docker defaults
npm run dev                            # local dev (--no-daemon, logs to ~/.loomlet/dev/dev.log)
npm test                               # Vitest unit suite (src + packages/kernel)
npx vitest run test/<file>.unit.test.ts
npx tsc --noEmit                                    # server
npx tsc -p dashboard/tsconfig.json --noEmit         # SPA
npx tsc -p packages/kernel/tsconfig.json --noEmit   # kernel
npm run build                           # clean + SPA + server + kernel; the real gate
```

`devEngines.runtime` accepts `22.23.1 || ^24 || ^25.2.0` (upstream allowed only 22/25). npm must
be exactly 11.6.2 — that one is still a hard gate, and `--engine-strict=false` does not bypass
`devEngines`.

**Windows baseline:** ~15 test files fail on Windows in a clean upstream checkout too (fake-CLI
shebangs, `encodeClaudeProjectDir` drive letters). Before claiming a regression, diff against a
baseline worktree rather than reading the raw failure count:

```bash
git worktree add /tmp/base main && cd /tmp/base && ln -s <repo>/node_modules node_modules
node <repo>/node_modules/vitest/vitest.mjs run    # npx re-triggers the devEngines gate here
```

## Notes

- Persistent config is `~/.loomlet/setting.json`
- The Dashboard is part of the normal runtime, not just a setup helper
- This machine still runs the upstream pikiloom via `npx pikiloom@latest` (its own `~/.pikiloom` state); do not kill, replace, or "clean up" that process when the task only concerns loomlet dev mode
- `npm run dev` rewrites `~/.loomlet/dev/dev.log` on each launch. When invoked without a TTY (any tool-call / piped invocation) it auto-detaches into the background — no need for `run_in_background:true`. Force foreground with `PIKILOOM_DEV_FOREGROUND=1`, background with `PIKILOOM_DEV_BACKGROUND=1`. Stop it with `bash scripts/dev.sh --stop`.
- Dev mode isolates config: `PIKILOOM_CONFIG` points at `~/.loomlet/dev/setting.json`, so the main `~/.loomlet/setting.json` channels are NOT loaded. An empty `launching channels:` line in the dev log is expected unless that dev file has credentials of its own.
- `npm run dev` counts three `node.exe` processes on Windows for one runtime (`npx-cli.js` → `tsx/cli.mjs` → the worker). Only the innermost one binds the port; check `netstat -ano | grep :3940` rather than counting processes.
- For full architecture / extension / testing guides, see `ARCHITECTURE.md`, `INTEGRATION.md`, `TESTING.md`.
