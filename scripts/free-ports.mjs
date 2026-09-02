// Kills whatever is currently listening on the dev ports so `npm run dev` never
// fails with EADDRINUSE. Runs as part of `predev`. Docker never runs this.
//
//   node scripts/free-ports.mjs [port...]      (defaults: 3000 5000)
//
import { execFileSync } from "node:child_process";

const ports = (process.argv.slice(2).length ? process.argv.slice(2) : ["3000", "5000"]).map(Number);
const isWin = process.platform === "win32";

/** PIDs currently LISTENING on `port`. */
function listenerPids(port) {
  try {
    if (isWin) {
      const out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        // e.g.  "  TCP    0.0.0.0:5000   0.0.0.0:0   LISTENING   1234"
        //  or   "  TCP    [::1]:3000     [::]:0      LISTENING   1234"
        const m = line.match(/^\s*TCP\s+.*?:(\d+)\s+\S+\s+LISTENING\s+(\d+)\b/i);
        if (m && Number(m[1]) === port && m[2] !== "0") pids.add(m[2]);
      }
      return [...pids];
    }
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
    });
    return out.split(/\s+/).filter(Boolean);
  } catch {
    return []; // nothing listening (or the tool isn't available)
  }
}

function kill(pid) {
  try {
    if (isWin) execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
    else process.kill(Number(pid), "SIGKILL");
    return true;
  } catch {
    return false;
  }
}

for (const port of ports) {
  const pids = listenerPids(port);
  if (!pids.length) {
    console.log(`porta ${port}: livre`);
    continue;
  }
  for (const pid of pids) {
    console.log(`porta ${port}: encerrando PID ${pid}${kill(pid) ? "" : " (falhou)"}`);
  }
}
