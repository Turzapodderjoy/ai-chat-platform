import os from "node:os";
import fs from "node:fs";

export class HealthController {
  health() {
    return {
      status: "ok",
      timestamp: new Date(),
    };
  }

  /** Raw OS stats for the machine this Next.js process runs on -- read
   * directly via Node's stdlib (os/fs), no external monitoring agent.
   * Only meaningful on the actual production host (the VPS); loadavg
   * is 0 on Windows, so this is written for Linux and used only by the
   * mother dashboard's VPS Health panel. */
  systemStats() {
    const cpus = os.cpus();
    const [loadAvg1, loadAvg5, loadAvg15] = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    let disk: { total: number; free: number; used: number } | null = null;
    try {
      const stat = fs.statfsSync("/");
      const total = stat.blocks * stat.bsize;
      const free = stat.bfree * stat.bsize;
      disk = { total, free, used: total - free };
    } catch {
      // statfsSync can fail on non-Linux hosts -- disk stays null rather
      // than crashing the whole stats response over one field.
    }

    return {
      cpuCount: cpus.length,
      loadAvg1,
      loadAvg5,
      loadAvg15,
      totalMem,
      freeMem,
      usedMem: totalMem - freeMem,
      disk,
      uptimeSeconds: os.uptime(),
    };
  }
}
