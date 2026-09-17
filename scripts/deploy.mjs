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
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync, rmSync, symlinkSync, lstatSync, readdirSync, statSync, copyFileSync, openSync, closeSync, cpSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

// This script runs on exactly two known hosts: the original Windows
// laptop and the Linux VPS it was migrated to -- a junction (Windows'
// own directory-symlink type) doesn't exist on Linux, and the two hosts
// use different absolute layouts, so both are picked by OS rather than
// adding a third environment's worth of config for values that never
// change on either host.
const IS_WINDOWS = platform() === "win32";
const REPO_SOURCE = IS_WINDOWS ? "E:/Startup/ai-chat-platform" : "/opt/aiva/repo";
const RELEASES_DIR = IS_WINDOWS ? "E:/Startup/ai-chat-platform-releases" : "/opt/aiva/releases";
const CURRENT_LINK = IS_WINDOWS ? "E:/Startup/ai-chat-platform-current" : "/opt/aiva/current";
const SECRETS_DIR = IS_WINDOWS ? "E:/Startup/ai-chat-platform-secrets" : "/opt/aiva/secrets";
const OPS_DIR = IS_WINDOWS ? "E:/Startup/ai-chat-platform-ops" : "/opt/aiva/ops";
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

// Confirmed live (2026-09-16): a deploy hung right after logging
// "$ pm2 restart ai-chat-web" -- no further line, ever, including the
// "$ pm2 save" that should have followed within milliseconds. Nothing in
// this script had a timeout, so the hung child kept execSync blocked
// forever, which kept deploy() from ever returning, which kept
// releaseLock()'s finally in main() from ever running -- every push for
// the next 3.5 hours was silently skipped as "lock held" until the
// separate LOCK_STALE_MS failsafe finally noticed. A timeout on every
// subprocess call is the actual fix: the lock can now only ever be held
// for DEFAULT_TIMEOUT_MS, not indefinitely.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function run(cmd, cwd, timeoutMs = DEFAULT_TIMEOUT_MS) {
  log(`$ ${cmd}${cwd ? ` (in ${cwd})` : ""}`);
  // CI=true forces pnpm to skip its interactive "remove and reinstall
  // from scratch?" confirmation prompt, confirmed live: a second worktree
  // sharing this repo's pnpm store can trip that prompt (store integrity
  // check across worktree paths), and with no stdin attached (this
  // script runs detached, spawned by the webhook route with
  // stdio:"ignore") pnpm silently declined it and left node_modules
  // partially linked -- some @repo/* workspace symlinks missing, no
  // error surfaced at install time, only a downstream build failure.
  execSync(cmd, { cwd, stdio: "inherit", shell: true, timeout: timeoutMs, env: { ...process.env, CI: "true" } });
}

// Root cause investigation (2026-09-13, four separate deploys, each
// time on a DIFFERENT missing package -- typescript-config/eslint-config
// workspace links twice, then a completely unrelated one,
// @types/nodemailer, twice more): this repo's .npmrc sets
// node-linker=hoisted (deliberately, so `next`'s binary ends up
// root-hoisted the way ecosystem.config.js's script path expects) --
// and pnpm's hoisted linker is known to be nondeterministic about
// fully materializing every hoisted package on a single install pass.
// Giving each release an isolated --store-dir was tried and DID NOT
// help (confirmed live: the store dir was never even created --
// hoisted mode doesn't route through it the way the default linker
// does), so that's gone; switching off node-linker=hoisted entirely
// would fix pnpm's determinism but breaks the next-binary-hoisting
// assumption other parts of this deploy rely on, so that's out of
// scope for this fix.
//
// What DOES reliably fix it, confirmed by hand every single time this
// has come up: a subsequent full "pnpm install --force" pass. So
// unlike the old version, every attempt here always runs (never
// short-circuits the moment the 3 known @repo names happen to look
// fine) -- the last one running catches whatever ELSE hoisting missed
// that a narrower check can't see coming.
const REQUIRED_WORKSPACE_LINKS = ["typescript-config", "eslint-config", "ui"];
const INSTALL_ATTEMPTS = 3;

