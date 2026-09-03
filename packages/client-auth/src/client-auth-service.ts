import { randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import { prisma } from "@ai-chat-platform/database";
import { Prisma } from "@prisma/client";

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

// Reversible encryption for the "show password" feature (admin/owner
// only) -- separate from the one-way passwordHash actually used to
// verify logins, which never changes. Key is derived from the same
// secret admin-session.ts already uses for session signing, so this
// needs no new env var.
const ENC_KEY = scryptSync(process.env.ADMIN_SESSION_SECRET ?? "dev-only-admin-secret-change-me", "client-auth-password-reveal", 32);

function encryptPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ciphertext.toString("hex")}`;
}

function decryptPassword(encrypted: string): string | null {
  const [ivHex, tagHex, dataHex] = encrypted.split(":");
  if (!ivHex || !tagHex || !dataHex) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// Thrown by login() when a device/IP check fails -- the route layer
// catches this specifically so the client sees the real reason
// ("locked to another device", "limit reached") instead of the generic
// wrong-username-or-password message.
export class DeviceLimitError extends Error {}

export interface DeviceIpSummary {
  id: string;
  ip: string;
  fixed: boolean;
  blocked: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ClientAccountSummary {
  id: string;
  businessId: string | null;
  businessName: string | null;
  username: string;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  allowedPanels: string[] | null;
  isAdmin: boolean;
  isAgent: boolean;
  online: boolean;
  teamId: string | null;
  role: string | null;
  maxDevices: number | null;
  deviceCount: number;
}

export interface TeamSummary {
  id: string;
  businessId: string;
  name: string;
  parentTeamId: string | null;
  defaultAllowedPanels: string[] | null;
  memberCount: number;
}

export interface LoginResult {
  token: string;
  businessId: string | null;
  isAdmin: boolean;
  isAgent: boolean;
  username: string;
  expiresAt: Date;
}

/** Real credential-gated login, for CLIENT accounts and (optionally, see
 * isAdmin) full-access admin accounts too — the mother dashboard itself
 * stays open to the single fixed admin/admin identity by design
 * (admin-session.ts), this is an ADDITIONAL way to reach that same
 * access level with its own named, disable/delete-able credential.
 * Sessions are DB-backed (not a signed stateless token) specifically so
 * disabling or deleting an account kicks out an already-logged-in
 * session immediately instead of waiting for a token to expire. */
export class ClientAuthService {
  async list(): Promise<ClientAccountSummary[]> {
    const accounts = await prisma.clientAccount.findMany({
      orderBy: { createdAt: "desc" },
    });

    const businessIds = [...new Set(accounts.map((a) => a.businessId).filter((id): id is string => !!id))];
    const businesses = await prisma.business.findMany({
      where: { id: { in: businessIds } },
    });
    const nameById = new Map(businesses.map((b) => [b.id, b.name]));

    const deviceCounts = await prisma.accountDeviceIp.groupBy({
      by: ["clientAccountId"],
      _count: true,
    });
    const deviceCountById = new Map(deviceCounts.map((d) => [d.clientAccountId, d._count]));

    return accounts.map((a) => ({
      id: a.id,
      businessId: a.businessId,
      businessName: a.businessId ? (nameById.get(a.businessId) ?? "(deleted client)") : null,
      username: a.username,
      disabled: a.disabled,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      allowedPanels: (a.allowedPanels as string[] | null) ?? null,
      isAdmin: a.isAdmin,
      isAgent: a.isAgent,
      online: a.online,
      teamId: a.teamId,
      role: a.role,
      maxDevices: a.maxDevices,
      deviceCount: deviceCountById.get(a.id) ?? 0,
    }));
  }

  /** Agents (isAgent) for one business only -- the owner's own Agents
   * panel, and the roster an Agent Console shows teammates. Includes
   * disabled ones so the owner can see and re-enable them; the caller
   * filters if it only wants active agents. */
  async listAgents(businessId: string): Promise<ClientAccountSummary[]> {
    const accounts = await prisma.clientAccount.findMany({
      where: { businessId, isAgent: true },
      orderBy: { createdAt: "asc" },
    });

    return accounts.map((a) => ({
      id: a.id,
      businessId: a.businessId,
      businessName: null,
      username: a.username,
      disabled: a.disabled,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      allowedPanels: null,
      isAdmin: false,
      isAgent: true,
      online: a.online,
      teamId: a.teamId,
      role: a.role,
      maxDevices: a.maxDevices,
      deviceCount: 0,
    }));
  }

  async setOnline(id: string, online: boolean): Promise<void> {
    await prisma.clientAccount.update({ where: { id }, data: { online } });
  }

  async agentLimit(businessId: string): Promise<{ max: number; used: number }> {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { maxAgents: true } });
    const used = await prisma.clientAccount.count({ where: { businessId, isAgent: true } });
    return { max: business?.maxAgents ?? 0, used };
  }

  async setMaxAgents(businessId: string, max: number): Promise<void> {
    await prisma.business.update({ where: { id: businessId }, data: { maxAgents: Math.max(0, Math.trunc(max)) } });
  }

  // --- Teams (org/department/team hierarchy layer, Day 1 AM) ---
  // One primitive for every nesting level: a team with no parentTeamId
  // reads as a top-level "org", a team with a parent reads as a
  // "department"/sub-team under it. See Team's own schema comment for
  // why this isn't three separate models.

  async createTeam(businessId: string, name: string, parentTeamId: string | null = null): Promise<TeamSummary> {
    if (!name.trim()) throw new Error("A team name is required.");
    if (parentTeamId) {
      const parent = await prisma.team.findUnique({ where: { id: parentTeamId } });
      if (!parent || parent.businessId !== businessId) {
        throw new Error("Parent team not found for this business.");
      }
    }
    const row = await prisma.team.create({ data: { businessId, name: name.trim(), parentTeamId } });
    return { id: row.id, businessId: row.businessId, name: row.name, parentTeamId: row.parentTeamId, defaultAllowedPanels: null, memberCount: 0 };
  }

  async listTeams(businessId: string): Promise<TeamSummary[]> {
    const [teams, accounts] = await Promise.all([
      prisma.team.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
      prisma.clientAccount.findMany({ where: { businessId, teamId: { not: null } }, select: { teamId: true } }),
    ]);
    const countByTeam = new Map<string, number>();
    for (const a of accounts) {
      if (a.teamId) countByTeam.set(a.teamId, (countByTeam.get(a.teamId) ?? 0) + 1);
    }
    return teams.map((t) => ({
      id: t.id,
      businessId: t.businessId,
      name: t.name,
      parentTeamId: t.parentTeamId,
      defaultAllowedPanels: (t.defaultAllowedPanels as string[] | null) ?? null,
      memberCount: countByTeam.get(t.id) ?? 0,
    }));
  }

  /** null clears the team's default (falls back to fully open, same as
   * an account with no team and no allowedPanels of its own). Only ever
   * consulted for an account whose OWN allowedPanels is null -- an
   * account's explicit allow-list always wins over its team's default. */
  async setTeamDefaultPanels(teamId: string, panels: string[] | null): Promise<void> {
    await prisma.team.update({ where: { id: teamId }, data: { defaultAllowedPanels: panels ?? Prisma.JsonNull } });
  }

  async deleteTeam(teamId: string): Promise<void> {
    // Members keep their login exactly as-is -- just lose the team's
    // default fallback, same as if they'd never been assigned one.
    await prisma.clientAccount.updateMany({ where: { teamId }, data: { teamId: null } });
    await prisma.team.delete({ where: { id: teamId } });
  }

  async assignAccountToTeam(accountId: string, teamId: string | null): Promise<void> {
    await prisma.clientAccount.update({ where: { id: accountId }, data: { teamId } });
  }

  // --- Role presets ("owner" | "staff") ---
  // Per-business default panel lists, editable any time in Client
  // Access. Deliberately a ONE-TIME copy into a new account's own
  // allowedPanels at creation (see create()'s role param below), not a
  // live link -- editing a preset later never changes an existing
  // account, only what a NEW login created with that role starts with.

  async getRolePreset(businessId: string, role: "owner" | "staff"): Promise<string[] | null> {
    const row = await prisma.rolePreset.findUnique({ where: { businessId_role: { businessId, role } } });
    return (row?.allowedPanels as string[] | null) ?? null;
  }

  async listRolePresets(businessId: string): Promise<{ owner: string[] | null; staff: string[] | null }> {
    const rows = await prisma.rolePreset.findMany({ where: { businessId } });
    const byRole = new Map(rows.map((r) => [r.role, (r.allowedPanels as string[] | null) ?? null]));
    return { owner: byRole.get("owner") ?? null, staff: byRole.get("staff") ?? null };
  }

  async setRolePreset(businessId: string, role: "owner" | "staff", panels: string[] | null): Promise<void> {
    await prisma.rolePreset.upsert({
      where: { businessId_role: { businessId, role } },
      create: { businessId, role, allowedPanels: panels ?? Prisma.JsonNull },
      update: { allowedPanels: panels ?? Prisma.JsonNull },
    });
  }

  /** null clears the restriction (account can see every tab again) --
   * an empty array is a real, deliberate "show nothing" state, kept
   * distinct from null rather than treated the same. Meaningless for an
   * isAdmin account (always sees everything), but harmless to set.
   * Logs the actual before/after panel ids (not just a count) so the
   * activity history can show which panels were actually added/removed
   * -- allPanelIds is needed to expand a null ("every panel") into a
   * concrete list for diffing, since this service doesn't itself know
   * the full panel universe (that list lives in the dashboard UI). */
  async setAllowedPanels(id: string, panels: string[] | null, changedBy: string, allPanelIds: string[]) {
    const current = await prisma.clientAccount.findUnique({ where: { id }, select: { allowedPanels: true } });
    const before = new Set((current?.allowedPanels as string[] | null) ?? allPanelIds);
    const after = new Set(panels ?? allPanelIds);

    await prisma.clientAccount.update({ where: { id }, data: { allowedPanels: panels ?? Prisma.JsonNull } });

    const added = [...after].filter((p) => !before.has(p));
    const removed = [...before].filter((p) => !after.has(p));
    await this.logActivity(id, "panels", JSON.stringify({ added, removed }), changedBy);
  }

  async create(businessId: string | null, username: string, password: string, isAdmin = false, isAgent = false, role: "owner" | "staff" | null = null) {
    const cleanUsername = username.trim();

    if (!isAdmin && !businessId) {
      throw new Error("A client is required for a non-admin login.");
    }
    if (!cleanUsername) {
      throw new Error("A username is required.");
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const existing = await prisma.clientAccount.findUnique({ where: { username: cleanUsername } });
    if (existing) {
      throw new Error(`Username "${cleanUsername}" is already taken.`);
    }

    // Re-checked here (not just in the Agents panel's own UI) so the
    // limit can't be bypassed by a direct API call -- the platform
    // admin's maxAgents is the actual cap, not a client-side suggestion.
    if (isAgent && businessId) {
      const business = await prisma.business.findUnique({ where: { id: businessId }, select: { maxAgents: true } });
      const current = await prisma.clientAccount.count({ where: { businessId, isAgent: true } });
      if (current >= (business?.maxAgents ?? 0)) {
        throw new Error(
          business?.maxAgents
            ? `Agent limit reached (${business.maxAgents}). Ask the platform to raise it.`
            : "Agent accounts aren't enabled for this business yet -- ask the platform to turn it on."
        );
      }
    }

    // A second login for a client that already has one shouldn't start
    // wide open (allowedPanels null = every panel) while their first
    // login is deliberately restricted. A role (owner/staff) picked in
    // the create-login dropdown takes priority -- one-time copy of that
    // business's current preset for the role (see RolePreset's own
    // comment for why this isn't a live link). Falls back to copying
    // the most recently created existing login only when no preset has
    // been set for that role yet, so a business that hasn't touched
    // presets at all keeps the original behavior.
    let allowedPanels: string[] | null = null;
    if (!isAdmin && businessId && role) {
      allowedPanels = await this.getRolePreset(businessId, role);
    }
    if (!isAdmin && businessId && allowedPanels === null) {
      const template = await prisma.clientAccount.findFirst({
        where: { businessId, isAdmin: false },
        orderBy: { createdAt: "desc" },
        select: { allowedPanels: true },
      });
      if (template) allowedPanels = template.allowedPanels as string[] | null;
    }

    return prisma.clientAccount.create({
      data: {
        businessId: isAdmin ? null : businessId,
        username: cleanUsername,
        passwordHash: hashPassword(password),
        passwordEncrypted: encryptPassword(password),
        isAdmin,
        isAgent,
        role: isAdmin ? null : role,
        allowedPanels: allowedPanels ?? undefined,
      },
    });
  }

  /** One append-only trail per account -- who did what and when. Never
   * called with a secret in `detail`; see AccountActivityLog's own
   * schema comment. */
  private async logActivity(clientAccountId: string, action: string, detail: string | null, changedBy: string): Promise<void> {
    await prisma.accountActivityLog.create({ data: { clientAccountId, action, detail, changedBy } });
  }

  /** Resets a login's password -- there's no "view" for an existing one
   * (scrypt is one-way by design, same as every password here), only
   * change-and-log-it. Logs WHO did it and WHEN, never the password
   * value itself, and kicks out any session already using the old
   * password, same reasoning as setDisabled below. */
  async changePassword(id: string, newPassword: string, changedBy: string): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    await prisma.$transaction([
      prisma.clientAccount.update({
        where: { id },
        data: { passwordHash: hashPassword(newPassword), passwordEncrypted: encryptPassword(newPassword) },
      }),
      prisma.clientSession.deleteMany({ where: { clientAccountId: id } }),
    ]);
    await this.logActivity(id, "password", null, changedBy);
  }

  /** Change a login's username -- same uniqueness rule as create(). */
  async changeUsername(id: string, newUsername: string, changedBy: string): Promise<void> {
    const cleanUsername = newUsername.trim();
    if (!cleanUsername) {
      throw new Error("A username is required.");
    }
    const existing = await prisma.clientAccount.findUnique({ where: { username: cleanUsername } });
    if (existing && existing.id !== id) {
      throw new Error(`Username "${cleanUsername}" is already taken.`);
    }
    const before = await prisma.clientAccount.findUnique({ where: { id }, select: { username: true } });
    await prisma.clientAccount.update({ where: { id }, data: { username: cleanUsername } });
    await this.logActivity(id, "username", `${before?.username ?? "?"} -> ${cleanUsername}`, changedBy);
  }

  /** Decrypts and returns the login's current password for a "show
   * password" UI -- null for a login created before passwordEncrypted
   * existed (it backfills the next time its password is changed).
   * Logged so a reveal is auditable the same way a reset is. */
  async revealPassword(id: string, revealedBy: string): Promise<string | null> {
    const account = await prisma.clientAccount.findUnique({ where: { id }, select: { passwordEncrypted: true } });
    if (!account?.passwordEncrypted) return null;
    const plain = decryptPassword(account.passwordEncrypted);
    await this.logActivity(id, "password_revealed", null, revealedBy);
    return plain;
  }

  /** Every logged action on this account -- password resets, panel
   * changes, restrict/re-enable -- newest first. */
  async activityHistory(id: string): Promise<{ action: string; detail: string | null; changedBy: string; changedAt: string }[]> {
    const rows = await prisma.accountActivityLog.findMany({
      where: { clientAccountId: id },
      orderBy: { changedAt: "desc" },
    });
    return rows.map((r) => ({ action: r.action, detail: r.detail, changedBy: r.changedBy, changedAt: r.changedAt.toISOString() }));
  }

  /** Disabling also deletes every active session for the account (cascade
   * isn't enough here since we're not deleting the account row) — without
   * this, a client already signed in would keep working until their
   * session naturally expired. */
  async setDisabled(id: string, disabled: boolean, changedBy: string) {
    await prisma.clientAccount.update({ where: { id }, data: { disabled } });
    if (disabled) {
      await prisma.clientSession.deleteMany({ where: { clientAccountId: id } });
    }
    await this.logActivity(id, disabled ? "disabled" : "enabled", null, changedBy);
  }

  async remove(id: string) {
    await prisma.clientAccount.delete({ where: { id } });
  }

  /** Used by the Agents API to verify a target account actually belongs
   * to the caller's own business before letting them delete/toggle it --
   * never trust a client-supplied businessId, only the caller's own
   * session plus this lookup. */
  async getAccountById(id: string): Promise<{ id: string; businessId: string | null; isAgent: boolean } | null> {
    const account = await prisma.clientAccount.findUnique({ where: { id }, select: { id: true, businessId: true, isAgent: true } });
    return account;
  }

  /** Enforces per-account device/IP limits for owner and staff logins
   * only (never isAdmin/isAgent) -- called from login() before a
   * session is issued. A "fixed" device overrides the count entirely:
   * once set, that's the ONLY ip allowed in, regardless of maxDevices.
   * Otherwise a known, unblocked ip always gets back in; a brand-new ip
   * is admitted only while under the limit (default 2 for "owner", 1
   * for "staff", overridable per-account via maxDevices). Blocked
   * devices don't count against the limit -- blocking one frees a slot. */
  private async checkDevice(accountId: string, ip: string, role: string, maxDevicesOverride: number | null): Promise<void> {
    const rows = await prisma.accountDeviceIp.findMany({ where: { clientAccountId: accountId } });
    const existing = rows.find((r) => r.ip === ip);

    if (existing?.blocked) {
      throw new DeviceLimitError("This device has been blocked from signing in. Ask the platform to unblock it.");
    }

    const fixedRow = rows.find((r) => r.fixed);
    if (fixedRow && fixedRow.ip !== ip) {
      throw new DeviceLimitError("This login is locked to a specific device and can't sign in from anywhere else.");
    }

    if (existing) {
      await prisma.accountDeviceIp.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
      return;
    }

    const activeCount = rows.filter((r) => !r.blocked).length;
    const limit = maxDevicesOverride ?? (role === "owner" ? 2 : 1);
    if (activeCount >= limit) {
      throw new DeviceLimitError(`Device limit reached (${limit} allowed). Ask the platform to reset or raise it.`);
    }

    await prisma.accountDeviceIp.create({ data: { clientAccountId: accountId, ip } });
  }

  async listDevices(accountId: string): Promise<DeviceIpSummary[]> {
    const rows = await prisma.accountDeviceIp.findMany({ where: { clientAccountId: accountId }, orderBy: { lastSeenAt: "desc" } });
    return rows.map((r) => ({
      id: r.id,
      ip: r.ip,
      fixed: r.fixed,
      blocked: r.blocked,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
    }));
  }

  /** Locks the account to exactly this device -- unsets fixed on every
   * other row for the account first, so at most one is ever fixed. */
  async fixDevice(accountId: string, deviceId: string, changedBy: string): Promise<void> {
    await prisma.$transaction([
      prisma.accountDeviceIp.updateMany({ where: { clientAccountId: accountId }, data: { fixed: false } }),
      prisma.accountDeviceIp.update({ where: { id: deviceId }, data: { fixed: true, blocked: false } }),
    ]);
    await this.logActivity(accountId, "device_fixed", deviceId, changedBy);
  }

  async blockDevice(accountId: string, deviceId: string, changedBy: string): Promise<void> {
    await prisma.accountDeviceIp.update({ where: { id: deviceId }, data: { blocked: true, fixed: false } });
    await this.logActivity(accountId, "device_blocked", deviceId, changedBy);
  }

  /** Wipes every known device/IP for the account -- clears any fix and
   * any block, back to a clean slate that re-admits fresh IPs up to
   * the limit again. */
  async resetDeviceLimits(accountId: string, changedBy: string): Promise<void> {
    await prisma.accountDeviceIp.deleteMany({ where: { clientAccountId: accountId } });
    await this.logActivity(accountId, "device_reset", null, changedBy);
  }

  async setMaxDevices(accountId: string, max: number | null, changedBy: string): Promise<void> {
    await prisma.clientAccount.update({ where: { id: accountId }, data: { maxDevices: max } });
    await this.logActivity(accountId, "max_devices", max === null ? "default" : String(max), changedBy);
  }

  async login(username: string, password: string, remember: boolean, ip?: string): Promise<LoginResult | null> {
    const account = await prisma.clientAccount.findUnique({ where: { username: username.trim() } });
    if (!account || account.disabled) return null;
    if (!verifyPassword(password, account.passwordHash)) return null;

    if (ip && !account.isAdmin && !account.isAgent && (account.role === "owner" || account.role === "staff")) {
      await this.checkDevice(account.id, ip, account.role, account.maxDevices);
    }

    const token = randomBytes(32).toString("hex");
    const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS_DEFAULT;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.clientSession.create({ data: { token, clientAccountId: account.id, expiresAt } }),
      prisma.clientAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } }),
    ]);

    return {
      token,
      businessId: account.businessId,
      isAdmin: account.isAdmin,
      isAgent: account.isAgent,
      username: account.username,
      expiresAt,
    };
  }

  async logout(token: string) {
    await prisma.clientSession.deleteMany({ where: { token } });
  }

  /** Used by /api/auth/me — same validity rules as login (not expired,
   * account not disabled) so a disabled client's stale cookie doesn't
   * still read as "logged in" to the UI.
   *
   * allowedPanels resolution: the account's own explicit allow-list
   * always wins when set (unchanged from before Teams existed -- an
   * account with no team behaves EXACTLY as it always did). Only when
   * the account's own allowedPanels is null AND it belongs to a team
   * does the team's defaultAllowedPanels get consulted as a fallback --
   * purely additive, nothing pre-existing changes behavior. */
  async getSession(token: string): Promise<{
    id: string;
    businessId: string | null;
    allowedPanels: string[] | null;
    isAdmin: boolean;
    isAgent: boolean;
    username: string;
    role: string | null;
  } | null> {
    const session = await prisma.clientSession.findUnique({
      where: { token },
      include: { account: true },
    });

    if (!session || session.expiresAt <= new Date() || session.account.disabled) {
      return null;
    }

    let allowedPanels = (session.account.allowedPanels as string[] | null) ?? null;
    if (allowedPanels === null && session.account.teamId) {
      const team = await prisma.team.findUnique({ where: { id: session.account.teamId }, select: { defaultAllowedPanels: true } });
      allowedPanels = (team?.defaultAllowedPanels as string[] | null) ?? null;
    }

    return {
      id: session.account.id,
      businessId: session.account.businessId,
      allowedPanels,
      isAdmin: session.account.isAdmin,
      isAgent: session.account.isAgent,
      username: session.account.username,
      role: session.account.role,
    };
  }
}
