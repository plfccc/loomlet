# Loomlet

A layered, open Agent orchestrator — a streamlined fork of
[pikiloom](https://github.com/xiaotonng/pikiloom).

Drive Claude Code and Codex from whichever terminal is closest: Telegram, Feishu, the Web
Dashboard, or the CLI. IM is not a bridge bolted onto a coding agent — it is one pluggable
terminal among several, all sitting on the same orchestration core.

```bash
npx loomlet@latest
```

## Four layers

| Layer | What it does |
|-------|--------------|
| **Terminal** | Telegram, Feishu, and the Web Dashboard are equal, pluggable entry points |
| **Agent** | Claude Code and Codex behind a driver registry (`claude-tui` is a PTY-passthrough backend of the claude driver) |
| **Model** | Frontier models (Claude, GPT/Codex), Chinese series (DeepSeek, 豆包, MiMo, MiniMax), OpenRouter, local Ollama / LM Studio, or any OpenAI-compatible proxy. A Providers + Profiles vault injects credentials per agent at spawn time |
| **Tool** | Skills, MCP servers, and CLI tools, merged across global and workspace scopes |

Sessions run in parallel, survive restarts, and stay resumable from the agent CLI's own
transcript store even after you delete them here.

## What this fork drops

Relative to upstream:

- **Channels** — weixin, wecom, slack, discord, dingtalk removed. Telegram and Feishu remain.
- **Drivers** — `gemini` and `hermes` removed, in **both** `src/agent/drivers` and
  `packages/kernel/src/drivers`. The vendored kernel is therefore no longer a drop-in match for
  the published `@pikiloom/kernel`, and merging `upstream` will conflict in those files.
- **Local-model catalog** — the Ollama/MLX browse-and-install pages are gone. Local providers
  still work: point a Provider at `http://127.0.0.1:11434/v1` and Codex routing picks it up.
- **Marketing site** — the `web/` directory and its assets.

Kept: `packages/kernel`, `src/pikichannel` (WebRTC access from off-LAN), and the full
Providers + Profiles credential vault.

## State directory

Config and session state live in `~/.loomlet/setting.json`. On first launch,
`migrateLegacyStateDir()` renames an existing `~/.pikiloom` (or `~/.pikiclaw`) into place, so
existing config, sessions, and credentials carry over untouched.

Environment variables keep the `PIKILOOM_*` prefix — dozens of reads across the tree spell the
names out as literals, so renaming the prefix alone would silently break them. `LOOMLET_*` is
accepted as an alias and hydrated onto `PIKILOOM_*` at startup.

## Quick start

Install one of the agent CLIs first:

```bash
npm i -g @anthropic-ai/claude-code    # or
npm i -g @openai/codex
```

Then run loomlet and open the Dashboard it prints:

```bash
npx loomlet@latest
```

The Dashboard is part of the normal runtime, not just a setup helper — configure channels,
providers, models, MCP servers, and skills there. To wire a channel by hand instead, add
credentials to `~/.loomlet/setting.json`:

```json
{
  "telegramBotToken": "...",
  "feishuAppId": "cli_...",
  "feishuAppSecret": "..."
}
```

Run `npx loomlet@latest --doctor` any time to re-check the setup.

## Development

```bash
npm install
npm run dev                                          # --no-daemon, logs to ~/.loomlet/dev/dev.log
npm test                                             # Vitest (src + packages/kernel)
npx tsc --noEmit                                     # server
npx tsc -p dashboard/tsconfig.json --noEmit          # SPA
npx tsc -p packages/kernel/tsconfig.json --noEmit    # kernel
npm run build                                        # the real gate
```

Node `22.23.1 || ^24 || ^25.2.0`; npm must be exactly `11.6.2`. Both are enforced through
`devEngines`, which `--engine-strict=false` does not bypass.

On Windows, roughly 15 test files fail in a clean upstream checkout as well (fake-CLI shebangs,
drive letters in `encodeClaudeProjectDir`). Diff against a baseline worktree before treating a
failure as a regression — see `CLAUDE.md` for the exact commands.

Architecture and extension guides: `CLAUDE.md`, `ARCHITECTURE.md`, `INTEGRATION.md`,
`TESTING.md`.

## License

MIT — same as upstream pikiloom. See [LICENSE](LICENSE).
