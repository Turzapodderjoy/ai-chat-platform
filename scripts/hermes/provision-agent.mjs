#!/usr/bin/env node
// Provision a Hermes agent profile for a business.
//
//   node scripts/hermes/provision-agent.mjs phonerepairzoneaz-mudxbbg0 [--force]
//
// Does, in order:
//   1. Looks up the business by id or slug, and derives a Hermes profile slug
//      (dash/underscores -> nothing, lowercased, e.g. <biz-slug>-<id-tail>).
//   2. Creates the profile under HERMES_HOME/profiles/<slug> by cloning the
//      default profile (so the free-tier Nous identity is inherited), writing
//      a fresh per-tenant API_SERVER_KEY into its .env.
//   3. Sets Business.hermesProfile to the slug. It does NOT flip
//      hermesEnabled — that cutover is an explicit operator decision (the
//      admin panel / a later manual step), so chat never silently moves to
//      Hermes until you say so.
//   4. Prints the gateway restart hint + how to complete the cutover.

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HERMES_HOME = process.env.HERMES_HOME || path.join(REPO_ROOT, "data", "hermes");
const BIN = existsSync(path.join(REPO_ROOT, "vendor/hermes-agent/.venv/bin/hermes"))
  ? path.join(REPO_ROOT, "vendor/hermes-agent/.venv/bin/hermes")
  : "hermes";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/hermes/provision-agent.mjs <businessId|slug> [--force]");
  process.exit(1);
}
const force = process.argv.includes("--force");

const prisma = new PrismaClient();

function deriveProfileSlug(slug, id) {
  const tail = id.slice(-7);
  return `${slug.replace(/[^a-z0-9-]+/g, "")}-${tail}`.replace(/-+/g, "-").replace(/-$/, "");
}

function freshKey() {
  return execFileSync("openssl", ["rand", "-hex", "32"]).toString().trim();
}

async function main() {
  const business = await prisma.business.findFirst({
    where: { OR: [{ id: arg }, { slug: arg }] },
    select: { id: true, name: true, slug: true, hermesProfile: true, hermesEnabled: true },
  });
  if (!business) {
    console.error(`No business found for '${arg}'`);
    process.exit(1);
  }

  const profileSlug = business.hermesProfile || deriveProfileSlug(business.slug, business.id);
  const profileDir = path.join(HERMES_HOME, "profiles", profileSlug);
  const envPath = path.join(profileDir, ".env");

  if (business.hermesProfile) {
    console.log(`Business already provisioned -> profile '${business.hermesProfile}' (enabled=${business.hermesEnabled}).`);
    if (!force) process.exit(0);
    console.log("--force: re-affirming provision.");
  }

  if (!existsSync(path.join(profileDir, "SOUL.md"))) {
    console.log(`Creating profile '${profileSlug}' (cloning default, inheriting free-tier identity)…`);
    execFileSync(BIN, ["profile", "create", profileSlug, "--clone", "--no-alias"], {
      stdio: "inherit",
      env: { ...process.env, HERMES_HOME },
    });
  } else {
    console.log(`Profile '${profileSlug}' already exists on disk.`);
  }

  // Per-tenant API key: fresh unless one is already set for this profile.
  let key = "";
  try {
    const raw = require("node:fs").readFileSync(envPath, "utf8");
    key = (raw.match(/^API_SERVER_KEY\s*=\s*(.+)$/m) || [])[1]?.trim() ?? "";
  } catch {}
  if (!key) {
    key = freshKey();
    writeFileSync(envPath, `API_SERVER_ENABLED=true\nAPI_SERVER_KEY=${key}\nAPI_SERVER_PORT=8642\nAPI_SERVER_HOST=127.0.0.1\n`);
    console.log(`Wrote per-tenant API key to ${envPath}`);
  } else {
    console.log(`Per-tenant API key already present in ${envPath} — leaving it.`);
  }

  await prisma.business.update({
    where: { id: business.id },
    data: { hermesProfile: profileSlug },
  });

  await prisma.$disconnect();

  console.log(`
Provisioned: ${business.name}
  profile : ${profileSlug}  (HERMES_HOME/profiles/${profileSlug})
  model   : served at /p/${profileSlug}/v1/chat/completions
  db      : Business.hermesProfile set (chat NOT cut over yet — hermesEnabled is false)

Next:
  1. Restart the gateway so the multiplexer serves the new profile:
       pkill -f gateway/platforms\\/api_server ; node scripts/hermes/serve-dev.mjs
     (safe to skip on the live PM2 gateway — it hot-admits ~30s)
  2. Point the profile's SOUL.md at the business's brand/KB facts.
  3. Flip Business.hermesEnabled=true (admin panel toggle) to route widget chat
     through Hermes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});