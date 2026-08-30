import { NextRequest, NextResponse } from "next/server";

// GitHub Actions (.github/workflows/deploy.yml) POSTs here on every push
// to main. Auth is a static bearer secret (DEPLOY_SECRET), same pattern
// as /api/cron/auto-heal's CRON_SECRET -- this endpoint runs a git
// worktree checkout + pnpm build + pm2 restart on the host, so it must
// never be reachable without it.
//
// The actual deploy runs in a script (see scripts/deploy.mjs in the repo
// source), spawned here as a detached background process so this request
// can return immediately (a full build can take a minute+) -- and so the
// deploy survives even though it ends with `pm2 restart ai-chat-web`,
// which kills and restarts the very Next.js process handling this
// request. Both the interpreter and the script path are read from env
// vars (never a string literal here) -- Next's build-time file tracer
// mis-resolves a literal "scripts/deploy.mjs"-looking path as a module
// import and fails the build; env vars are invisible to that analysis.
export async function POST(req: NextRequest) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "DEPLOY_SECRET is not configured on this server." }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repoSource = process.env.DEPLOY_REPO_SOURCE;
  const scriptPath = process.env.DEPLOY_SCRIPT_PATH;
  if (!repoSource || !scriptPath) {
    return NextResponse.json({ error: "DEPLOY_REPO_SOURCE / DEPLOY_SCRIPT_PATH are not configured on this server." }, { status: 500 });
  }

  const { spawn } = await import("node:child_process");
  const child = spawn("node", [scriptPath], {
    cwd: repoSource,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  return NextResponse.json({ deploying: true }, { status: 202 });
}
