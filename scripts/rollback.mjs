#!/usr/bin/env node
// Instant rollback -- repoints ai-chat-platform-current at a previously
// built release (see deploy.mjs's own header for the release-folder
// design) and restarts pm2. No rebuild, seconds not minutes.
//
// Usage:
//   node scripts/rollback.mjs            -- lists available releases
//   node scripts/rollback.mjs <shortSha> -- rolls back to that release

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, statSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RELEASES_DIR = "E:/Startup/ai-chat-platform-releases";
const CURRENT_LINK = "E:/Startup/ai-chat-platform-current";

function listReleases() {
  if (!existsSync(RELEASES_DIR)) return [];
  return readdirSync(RELEASES_DIR)
    .map((name) => ({ name, path: join(RELEASES_DIR, name), mtime: statSync(join(RELEASES_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

const target = process.argv[2];
const releases = listReleases();

if (!target) {
  const currentSha = existsSync(join(CURRENT_LINK, ".deployed-sha"))
    ? readFileSync(join(CURRENT_LINK, ".deployed-sha"), "utf8").trim().slice(0, 8)
    : null;
  console.log("Available releases (newest first):");
  for (const r of releases) {
    console.log(`  ${r.name}${r.name === currentSha ? "  <- currently live" : ""}`);
  }
  console.log("\nRun: node scripts/rollback.mjs <shortSha>");
  process.exit(0);
}

const releaseDir = join(RELEASES_DIR, target);
if (!existsSync(releaseDir)) {
  console.error(`No release folder for "${target}". Run with no argument to list what's available.`);
  process.exit(1);
}

if (existsSync(CURRENT_LINK)) {
  rmSync(CURRENT_LINK, { recursive: false, force: true });
}
symlinkSync(releaseDir, CURRENT_LINK, "junction");
console.log(`ai-chat-platform-current now points at ${releaseDir}`);

execSync("pm2 restart ai-chat-web", { stdio: "inherit" });
execSync("pm2 save", { stdio: "inherit" });
console.log(`Rolled back to ${target}.`);
