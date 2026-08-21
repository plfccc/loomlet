import os from 'node:os';
import path from 'node:path';
import which from 'which';
import { spawn } from 'node:child_process';

export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';
export const IS_LINUX = process.platform === 'linux';

/**
 * Home directory, honouring an explicit $HOME override.
 *
 * os.homedir() reads USERPROFILE on Windows and ignores HOME entirely, so a test (or a
 * sandbox) that redirects HOME to a temp dir still gets the real profile there. Tests that
 * did exactly that were writing fixtures into the user's real ~/.loomlet and accumulating
 * them across runs, which is what made several suites fail only on Windows.
 */
export function getHome(): string {
  const override = String(process.env.HOME || '').trim();
  return override || os.homedir();
}

export function expandTilde(p: string): string {
  if (!p || p[0] !== '~') return p;
  const home = getHome();
  if (p === '~') return home;
  if (p.startsWith('~/') || (IS_WIN && p.startsWith('~\\'))) {
    return path.join(home, p.slice(2));
  }
  return p;
}

export function whichSync(cmd: string): string | null {
  return which.sync(cmd, { nothrow: true }) || null;
}

/**
 * spawn() a CLI by bare command name, portably.
 *
 * On Windows `npm i -g` leaves both `foo` (a POSIX sh script for Git Bash) and `foo.cmd`
 * side by side, and neither is directly spawnable: the extension-less script is not a PE
 * image (ENOENT), and since Node 18.20 a .cmd/.bat without a shell is refused outright
 * (EINVAL, an argument-injection guard). Resolve via `which`, which honours PATHEXT and so
 * never hands back the sh script.
 *
 * Batch shims then run as `cmd.exe /d /s /c <shim> <args...>` rather than via `shell: true`.
 * Both reach cmd.exe, but shell:true concatenates the argv into one command line without
 * escaping (Node's DEP0190) — and these arguments include MCP server URLs, env values and
 * commands straight from user config. Spawning cmd.exe ourselves keeps them as discrete
 * argv entries for Node's own Windows quoting.
 */
export function spawnCli(
  command: string,
  args: string[],
  options: import('node:child_process').SpawnOptions,
): import('node:child_process').ChildProcess {
  if (!IS_WIN) return spawn(command, args, options);

  const resolved = resolveCliPath(command);
  if (!/\.(cmd|bat)$/i.test(resolved)) return spawn(resolved, args, options);

  const comspec = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
  return spawn(comspec, ['/d', '/s', '/c', resolved, ...args], { ...options, windowsHide: true });
}

/** Absolute path a bare command name resolves to, or the name unchanged. See spawnCli. */
export function resolveCliPath(command: string): string {
  if (!IS_WIN) return command;
  if (path.extname(command) || command.includes('/') || command.includes('\\')) return command;
  return whichSync(command) || command;
}

/**
 * Run a CLI to completion, rejecting on non-zero exit or timeout — an execFile stand-in
 * that survives Windows batch shims. Built on spawnCli so arguments stay in the array and
 * are never concatenated into a shell command line, which matters because MCP server URLs,
 * env values and commands all come from user config.
 */
export function runCli(
  command: string,
  args: string[],
  options: { timeout?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnCli(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options.cwd,
      env: options.env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => {
      done(() => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        reject(new Error(`${command} timed out after ${options.timeout}ms`));
      });
    }, options.timeout ?? 60_000);

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', err => done(() => reject(err)));
    child.on('close', code => done(() => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}${stderr.trim() ? `: ${stderr.trim().slice(0, 300)}` : ''}`));
    }));
  });
}

export function encodePathAsDirName(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, '-');
}

export function pathContainsSegment(p: string, segment: string): boolean {
  const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`[\\\\/]${escaped}([\\\\/]|$)`).test(p);
}

export const DEV_NULL_REDIRECT = IS_WIN ? '2>nul' : '2>/dev/null';
