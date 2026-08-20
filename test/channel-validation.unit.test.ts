import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Feishu validation talks to the Lark SDK client, not global.fetch, so the SDK is the seam
// that has to be faked. tenantAccessTokenResult is what each test hands back to the caller.
let tenantAccessTokenResult: () => any = () => ({ code: 10003, msg: 'invalid app_id' });

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: class {
    auth = {
      tenantAccessToken: {
        internal: async () => tenantAccessTokenResult(),
      },
    };
  },
  Domain: { Lark: 'lark', Feishu: 'feishu' },
  LoggerLevel: { warn: 2 },
}));

const {
  validateFeishuConfig,
  validateTelegramConfig,
  collectChannelSetupStates,
} = await import('../src/core/config/validation.ts');

interface FetchStub {
  url: string;
  response: () => any;
  status?: number;
}

let stubs: FetchStub[] = [];

function setFetchStubs(next: FetchStub[]) {
  stubs = next;
  global.fetch = vi.fn(async (input: any) => {
    const url = String(input);
    const stub = stubs.find(s => url.includes(s.url));
    if (!stub) return new Response(JSON.stringify({}), { status: 404 });
    return new Response(JSON.stringify(stub.response()), { status: stub.status ?? 200 });
  }) as any;
}

beforeEach(() => {
  stubs = [];
  tenantAccessTokenResult = () => ({ code: 10003, msg: 'invalid app_id' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateTelegramConfig', () => {
  it('reports missing when no token is configured', async () => {
    const missing = await validateTelegramConfig('', '');
    expect(missing.state.status).toBe('missing');
    expect(missing.bot).toBeNull();
  });

  it('reports ready and surfaces the bot identity for a token getMe accepts', async () => {
    setFetchStubs([
      { url: 'api.telegram.org', response: () => ({ ok: true, result: { username: 'pikibot', first_name: 'Piki' } }) },
    ]);
    const ready = await validateTelegramConfig('123:abc', '');
    expect(ready.state.status).toBe('ready');
    expect(ready.state.ready).toBe(true);
    expect(ready.bot?.username).toBe('pikibot');
  });

  it('reports invalid when Telegram rejects the token', async () => {
    setFetchStubs([
      { url: 'api.telegram.org', response: () => ({ ok: false, description: 'Unauthorized' }), status: 401 },
    ]);
    const rejected = await validateTelegramConfig('123:bad', '');
    expect(rejected.state.status).toBe('invalid');
    expect(rejected.state.ready).toBe(false);
  });

  it('reports invalid for a malformed allowed-chat-id list and normalizes a valid one', async () => {
    const bad = await validateTelegramConfig('123:abc', 'not-a-number');
    expect(bad.state.status).toBe('invalid');

    setFetchStubs([
      { url: 'api.telegram.org', response: () => ({ ok: true, result: { username: 'pikibot' } }) },
    ]);
    const good = await validateTelegramConfig('123:abc', ' 42 , -100777 ');
    expect(good.state.status).toBe('ready');
    expect(good.normalizedAllowedChatIds).toBe('42,-100777');
  });
});

describe('validateFeishuConfig', () => {
  it('reports missing when neither credential is configured', async () => {
    const missing = await validateFeishuConfig('', '');
    expect(missing.state.status).toBe('missing');
    expect(missing.app).toBeNull();
  });

  it('reports invalid when only one of appId/appSecret is provided', async () => {
    expect((await validateFeishuConfig('cli_app_only', '')).state.status).toBe('invalid');
    expect((await validateFeishuConfig('', 'secret-only')).state.status).toBe('invalid');
  });

  it('reports ready once Feishu issues a tenant access token, naming the bot when reachable', async () => {
    tenantAccessTokenResult = () => ({ code: 0, tenant_access_token: 'tat-1', expire: 7200 });
    setFetchStubs([
      { url: '/open-apis/bot/v3/info', response: () => ({ bot: { app_name: 'Piki Feishu' } }) },
    ]);
    const ready = await validateFeishuConfig('cli_app', 'secret');
    expect(ready.state.status).toBe('ready');
    expect(ready.state.ready).toBe(true);
    expect(ready.app?.displayName).toBe('Piki Feishu');
  });

  it('still reports ready when the bot-info lookup fails (it is best-effort)', async () => {
    tenantAccessTokenResult = () => ({ code: 0, tenant_access_token: 'tat-1', expire: 7200 });
    global.fetch = vi.fn(async () => { throw new Error('bot info down'); }) as any;
    const ready = await validateFeishuConfig('cli_app', 'secret');
    expect(ready.state.status).toBe('ready');
    expect(ready.app?.displayName).toBeNull();
  });

  it('reports invalid when Feishu rejects the credentials', async () => {
    tenantAccessTokenResult = () => ({ code: 10003, msg: 'invalid app_id' });
    const rejected = await validateFeishuConfig('cli_app', 'wrong');
    expect(rejected.state.status).toBe('invalid');
    expect(rejected.state.ready).toBe(false);
    expect(rejected.state.detail).toContain('invalid app_id');
  });
});

describe('collectChannelSetupStates', () => {
  it('covers exactly the two supported channels', async () => {
    const states = await collectChannelSetupStates({});
    expect(states.map(s => s.channel)).toEqual(['telegram', 'feishu']);
    expect(states.every(s => s.status === 'missing')).toBe(true);
  });
});
