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
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync, rmSync, symlinkSync, lstatSync, readdirSync, statSync, copyFileSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";

const REPO_SOURCE = "E:/Startup/ai-chat-platform";
const RELEASES_DIR = "E:/Startup/ai-chat-platform-releases";
const CURRENT_LINK = "E:/Startup/ai-chat-platform-current";
const SECRETS_DIR = "E:/Startup/ai-chat-platform-secrets";
const OPS_DIR = "E:/Startup/ai-chat-platform-ops";
const LOG_FILE = join(OPS_DIR, "deploy.log");
const LOCK_FILE = join(OPS_DIR, "deploy.lock");
const LOCK_STALE_MS = 15 * 60 * 1000;
const KEEP_RELEASES = 3;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  mkdirSync(OPS_DIR, { recursive: true });
  appendFileSync(LOG_FILE, line + "\n");
}

// Confirmed live: a GitHub Actions webhook deploy and a manually-run
// deploy landed within 3 seconds of each other, and the second one's
// "clean up a stale-looking release dir" step deleted files out from
// under the FIRST one's still-running pnpm install -- both failed, one
// with an EPERM Windows couldn't even explain cleanly. The build-first-
// swap-second design meant the live site was never at risk, but two
// deploys stepping on each other's release folder is still a real bug.
// A single lock file (exclusive create, 'wx') serializes every deploy
// regardless of how it was triggered; LOCK_STALE_MS lets a later run
// recover automatically if a prior one crashed without cleaning up
// instead of blocking every future deploy forever.
function acquireLock() {
  mkdirSync(OPS_DIR, { recursive: true });
  if (existsSync(LOCK_FILE)) {
    const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
    if (age < LOCK_STALE_MS) return false;
    log(`Lock file is ${Math.round(age / 1000)}s old (stale threshold ${LOCK_STALE_MS / 1000}s) -- assuming the previous run died and taking over.`);
    rmSync(LOCK_FILE, { force: true });
  }
  try {
    closeSync(openSync(LOCK_FILE, "wx"));
    return true;
  } catch {
    return false; // lost the race to another process between the check above and this open
  }
}

function releaseLock() {
  rmSync(LOCK_FILE, { force: true });
}

function run(cmd, cwd) {
  log(`$ ${cmd}${cwd ? ` (in ${cwd})` : ""}`);
  // CI=true forces pnpm to skip its interactive "remove and reinstall
  // from scratch?" confirmation prompt, confirmed live: a second worktree
  // sharing this repo's pnpm store can trip that prompt (store integrity
  // check across worktree paths), and with no stdin attached (this
  // script runs detached, spawned by the webhook route with
  // stdio:"ignore") pnpm silently declined it and left node_modules
  // partially linked -- some @repo/* workspace symlinks missing, no
  // error surfaced at install time, only a downstream build failure.
  execSync(cmd, { cwd, stdio: "inherit", shell: true, env: { ...process.env, CI: "true" } });
}

// The workspace packages every build actually needs resolved via
// symlink in apps/web/node_modules/@repo -- confirmed live, THREE
// separate times, that CI=true alone doesn't reliably stop pnpm from
// leaving one or more of these missing after "pnpm install" reports
// success (exit code 0, no error) in a second/third worktree sharing
// this repo's pnpm store. A plain re-run of install reliably fixes it
// when done by hand, so this just automates that instead of leaving it
// as a manual intervention every time.
const REQUIRED_WORKSPACE_LINKS = ["typescript-config", "eslint-config", "ui"];
const INSTALL_ATTEMPTS = 3;

function workspaceLinksOk(releaseDir) {
  const repoDir = join(releaseDir, "apps", "web", "node_modules", "@repo");
  return REQUIRED_WORKSPACE_LINKS.every((name) => existsSync(join(repoDir, name)));
}

function installWithRetry(releaseDir) {
  for (let attempt = 1; attempt <= INSTALL_ATTEMPTS; attempt++) {
    // pnpm's frozen-lockfile fast path skips re-linking when it thinks
    // node_modules already satisfies the lockfile -- confirmed live, that
    // "already satisfies" check doesn't verify each symlink actually
    // exists, so a broken first attempt just gets silently repeated
    // as-is on every retry in the same worktree. --force bypasses that
    // fast path and makes the retry actually re-link from scratch.
    run(`pnpm install --frozen-lockfile${attempt > 1 ? " --force" : ""}`, releaseDir);
    if (workspaceLinksOk(releaseDir)) return;
    log(`Workspace symlinks incomplete after install attempt ${attempt}/${INSTALL_ATTEMPTS} -- retrying.`);
  }
  throw new Error(`apps/web/node_modules/@repo is still missing required links after ${INSTALL_ATTEMPTS} install attempts.`);
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
  if (!acquireLock()) {
    log("Another deploy is already running (lock held) -- skipping this run.");
    return;
  }

  try {
    await deploy();
  } finally {
    releaseLock();
  }
}

async function deploy() {
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
      // git may already have deregistered the worktree even though this
      // threw -- fall through to the unconditional rmSync below either way.
    }
    // Confirmed live: "git worktree remove --force" can deregister the
    // worktree from git's own list while leaving the directory itself on
    // disk (a Windows file-lock on something inside it, e.g. from a
    // build process that hadn't fully released a handle) -- so this
    // can't be conditional on the remove command having thrown. Always
    // verify the directory is actually gone before the next worktree add.
    if (existsSync(releaseDir)) {
      rmSync(releaseDir, { recursive: true, force: true });
    }
    execFileSync("git", ["worktree", "prune"], { cwd: REPO_SOURCE, stdio: "inherit" });
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
    installWithRetry(releaseDir);
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
