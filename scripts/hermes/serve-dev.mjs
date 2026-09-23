#!/usr/bin/env node
// Start (or verify) the local Hermes agent gateway for development.
//
//   node scripts/hermes/serve-dev.mjs
//
// Spawns `hermes gateway run` detached with HERMES_HOME pointed at
// <repo>/data/hermes and the free-tier launch gate enabled, then returns.
// The gateway keeps running after this script exits. On production this
// role is filled by PM2 (`hermes gateway run` under /opt/aiva) — this
// script is for local/CI only.

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HERMES_HOME = process.env.HERMES_HOME || path.join(REPO_ROOT, "data", "hermes");
const BIN = existsSync(path.join(REPO_ROOT, "vendor/hermes-agent/.venv/bin/hermes"))
  ? path.join(REPO_ROOT, "vendor/hermes-agent/.venv/bin/hermes")
  : "hermes";
const PORT = process.env.HERMES_PORT || "8642";
const LOG = process.env.HERMES_LOG || path.join(HERMES_HOME, "gateway.log");

function gatewayUp() {
  try {
    execFileSync("bash", ["-lc", `exec 3<>/dev/tcp/127.0.0.1/${PORT} && echo up`], {
      timeout: 3000,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(HERMES_HOME)) {
  console.error(`HERMES_HOME does not exist: ${HERMES_HOME}\nRun: HERMES_HOME=${HERMES_HOME} ${BIN} doctor`);
  process.exit(1);
}

if (gatewayUp()) {
  console.log(`Hermes gateway already listening on 127.0.0.1:${PORT} — nothing to do.`);
  process.exit(0);
}

spawn("setsid", [
  "bash",
  "-c",
  [
    `export HERMES_HOME="${HERMES_HOME}"`,
    // Free-tier Nous guest onboarding gate (process env only — not honored from .env).
    "export HERMES_GUEST_ONBOARDING=1",
    `exec "${BIN}" gateway run`,
  ].join("; "),
], {
  detached: true,
  stdio: ["ignore", "ignore", "ignore"],
}).unref();

console.log(`Hermes gateway starting in background (log: ${LOG})…`);
setTimeout(() => {
  if (gatewayUp()) {
    console.log(`Hermes gateway is up on 127.0.0.1:${PORT}.`);
  } else {
    console.error(`Gateway did not come up within 5s — check ${LOG}`);
    process.exit(1);
  }
}, 5000);