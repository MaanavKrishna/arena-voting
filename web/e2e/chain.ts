/**
 * The local chain for the E2E suite, run by Playwright as the first `webServer` (playwright.config.ts).
 *
 * Playwright starts web servers before `globalSetup`, and `next dev` must see the fresh
 * `src/deployments/31337.json` and `src/generated.ts`, so the chain is brought up here, before the
 * app: `anvil --block-time 2` on :8545, then `pnpm deploy:local` (Deploy → Seed → +70 s → SeedVotes)
 * and `pnpm gen`. It prints the ready line Playwright waits for and keeps anvil alive until the
 * process group is stopped at the end of the run (Playwright stops web servers by process group).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const FOUNDRY_BIN = path.join(process.env.HOME ?? "", ".foundry/bin");
const env = { ...process.env, PATH: `${FOUNDRY_BIN}:${process.env.PATH ?? ""}` };

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => {
      s.end();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    throw new Error(`${cmd} ${args.join(" ")} exited with ${r.status}`);
  }
  return r.stdout;
}

async function main() {
  if (await portOpen(8545)) {
    throw new Error("Port 8545 is already in use. Stop the running chain first (the E2E suite needs a fresh one).");
  }

  const anvil: ChildProcess = spawn("anvil", ["--block-time", "2", "--port", "8545", "--silent"], {
    cwd: ROOT,
    env,
    stdio: "ignore",
  });
  const stop = () => {
    anvil.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  anvil.on("exit", (code) => {
    console.error(`anvil exited (${code})`);
    process.exit(1);
  });

  for (let i = 0; i < 100 && !(await portOpen(8545)); i++) await new Promise((r) => setTimeout(r, 100));

  const deployed = run("pnpm", ["deploy:local"]).trim().split("\n").at(-1);
  run("pnpm", ["gen"]);
  console.log(`${deployed}`);
  console.log("Arena E2E chain ready");

  // Keep the process (and anvil) alive until Playwright stops the group.
  setInterval(() => {}, 1 << 30);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