function workspaceLinksOk(releaseDir) {
  const repoDir = join(releaseDir, "apps", "web", "node_modules", "@repo");
  return REQUIRED_WORKSPACE_LINKS.every((name) => existsSync(join(repoDir, name)));
}

// Last-resort safety net for specifically the @repo/* workspace links
// a build can't even start resolving modules without -- everything
// else hoisting might have missed (like @types/nodemailer) has no
// fixed, predictable location to hand-link, so this can't cover those;
// the unconditional extra install pass above is what actually catches
// those.
function healWorkspaceLinks(releaseDir) {
  const repoDir = join(releaseDir, "apps", "web", "node_modules", "@repo");
  mkdirSync(repoDir, { recursive: true });
  for (const name of REQUIRED_WORKSPACE_LINKS) {
    const linkPath = join(repoDir, name);
    if (existsSync(linkPath)) continue;
    const target = join("..", "..", "..", "..", "packages", name);
    symlinkSync(target, linkPath, IS_WINDOWS ? "junction" : "dir");
    log(`Manually linked missing workspace package: @repo/${name} -> ${target}`);
  }
}

// The install-attempt loop and the build-retry fallback both guard
// against pnpm's hoisted-linker nondeterminism, but confirmed live
// (repeatedly, a DIFFERENT @types/* package incomplete each time --
// nodemailer, then pdfkit, then nodemailer again) that even a build
// retry doesn't always land every hoisted @types package. The
// currently-live release's node_modules is a KNOWN-GOOD, fully-hoisted
// baseline (it's running production right now) -- if that link exists,
// copy across any @types/* entry it has that this fresh release is
// missing, before building. This is exactly the manual step this
// deploy needed by hand every single time this flake showed up.
function healHoistedTypes(releaseDir) {
  if (!existsSync(CURRENT_LINK)) return;
  const goodTypesDir = join(CURRENT_LINK, "node_modules", "@types");
  const newTypesDir = join(releaseDir, "node_modules", "@types");
  if (!existsSync(goodTypesDir)) return;
  mkdirSync(newTypesDir, { recursive: true });
  for (const name of readdirSync(goodTypesDir)) {
    const dest = join(newTypesDir, name);
    if (existsSync(dest)) continue;
    cpSync(join(goodTypesDir, name), dest, { recursive: true, dereference: true });
    log(`Copied missing @types/${name} from the current live release.`);
  }
}

function installWithRetry(releaseDir) {
  for (let attempt = 1; attempt <= INSTALL_ATTEMPTS; attempt++) {
    // pnpm's frozen-lockfile fast path skips re-linking when it thinks
    // node_modules already satisfies the lockfile -- confirmed live, that
    // "already satisfies" check doesn't verify every package actually
    // got hoisted, so a broken first attempt just gets silently repeated
    // as-is on every retry in the same worktree. --force bypasses that
    // fast path and makes the retry actually redo the hoisting.
    run(`pnpm install --frozen-lockfile${attempt > 1 ? " --force" : ""}`, releaseDir);
  }
  if (!workspaceLinksOk(releaseDir)) {
    log(`Workspace symlinks still incomplete after ${INSTALL_ATTEMPTS} install attempts -- creating the missing ones directly.`);
    healWorkspaceLinks(releaseDir);
    if (!workspaceLinksOk(releaseDir)) {
      throw new Error(`apps/web/node_modules/@repo is still missing required links even after manual linking.`);
    }
  }
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
      execFileSync("git", ["worktree", "remove", d.path, "--force"], { cwd: REPO_SOURCE, stdio: "inherit", timeout: DEFAULT_TIMEOUT_MS });
    } catch (err) {
      log(`Warning: couldn't cleanly remove worktree ${d.name}: ${err.message}`);
      rmSync(d.path, { recursive: true, force: true });
    }
  }
  execFileSync("git", ["worktree", "prune"], { cwd: REPO_SOURCE, stdio: "inherit", timeout: DEFAULT_TIMEOUT_MS });
}

