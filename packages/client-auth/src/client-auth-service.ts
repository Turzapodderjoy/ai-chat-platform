import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "@ai-chat-platform/database";

const SESSION_DAYS_DEFAULT = 1;
const SESSION_DAYS_REMEMBER = 30;
const MIN_PASSWORD_LENGTH = 8;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export interface ClientAccountSummary {
  id: string;
  businessId: string;
  businessName: string;
  username: string;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginResult {
  token: string;
  businessId: string;
  expiresAt: Date;
}

/** Real credential-gated login for CLIENT accounts only — the mother
 * dashboard itself stays open per the platform's documented no-auth
 * stance (CLAUDE.md); this closes that gap specifically for the per-client
 * dashboards, since those are handed to outside people. Sessions are
 * DB-backed (not a signed stateless token) specifically so disabling or
 * deleting an account kicks out an already-logged-in session immediately
 * instead of waiting for a token to expire. */
export class ClientAuthService {
  async list(): Promise<ClientAccountSummary[]> {
    const accounts = await prisma.clientAccount.findMany({
      orderBy: { createdAt: "desc" },
    });

    const businessIds = [...new Set(accounts.map((a) => a.businessId))];
    const businesses = await prisma.business.findMany({
      where: { id: { in: businessIds } },
    });
    const nameById = new Map(businesses.map((b) => [b.id, b.name]));

    return accounts.map((a) => ({
      id: a.id,
      businessId: a.businessId,
      businessName: nameById.get(a.businessId) ?? "(deleted client)",
      username: a.username,
      disabled: a.disabled,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async create(businessId: string, username: string, password: string) {
    const cleanUsername = username.trim();

    if (!businessId || !cleanUsername) {
      throw new Error("A client and a username are required.");
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const existing = await prisma.clientAccount.findUnique({ where: { username: cleanUsername } });
    if (existing) {
      throw new Error(`Username "${cleanUsername}" is already taken.`);
    }

    return prisma.clientAccount.create({
      data: { businessId, username: cleanUsername, passwordHash: hashPassword(password) },
    });
  }

  /** Disabling also deletes every active session for the account (cascade
   * isn't enough here since we're not deleting the account row) — without
   * this, a client already signed in would keep working until their
   * session naturally expired. */
  async setDisabled(id: string, disabled: boolean) {
    await prisma.clientAccount.update({ where: { id }, data: { disabled } });
    if (disabled) {
      await prisma.clientSession.deleteMany({ where: { clientAccountId: id } });
    }
  }

  async remove(id: string) {
    await prisma.clientAccount.delete({ where: { id } });
  }

  async login(username: string, password: string, remember: boolean): Promise<LoginResult | null> {
    const account = await prisma.clientAccount.findUnique({ where: { username: username.trim() } });
    if (!account || account.disabled) return null;
    if (!verifyPassword(password, account.passwordHash)) return null;

    const token = randomBytes(32).toString("hex");
    const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS_DEFAULT;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.clientSession.create({ data: { token, clientAccountId: account.id, expiresAt } }),
      prisma.clientAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } }),
    ]);

    return { token, businessId: account.businessId, expiresAt };
  }

  async logout(token: string) {
    await prisma.clientSession.deleteMany({ where: { token } });
  }

  /** Used by /api/auth/me — same validity rules as login (not expired,
   * account not disabled) so a disabled client's stale cookie doesn't
   * still read as "logged in" to the UI. */
  async getSession(token: string): Promise<{ businessId: string } | null> {
    const session = await prisma.clientSession.findUnique({
      where: { token },
      include: { account: true },
    });

    if (!session || session.expiresAt <= new Date() || session.account.disabled) {
      return null;
    }

    return { businessId: session.account.businessId };
  }
}
