#!/usr/bin/env node
// Auto-deploy pipeline for the self-hosted production instance (pm2 on
// this machine, see ecosystem.config.js's own header comment). Triggered
// by /api/webhooks/deploy on push to main (see .github/workflows/deploy.yml),
// or run manually: `node scripts/deploy.mjs`.
//
// Release-folder design: every deploy checks out the new commit into its
// OWN directory (a git worktree, sharing this repo's .git so it's cheap)
// under ai-chat-platform-releases/<sha>, builds it there, and only if the
// build succeeds repoints the ai-chat-platform-current junction at it and
// restarts pm2. A failed build never touches the live site -- the
// junction just keeps pointing at the last good release. The last few
// releases are kept on disk so a rollback (see rollback.mjs) is an
// instant junction repoint, not a rebuild.
//
// This script deliberately runs from the STABLE source checkout
// (E:/Startup/ai-chat-platform, this repo's own working copy) rather than
// from inside a release folder -- a release folder can be pruned or be
// mid-swap while this script is running, the source checkout never is.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync, rmSync, symlinkSync, lstatSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const REPO_SOURCE = "E:/Startup/ai-chat-platform";
const RELEASES_DIR = "E:/Startup/ai-chat-platform-releases";
const CURRENT_LINK = "E:/Startup/ai-chat-platform-current";
const SECRETS_DIR = "E:/Startup/ai-chat-platform-secrets";
const OPS_DIR = "E:/Startup/ai-chat-platform-ops";
const LOG_FILE = join(OPS_DIR, "deploy.log");
const KEEP_RELEASES = 3;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  mkdirSync(OPS_DIR, { recursive: true });
  appendFileSync(LOG_FILE, line + "\n");
}

function run(cmd, cwd) {
  log(`$ ${cmd}${cwd ? ` (in ${cwd})` : ""}`);
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
}

function currentDeployedSha() {
  const marker = join(CURRENT_LINK, ".deployed-sha");
  if (!existsSync(CURRENT_LINK) || !existsSync(marker)) return null;
  return readFileSync(marker, "utf8").trim();
}

function pruneOldReleases(keepSha) {
  if (!existsSync(RELEASES_DIR)) return;
  const dirs = readdirSync(RELEASES_DIR)
    .map((name) => ({ name, path: join(RELEASES_DIR, name), mtime: statSync(join(RELEASES_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const toKeep = new Set(dirs.slice(0, KEEP_RELEASES).map((d) => d.name));
  toKeep.add(keepSha);

  for (const d of dirs) {
    if (toKeep.has(d.name)) continue;
    log(`Pruning old release ${d.name}`);
    try {
      execFileSync("git", ["worktree", "remove", d.path, "--force"], { cwd: REPO_SOURCE, stdio: "inherit" });
    } catch (err) {
      log(`Warning: couldn't cleanly remove worktree ${d.name}: ${err.message}`);
      rmSync(d.path, { recursive: true, force: true });
    }
  }
  execFileSync("git", ["worktree", "prune"], { cwd: REPO_SOURCE, stdio: "inherit" });
}

function swapCurrent(releaseDir) {
  if (existsSync(CURRENT_LINK)) {
    // A directory junction's own entry is removed by rmSync without
    // touching the target it points at -- the release folder it used to
    // point to is untouched (only unlinked from this path).
    rmSync(CURRENT_LINK, { recursive: false, force: true });
  }
  symlinkSync(releaseDir, CURRENT_LINK, "junction");
  log(`ai-chat-platform-current now points at ${releaseDir}`);
}

async function main() {
  log("=== Deploy check starting ===");
  run("git fetch origin main", REPO_SOURCE);

  const remoteSha = execFileSync("git", ["rev-parse", "origin/main"], { cwd: REPO_SOURCE }).toString().trim();
  const deployedSha = currentDeployedSha();

  if (remoteSha === deployedSha) {
    log(`Already up to date at ${remoteSha.slice(0, 8)} -- nothing to do.`);
    return;
  }

  const shortSha = remoteSha.slice(0, 8);
  const releaseDir = join(RELEASES_DIR, shortSha);
  log(`Deploying ${shortSha} (current: ${deployedSha ? deployedSha.slice(0, 8) : "none"})`);

  if (existsSync(releaseDir)) {
    log(`Release dir ${releaseDir} already exists (partial previous attempt?) -- removing and redoing.`);
    try {
      execFileSync("git", ["worktree", "remove", releaseDir, "--force"], { cwd: REPO_SOURCE, stdio: "inherit" });
    } catch {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  }

  mkdirSync(RELEASES_DIR, { recursive: true });
  run(`git worktree add "${releaseDir}" ${remoteSha}`, REPO_SOURCE);

  // Gitignored secrets don't come along with a worktree checkout -- copy
  // the stable, out-of-repo copies in every release.
  mkdirSync(join(releaseDir, "apps", "web"), { recursive: true });
  copyFileSync(join(SECRETS_DIR, "env.local"), join(releaseDir, "apps", "web", ".env.local"));
  if (existsSync(join(SECRETS_DIR, "env.root"))) {
    copyFileSync(join(SECRETS_DIR, "env.root"), join(releaseDir, ".env"));
  }

  try {
    run("pnpm install --frozen-lockfile", releaseDir);
    run("npx prisma generate --schema=packages/database/prisma/schema.prisma", releaseDir);
    run("pnpm --filter web run build", releaseDir);
  } catch (err) {
    log(`BUILD FAILED for ${shortSha} -- live site left untouched on the previous release. ${err.message}`);
    process.exitCode = 1;
    return;
  }

  writeFileSync(join(releaseDir, ".deployed-sha"), remoteSha);
  swapCurrent(releaseDir);

  try {
    run("pm2 restart ai-chat-web");
  } catch {
    log("pm2 restart failed (process not running yet?) -- trying pm2 start via the ops ecosystem file.");
    run(`pm2 start "${join(OPS_DIR, "ecosystem.config.js")}" --only ai-chat-web`);
  }
  run("pm2 save");

  pruneOldReleases(shortSha);
  log(`=== Deploy of ${shortSha} complete ===`);
}

main().catch((err) => {
  log(`Deploy script crashed: ${err.stack ?? err.message}`);
  process.exitCode = 1;
});