// A build failure's own release worktree is guaranteed garbage -- it will
// never be swapped in and pruneOldReleases() never runs for a failed
// deploy (it only runs after a successful one, keyed off the NEW live
// sha). Confirmed live: 43 of these had piled up on disk (11GB) because
// nothing ever cleaned up a failed attempt's own worktree.
function removeReleaseWorktree(releaseDir) {
  try {
    execFileSync("git", ["worktree", "remove", releaseDir, "--force"], { cwd: REPO_SOURCE, stdio: "inherit", timeout: DEFAULT_TIMEOUT_MS });
  } catch (err) {
    log(`Warning: couldn't cleanly remove failed release worktree ${releaseDir}: ${err.message}`);
    rmSync(releaseDir, { recursive: true, force: true });
  }
}

function swapCurrent(releaseDir) {
  if (existsSync(CURRENT_LINK)) {
    // A directory junction's own entry is removed by rmSync without
    // touching the target it points at -- the release folder it used to
    // point to is untouched (only unlinked from this path).
    rmSync(CURRENT_LINK, { recursive: false, force: true });
  }
  symlinkSync(releaseDir, CURRENT_LINK, IS_WINDOWS ? "junction" : undefined);
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
  // REPO_SOURCE's own checked-out files -- including this very script --
  // are never otherwise updated (every release is built in a SEPARATE
  // worktree; "git fetch" only updates the remote-tracking ref, not this
  // working tree). Without this, a fix landed in deploy.mjs itself would
  // silently never take effect: the webhook always re-reads and re-runs
  // deploy.mjs from REPO_SOURCE's own files, not from the new commit
  // being deployed. Fast-forward only -- REPO_SOURCE should never carry
  // local commits of its own.
  run("git merge --ff-only origin/main", REPO_SOURCE);

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
      execFileSync("git", ["worktree", "remove", releaseDir, "--force"], { cwd: REPO_SOURCE, stdio: "inherit", timeout: DEFAULT_TIMEOUT_MS });
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
    execFileSync("git", ["worktree", "prune"], { cwd: REPO_SOURCE, stdio: "inherit", timeout: DEFAULT_TIMEOUT_MS });
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
    healHoistedTypes(releaseDir);
    run("npx prisma generate --schema=packages/database/prisma/schema.prisma", releaseDir);
    try {
      run("pnpm --filter web run build", releaseDir);
    } catch (buildErr) {
      // The install-attempt count and healHoistedTypes above both guard
      // against pnpm's hoisted-linker nondeterminism, but confirmed live
      // that even both together don't always catch it (a DIFFERENT
      // @types/* package incomplete each time). Rather than guess which
      // package name to special-case, react to the actual failure: one
      // more forced reinstall + re-heal, then retry the build once. This
      // is exactly the manual rescue this deploy needed by hand on
      // nearly every run this session.
      log(`Build failed, retrying once after a forced reinstall: ${buildErr.message}`);
      run("pnpm install --frozen-lockfile --force", releaseDir);
      healHoistedTypes(releaseDir);
      run("pnpm --filter web run build", releaseDir);
    }
  } catch (err) {
    log(`BUILD FAILED for ${shortSha} -- live site left untouched on the previous release. ${err.message}`);
    removeReleaseWorktree(releaseDir);
    process.exitCode = 1;
    return;
  }

  writeFileSync(join(releaseDir, ".deployed-sha"), remoteSha);
  swapCurrent(releaseDir);

  // pm2 restart/save should each complete in well under a second -- 60s
  // is generous headroom, not a real expected duration, so a genuine hang
  // here (see DEFAULT_TIMEOUT_MS's comment above) can never hold the lock
  // for more than a minute past everything else in this run.
  const PM2_TIMEOUT_MS = 60 * 1000;
  try {
    run("pm2 restart ai-chat-web", undefined, PM2_TIMEOUT_MS);
  } catch {
    log("pm2 restart failed (process not running yet?) -- trying pm2 start via the ops ecosystem file.");
    run(`pm2 start "${join(OPS_DIR, "ecosystem.config.js")}" --only ai-chat-web`, undefined, PM2_TIMEOUT_MS);
  }
  run("pm2 save", undefined, PM2_TIMEOUT_MS);

  pruneOldReleases(shortSha);
  log(`=== Deploy of ${shortSha} complete ===`);
}

main().catch((err) => {
  log(`Deploy script crashed: ${err.stack ?? err.message}`);
  process.exitCode = 1;
});
