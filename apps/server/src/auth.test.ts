import type { Account, ApiToken, CreatedToken, LinkInfo, Me, UserLink } from '@cairn/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAccounts } from './accounts.ts';
import { createApi } from './app.ts';
import { openDatabase } from './db/index.ts';
import { createRepo } from './repo.ts';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from './seed/demo.ts';

const NOW = new Date('2026-11-07T19:00:00');
let clock = NOW;
let api: ReturnType<typeof createApi>;

beforeEach(() => {
  clock = NOW;
  const { db } = openDatabase(':memory:');
  seedDemo(db, NOW);
  api = createApi(createRepo(db, { now: () => clock }), createAccounts(db, { now: () => clock }), {
    loginLimit: { max: 3, windowMs: 60_000 },
  });
});

interface Call {
  method?: string;
  body?: unknown;
  cookie?: string;
  token?: string;
  headers?: Record<string, string>;
}

async function call(path: string, { method = 'GET', body, cookie, token, headers = {} }: Call = {}) {
  return api.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Signs in and returns the `name=value` of the session cookie. */
async function login(email: string, password = DEMO_PASSWORD) {
  const res = await call('/auth/login', { method: 'POST', body: { email, password } });
  expect(res.status, `login ${email}`).toBe(200);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

const json = async <T>(res: Response) => (await res.json()) as T;

describe('sign-in and sessions', () => {
  it('refuses wrong credentials the same way, and every private route without a session', async () => {
    for (const body of [
      { email: DEMO_ACCOUNTS[0], password: 'wrong password' },
      { email: 'nobody@example.com', password: DEMO_PASSWORD },
    ]) {
      const res = await call('/auth/login', { method: 'POST', body });
      expect(res.status).toBe(401);
      expect((await json<{ error: { message: string } }>(res)).error.message).toBe('Wrong email or password');
    }
    for (const path of ['/me', '/projects', '/topics/POR-24', '/overview', '/settings']) {
      expect((await call(path)).status, path).toBe(401);
    }
    expect((await call('/health')).status).toBe(200);
    expect((await call('/openapi.json')).status).toBe(200);
  });

  it('signs in with an httpOnly cookie, then signs out', async () => {
    const res = await call('/auth/login', {
      method: 'POST',
      body: { email: ' Elouan@Example.com ', password: DEMO_PASSWORD },
    });
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly.*SameSite=Lax/i);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect((await json<Me>(await call('/me', { cookie }))).user.email).toBe(DEMO_ACCOUNTS[0]);

    expect((await call('/auth/logout', { method: 'POST', cookie })).status).toBe(204);
    expect((await call('/me', { cookie })).status).toBe(401);
  });

  it('limits sign-in attempts per email', async () => {
    for (let i = 0; i < 3; i++) {
      await call('/auth/login', { method: 'POST', body: { email: DEMO_ACCOUNTS[1], password: 'guess' } });
    }
    const blocked = await call('/auth/login', {
      method: 'POST',
      body: { email: DEMO_ACCOUNTS[1], password: DEMO_PASSWORD },
    });
    expect(blocked.status).toBe(429);
    // Other accounts are not affected.
    await login(DEMO_ACCOUNTS[0]);
  });

  it('expires sessions after 30 days without use', async () => {
    const cookie = await login(DEMO_ACCOUNTS[0]);
    clock = new Date(NOW.getTime() + 29 * 86_400_000);
    expect((await call('/me', { cookie })).status).toBe(200);
    // Using it moved the expiry: 29 more days are fine, 31 without use are not.
    clock = new Date(clock.getTime() + 29 * 86_400_000);
    expect((await call('/me', { cookie })).status).toBe(200);
    clock = new Date(clock.getTime() + 31 * 86_400_000);
    expect((await call('/me', { cookie })).status).toBe(401);
  });

  it('refuses browser writes coming from another site', async () => {
    const cookie = await login(DEMO_ACCOUNTS[0]);
    const patch = (headers: Record<string, string>) =>
      call('/topics/POR-24', { method: 'PATCH', body: { priority: 'low' }, cookie, headers });
    expect((await patch({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await patch({ 'sec-fetch-site': 'same-site', origin: 'https://other.cairn.local' })).status).toBe(403);
    // Browsers without Sec-Fetch-Site: the origin must match the host.
    expect((await patch({ origin: 'https://evil.example', host: 'cairn.local' })).status).toBe(403);
    // Behind a proxy that rewrites Host, Sec-Fetch-Site decides.
    expect(
      (await patch({ 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173', host: 'localhost:3000' }))
        .status,
    ).toBe(200);
    expect(
      (await patch({ 'sec-fetch-site': 'same-origin', origin: 'http://cairn.local', host: 'cairn.local' })).status,
    ).toBe(200);
    // Reading stays possible (nothing changes).
    expect((await call('/me', { cookie, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(200);
  });

  it('changes the password and signs out the other browsers', async () => {
    const here = await login(DEMO_ACCOUNTS[0]);
    const elsewhere = await login(DEMO_ACCOUNTS[0]);
    const wrong = await call('/me/password', {
      method: 'POST',
      cookie: here,
      body: { currentPassword: 'nope', newPassword: 'a brand new one' },
    });
    expect(wrong.status).toBe(400);
    const ok = await call('/me/password', {
      method: 'POST',
      cookie: here,
      body: { currentPassword: DEMO_PASSWORD, newPassword: 'a brand new one' },
    });
    expect(ok.status).toBe(204);
    expect((await call('/me', { cookie: here })).status).toBe(200);
    expect((await call('/me', { cookie: elsewhere })).status).toBe(401);
    await login(DEMO_ACCOUNTS[0], 'a brand new one');
  });
});

describe('administration', () => {
  it('keeps account management to administrators', async () => {
    const member = await login(DEMO_ACCOUNTS[1]);
    expect((await call('/accounts', { cookie: member })).status).toBe(403);
    expect((await call('/settings', { method: 'PATCH', cookie: member, body: { dormancyDays: 3 } })).status).toBe(403);
    const labels = (await json<Array<{ id: string }>>(await call('/labels', { cookie: member }))) ?? [];
    expect((await call(`/labels/${labels[0]?.id}`, { method: 'DELETE', cookie: member })).status).toBe(403);
    // Members still work on topics.
    expect((await call('/topics/POR-24', { method: 'PATCH', cookie: member, body: { priority: 'low' } })).status).toBe(
      200,
    );
  });

  it('invites a member through a one-time link', async () => {
    const admin = await login(DEMO_ACCOUNTS[0]);
    const created = await call('/accounts', {
      method: 'POST',
      cookie: admin,
      body: { name: 'Ada Lovelace', email: 'ADA@example.com' },
    });
    expect(created.status).toBe(201);
    const { account, link } = await json<{ account: Account; link: UserLink }>(created);
    expect(account).toMatchObject({ email: 'ada@example.com', role: 'member', hasPassword: false, disabled: false });
    expect(link.kind).toBe('invite');
    const token = link.path.split('/').at(-1) ?? '';

    expect(await json<LinkInfo>(await call(`/auth/links/${token}`))).toEqual({
      kind: 'invite',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect((await call(`/auth/links/${token}`, { method: 'POST', body: { password: 'short' } })).status).toBe(400);
    const joined = await call(`/auth/links/${token}`, { method: 'POST', body: { password: 'analytical engine' } });
    expect(joined.status).toBe(200);
    const ada = (joined.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect((await json<Me>(await call('/me', { cookie: ada }))).user.role).toBe('member');
    // Used once: gone.
    expect((await call(`/auth/links/${token}`)).status).toBe(404);
    await call('/accounts', { method: 'POST', cookie: admin, body: { name: 'Ada', email: 'ada@example.com' } }).then(
      (res) => expect(res.status).toBe(409),
    );
  });

  it('resets a password with a link that signs every browser out, and disables accounts', async () => {
    const admin = await login(DEMO_ACCOUNTS[0]);
    const member = await login(DEMO_ACCOUNTS[1]);
    const accounts = await json<Account[]>(await call('/accounts', { cookie: admin }));
    const camille = accounts.find((a) => a.email === DEMO_ACCOUNTS[1]);
    expect(camille?.lastSeenAt).not.toBeNull();

    const link = await json<UserLink>(await call(`/accounts/${camille?.id}/link`, { method: 'POST', cookie: admin }));
    expect(link.kind).toBe('reset');
    const token = link.path.split('/').at(-1) ?? '';
    await call(`/auth/links/${token}`, { method: 'POST', body: { password: 'fresh password' } });
    expect((await call('/me', { cookie: member })).status).toBe(401);

    const again = await login(DEMO_ACCOUNTS[1], 'fresh password');
    const disabled = await call(`/accounts/${camille?.id}`, {
      method: 'PATCH',
      cookie: admin,
      body: { disabled: true },
    });
    expect((await json<Account>(disabled)).disabled).toBe(true);
    expect((await call('/me', { cookie: again })).status).toBe(401);
    const res = await call('/auth/login', {
      method: 'POST',
      body: { email: DEMO_ACCOUNTS[1], password: 'fresh password' },
    });
    expect(res.status).toBe(401);
    // A disabled account leaves the assignee list but keeps its history.
    expect((await json<Array<{ email: string }>>(await call('/users', { cookie: admin }))).map((u) => u.email)).toEqual(
      [DEMO_ACCOUNTS[0]],
    );
  });

  it('never leaves the workspace without an administrator', async () => {
    const admin = await login(DEMO_ACCOUNTS[0]);
    const me = (await json<Me>(await call('/me', { cookie: admin }))).user;
    const self = (body: unknown) => call(`/accounts/${me.id}`, { method: 'PATCH', cookie: admin, body });
    expect((await self({ disabled: true })).status).toBe(400);
    expect((await self({ role: 'member' })).status).toBe(400);
  });
});

describe('API tokens', () => {
  async function token(scope: 'read' | 'write') {
    const admin = await login(DEMO_ACCOUNTS[0]);
    const res = await call('/tokens', { method: 'POST', cookie: admin, body: { name: `Script ${scope}`, scope } });
    expect(res.status).toBe(201);
    return { admin, created: await json<CreatedToken>(res) };
  }

  it('reads with a read-only token, and refuses its writes', async () => {
    const { created } = await token('read');
    expect(created.secret).toMatch(/^cairn_/);
    expect(created.token.prefix).toBe(created.secret.slice(0, 12));
    expect((await call('/topics/POR-24', { token: created.secret })).status).toBe(200);
    const write = await call('/topics/POR-24', { method: 'PATCH', token: created.secret, body: { priority: 'low' } });
    expect(write.status).toBe(403);
  });

  it('writes with a read-write token, in the name of its owner, and stops once revoked', async () => {
    const { admin, created } = await token('write');
    const res = await call('/topics/POR-24', { method: 'PATCH', token: created.secret, body: { priority: 'low' } });
    expect(res.status).toBe(200);
    const detail = await json<{ activity: Array<{ actor: { email: string } | null }> }>(res);
    expect(detail.activity[0]?.actor?.email).toBe(DEMO_ACCOUNTS[0]);

    const list = await json<ApiToken[]>(await call('/tokens', { cookie: admin }));
    expect(list[0]?.lastUsedAt).not.toBeNull();
    expect(JSON.stringify(list)).not.toContain(created.secret);

    // Tokens cannot manage tokens or accounts: only a signed-in browser can.
    expect((await call('/tokens', { token: created.secret })).status).toBe(403);
    expect((await call('/accounts', { token: created.secret })).status).toBe(403);

    expect((await call(`/tokens/${created.token.id}`, { method: 'DELETE', cookie: admin })).status).toBe(204);
    expect((await call('/topics/POR-24', { token: created.secret })).status).toBe(401);
  });
});
