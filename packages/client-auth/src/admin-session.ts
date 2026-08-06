import { createHmac, timingSafeEqual } from "node:crypto";

// A single hardcoded admin identity, not a table — the mother dashboard
// only ever needs one operator account, so a real AdminAccount model
// (with all the CRUD ClientAccount needed) would be pure ceremony here.
// Override via env in any real deployment; these defaults exist so the
// login the client asked for ("admin" / "admin") works out of the box.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin";
const SECRET = process.env.ADMIN_SESSION_SECRET ?? "dev-only-admin-secret-change-me";

export function checkAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

/** Stateless signed token (not DB-backed like ClientSession) — there's
 * nothing to invalidate early for a single fixed admin account, so a
 * database round-trip on every request would buy nothing. */
export function createAdminToken(days: number): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const payload = `admin.${expiresAt.getTime()}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return { token: `${payload}.${sig}`, expiresAt };
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [kind, expStr, sig] = parts;
  if (kind !== "admin" || !expStr || !sig) return false;

  const expected = createHmac("sha256", SECRET).update(`${kind}.${expStr}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const exp = Number(expStr);
  return Number.isFinite(exp) && exp > Date.now();
}
