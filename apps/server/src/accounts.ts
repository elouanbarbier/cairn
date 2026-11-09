import { createHash, randomBytes } from 'node:crypto';
import {
  type Account,
  type ApiToken,
  type CreateAccountInput,
  type CreatedToken,
  type CreateTokenInput,
  type LinkInfo,
  SESSION_DAYS,
  type SetupInput,
  type SetupStatus,
  type TokenScope,
  type UpdateAccountInput,
  type UpdateMeInput,
  USER_LINK_DAYS,
  type User,
  type UserLink,
  type UserLinkKind,
} from '@cairn/shared';
import { hash, hashSync, verify } from '@node-rs/argon2';
import { and, asc, eq, isNotNull, isNull, max, ne, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Db } from './db/index.ts';
import * as schema from './db/schema.ts';
import { ConflictError, NotFoundError, ValidationError } from './errors.ts';

/** No valid session or token, or wrong credentials. */
export class UnauthorizedError extends Error {}
/** Signed in, but not allowed (member on an admin route, read-only token writing). */
export class ForbiddenError extends Error {}

const { apiTokens, sessions, settings, userLinks, users } = schema;

const DAY = 86_400_000;
/** Sessions slide: a request refreshes them at most once an hour. */
const SESSION_REFRESH = 3_600_000;
/** `last_used_at` of a token moves at most once a minute. */
const TOKEN_TOUCH = 60_000;
export const TOKEN_PREFIX = 'cairn_';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');

/** argon2id with the library defaults (19 MiB, 2 passes): a fraction of a second on a Raspberry Pi 4. */
export const hashPassword = (password: string) => hash(password);
/** For the demo seed and tests, which run synchronously. */
export const hashPasswordSync = (password: string) => hashSync(password);

/** Compared against when the account does not exist, so a wrong email takes as long as a wrong password. */
let decoyHash: string | null = null;
const decoy = () => {
  decoyHash ??= hashSync(randomToken());
  return decoyHash;
};

type UserRow = typeof users.$inferSelect;
const toUser = (row: UserRow): User => ({ id: row.id, name: row.name, email: row.email, role: row.role });
const iso = (date: Date) => date.toISOString();

export interface Authenticated {
  user: User;
  /** How the request proved who it is. */
  via: { kind: 'session'; sessionId: string } | { kind: 'token'; tokenId: string; scope: TokenScope };
}

export interface AccountsOptions {
  now?: () => Date;
}

