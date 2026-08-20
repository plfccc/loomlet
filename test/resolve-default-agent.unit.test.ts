import { describe, expect, it } from 'vitest';

import { resolveDefaultAgent } from '../src/agent/index.ts';
import type { AgentInfo } from '../src/agent/index.ts';

function info(agent: AgentInfo['agent'], installed: boolean): AgentInfo {
  return { agent, installed, path: installed ? `/usr/bin/${agent}` : null, version: null };
}

const ALL_INSTALLED: AgentInfo[] = [
  info('claude', true), info('codex', true),
];
const ONLY_CLAUDE: AgentInfo[] = [
  info('claude', true), info('codex', false),
];
const NONE_INSTALLED: AgentInfo[] = [
  info('claude', false), info('codex', false),
];

describe('resolveDefaultAgent', () => {
  it('keeps the preference when its CLI is installed (codex default unaffected)', () => {
    expect(resolveDefaultAgent('codex', ALL_INSTALLED)).toBe('codex');
    expect(resolveDefaultAgent('claude', ALL_INSTALLED)).toBe('claude');
  });

  it('clamps to the first installed agent when the preference is not installed', () => {
    expect(resolveDefaultAgent('codex', ONLY_CLAUDE)).toBe('claude');
  });

  it('picks the first installed agent (registration order) when no preference is given', () => {
    expect(resolveDefaultAgent('', ONLY_CLAUDE)).toBe('claude');
    expect(resolveDefaultAgent(undefined, ALL_INSTALLED)).toBe('claude');
  });

  it('falls back to a valid preference when nothing is installed', () => {
    expect(resolveDefaultAgent('codex', NONE_INSTALLED)).toBe('codex');
    // claude (not the 'codex' fallback) proves the valid preference is what's honored
    expect(resolveDefaultAgent('claude', NONE_INSTALLED)).toBe('claude');
  });

  it('defaults to codex when neither preference nor installs resolve', () => {
    expect(resolveDefaultAgent('', NONE_INSTALLED)).toBe('codex');
    expect(resolveDefaultAgent('not-an-agent', NONE_INSTALLED)).toBe('codex');
  });

  it('ignores an invalid preference and clamps to an installed agent', () => {
    expect(resolveDefaultAgent('not-an-agent', ONLY_CLAUDE)).toBe('claude');
  });
});