/** Accounts, sign-in, sessions, invitation links and API tokens. */
export function createAccounts(db: Db, options: AccountsOptions = {}) {
  const now = options.now ?? (() => new Date());

  function userRow(id: string): UserRow {
    const row = db.select().from(users).where(eq(users.id, id)).get();
    if (!row) throw new NotFoundError('Account not found');
    return row;
  }

  function toAccount(row: UserRow, lastSeen: Date | null): Account {
    return {
      ...toUser(row),
      createdAt: iso(row.createdAt),
      disabled: row.disabledAt !== null,
      hasPassword: row.passwordHash !== null,
      lastSeenAt: lastSeen ? iso(lastSeen) : null,
    };
  }

  function listAccounts(): Account[] {
    const seen = new Map(
      db
        .select({ userId: sessions.userId, at: max(sessions.lastSeenAt) })
        .from(sessions)
        .groupBy(sessions.userId)
        .all()
        .map((r) => [r.userId, r.at] as const),
    );
    return db
      .select()
      .from(users)
      .orderBy(asc(users.createdAt))
      .all()
      .map((row) => toAccount(row, seen.get(row.id) ?? null));
  }

  function account(id: string): Account {
    const lastSeen = db
      .select({ at: max(sessions.lastSeenAt) })
      .from(sessions)
      .where(eq(sessions.userId, id))
      .get();
    return toAccount(userRow(id), lastSeen?.at ?? null);
  }

  /* ---------- First run ---------- */

  function setupStatus(): SetupStatus {
    const demo = db.select().from(settings).where(eq(settings.key, 'demo')).get()?.value === true;
    if (!db.select({ id: users.id }).from(users).get()) return { required: true, mode: 'create', demo };
    const admin = db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNotNull(users.passwordHash), isNull(users.disabledAt)))
      .get();
    return admin ? { required: false, mode: null, demo } : { required: true, mode: 'claim', demo };
  }

  /**
   * `create` makes the first account, admin. `claim` gives a password to the administrator of a workspace from before
   * sign-in existed: the email must be theirs. Either way the person is signed in.
   */
  async function setup(input: SetupInput, userAgent: string | null) {
    const status = setupStatus();
    if (!status.required) throw new ConflictError('The workspace is already set up');
    const passwordHash = await hashPassword(input.password);
    const at = now();
    let userId: string;
    if (status.mode === 'create') {
      if (!input.name) throw new ValidationError('name: required');
      userId = ulid(at.getTime());
      db.insert(users)
        .values({ id: userId, name: input.name, email: input.email, role: 'admin', passwordHash, createdAt: at })
        .run();
    } else {
      const admin = db
        .select()
        .from(users)
        .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
        .orderBy(asc(users.createdAt))
        .get();
      if (!admin || admin.email !== input.email) throw new ValidationError("This is not the administrator's email");
      userId = admin.id;
      db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
    }
    return { user: toUser(userRow(userId)), session: createSession(userId, userAgent) };
  }

  /* ---------- Sign-in and sessions ---------- */

  async function login(email: string, password: string, userAgent: string | null) {
    const row = db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
    if (!row?.passwordHash || row.disabledAt) {
      await verify(decoy(), password).catch(() => false);
      throw new UnauthorizedError('Wrong email or password');
    }
    if (!(await verify(row.passwordHash, password).catch(() => false))) {
      throw new UnauthorizedError('Wrong email or password');
    }
    return { user: toUser(row), session: createSession(row.id, userAgent) };
  }

  /** A new session; returns the token for the cookie (only its hash is stored). */
  function createSession(userId: string, userAgent: string | null) {
    const token = randomToken();
    const at = now();
    db.insert(sessions)
      .values({
        id: sha256(token),
        userId,
        createdAt: at,
        lastSeenAt: at,
        expiresAt: new Date(at.getTime() + SESSION_DAYS * DAY),
        userAgent: userAgent?.slice(0, 300) ?? null,
      })
      .run();
    return { token, maxAge: SESSION_DAYS * 86_400 };
  }

  /** Who the session cookie belongs to; expired sessions and disabled accounts give `null`. */
  function sessionAuth(token: string): Authenticated | null {
    const id = sha256(token);
    const row = db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, id))
      .get();
    const at = now();
    if (!row || row.user.disabledAt) return null;
    if (row.session.expiresAt.getTime() <= at.getTime()) {
      db.delete(sessions).where(eq(sessions.id, id)).run();
      return null;
    }
    if (at.getTime() - row.session.lastSeenAt.getTime() > SESSION_REFRESH) {
      db.update(sessions)
        .set({ lastSeenAt: at, expiresAt: new Date(at.getTime() + SESSION_DAYS * DAY) })
        .where(eq(sessions.id, id))
        .run();
    }
    return { user: toUser(row.user), via: { kind: 'session', sessionId: id } };
  }

  function logout(sessionId: string) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }

  /** Signs out every other browser of this account. */
  function logoutOthers(userId: string, keepSessionId: string | null) {
    db.delete(sessions)
      .where(
        keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId),
      )
      .run();
  }

  /* ---------- Own account ---------- */

  function updateMe(userId: string, input: UpdateMeInput): User {
    if (input.email !== undefined) {
      const other = db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get();
      if (other && other.id !== userId) throw new ConflictError('Another account uses this email');
    }
    const patch = { ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email } : {}) };
    if (Object.keys(patch).length > 0) db.update(users).set(patch).where(eq(users.id, userId)).run();
    return toUser(userRow(userId));
  }

  async function changePassword(userId: string, current: string, next: string, keepSessionId: string | null) {
    const row = userRow(userId);
    if (!row.passwordHash || !(await verify(row.passwordHash, current).catch(() => false))) {
      throw new ValidationError('currentPassword: wrong password');
    }
    db.update(users)
      .set({ passwordHash: await hashPassword(next) })
      .where(eq(users.id, userId))
      .run();
    logoutOthers(userId, keepSessionId);
  }

  /* ---------- Invitation and reset links ---------- */

  /** A new one-time link; any older link of the account stops working. */
  function createLink(userId: string, kind: UserLinkKind): UserLink {
    const token = randomToken();
    const at = now();
    const expiresAt = new Date(at.getTime() + USER_LINK_DAYS * DAY);
    db.transaction((tx) => {
      tx.delete(userLinks).where(eq(userLinks.userId, userId)).run();
      tx.insert(userLinks)
        .values({ id: sha256(token), userId, kind, createdAt: at, expiresAt })
        .run();
    });
    return { kind, path: `/lien/${token}`, expiresAt: iso(expiresAt) };
  }

  function linkRow(token: string) {
    const row = db
      .select({ link: userLinks, user: users })
      .from(userLinks)
      .innerJoin(users, eq(userLinks.userId, users.id))
      .where(eq(userLinks.id, sha256(token)))
      .get();
    if (!row || row.link.expiresAt.getTime() <= now().getTime() || row.user.disabledAt) {
      throw new NotFoundError('This link is no longer valid');
    }
    return row;
  }

  function linkInfo(token: string): LinkInfo {
    const { link, user } = linkRow(token);
    return { kind: link.kind, name: user.name, email: user.email };
  }

  /** Sets the password from a link, which then stops working; a reset also signs out every browser. */
  async function useLink(token: string, password: string, userAgent: string | null) {
    const { link, user } = linkRow(token);
    const passwordHash = await hashPassword(password);
    db.transaction((tx) => {
      tx.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
      tx.delete(userLinks).where(eq(userLinks.userId, user.id)).run();
      if (link.kind === 'reset') tx.delete(sessions).where(eq(sessions.userId, user.id)).run();
    });
    return { user: toUser(userRow(user.id)), session: createSession(user.id, userAgent) };
  }

  /* ---------- Administration ---------- */

  function activeAdmins() {
    return db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
      .all()
      .map((r) => r.id);
  }

  /** A new account without password, and the invitation link to hand over. */
  function createAccount(input: CreateAccountInput): { account: Account; link: UserLink } {
    if (db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()) {
      throw new ConflictError('Another account uses this email');
    }
    const at = now();
    const id = ulid(at.getTime());
    db.insert(users).values({ id, name: input.name, email: input.email, role: input.role, createdAt: at }).run();
    return { account: account(id), link: createLink(id, 'invite') };
  }

  /** Role and access of an account. An admin cannot lock themself out, and one active admin always remains. */
  function updateAccount(actorId: string, id: string, input: UpdateAccountInput): Account {
    const row = userRow(id);
    if (id === actorId && (input.disabled === true || input.role === 'member')) {
      throw new ValidationError('You cannot remove your own access');
    }
    const losesAdmin =
      row.role === 'admin' && row.disabledAt === null && (input.role === 'member' || input.disabled === true);
    if (losesAdmin && activeAdmins().length <= 1) throw new ValidationError('The workspace needs an administrator');
    db.transaction((tx) => {
      const patch: Partial<typeof users.$inferInsert> = {};
      if (input.role !== undefined) patch.role = input.role;
      if (input.disabled !== undefined) patch.disabledAt = input.disabled ? now() : null;
      if (Object.keys(patch).length > 0) tx.update(users).set(patch).where(eq(users.id, id)).run();
      if (input.disabled) {
        tx.delete(sessions).where(eq(sessions.userId, id)).run();
        tx.delete(userLinks).where(eq(userLinks.userId, id)).run();
      }
    });
    return account(id);
  }

  /** An invitation link while the account has no password, a reset link afterwards. */
  function accessLink(id: string): UserLink {
    const row = userRow(id);
    if (row.disabledAt) throw new ValidationError('This account is disabled');
    return createLink(id, row.passwordHash ? 'reset' : 'invite');
  }

  /** For the `cairn reset-password` command: a reset link for an email. */
  function accessLinkFor(email: string): UserLink {
    const row = db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
    if (!row) throw new NotFoundError(`No account uses ${email}`);
    if (row.disabledAt) db.update(users).set({ disabledAt: null }).where(eq(users.id, row.id)).run();
    return createLink(row.id, row.passwordHash ? 'reset' : 'invite');
  }

  /* ---------- API tokens ---------- */

  const toToken = (row: typeof apiTokens.$inferSelect): ApiToken => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    lastUsedAt: row.lastUsedAt ? iso(row.lastUsedAt) : null,
    createdAt: iso(row.createdAt),
  });

  function listTokens(userId: string): ApiToken[] {
    return db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId))
      .orderBy(asc(apiTokens.createdAt))
      .all()
      .map(toToken);
  }

  function createToken(userId: string, input: CreateTokenInput): CreatedToken {
    const secret = `${TOKEN_PREFIX}${randomToken()}`;
    const at = now();
    const id = ulid(at.getTime());
    db.insert(apiTokens)
      .values({
        id,
        userId,
        name: input.name,
        scope: input.scope,
        tokenHash: sha256(secret),
        prefix: secret.slice(0, TOKEN_PREFIX.length + 6),
        createdAt: at,
      })
      .run();
    const row = db.select().from(apiTokens).where(eq(apiTokens.id, id)).get();
    if (!row) throw new NotFoundError('Token not found');
    return { token: toToken(row), secret };
  }

  function revokeToken(userId: string, id: string) {
    const done = db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
      .run();
    if (done.changes === 0) throw new NotFoundError('Token not found');
  }

  /** Who a bearer token belongs to; unknown tokens and disabled accounts give `null`. */
  function tokenAuth(secret: string): Authenticated | null {
    const row = db
      .select({ token: apiTokens, user: users })
      .from(apiTokens)
      .innerJoin(users, eq(apiTokens.userId, users.id))
      .where(eq(apiTokens.tokenHash, sha256(secret)))
      .get();
    if (!row || row.user.disabledAt) return null;
    const at = now();
    if (!row.token.lastUsedAt || at.getTime() - row.token.lastUsedAt.getTime() > TOKEN_TOUCH) {
      db.update(apiTokens).set({ lastUsedAt: at }).where(eq(apiTokens.id, row.token.id)).run();
    }
    return { user: toUser(row.user), via: { kind: 'token', tokenId: row.token.id, scope: row.token.scope } };
  }

  /** Expired sessions and links pile up otherwise; called at startup and with the nightly backup. */
  function purgeExpired() {
    const at = now();
    db.delete(sessions).where(sql`${sessions.expiresAt} <= ${at.getTime()}`).run();
    db.delete(userLinks).where(sql`${userLinks.expiresAt} <= ${at.getTime()}`).run();
  }

  return {
    listAccounts,
    account,
    setupStatus,
    setup,
    login,
    sessionAuth,
    logout,
    logoutOthers,
    updateMe,
    changePassword,
    linkInfo,
    useLink,
    createAccount,
    updateAccount,
    accessLink,
    accessLinkFor,
    listTokens,
    createToken,
    revokeToken,
    tokenAuth,
    purgeExpired,
  };
}

export type Accounts = ReturnType<typeof createAccounts>;
