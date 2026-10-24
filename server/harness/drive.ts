// In-sandbox driver: starts the mock model, runs one scenario module against `pi --mode rpc`
// sessions, and writes what it observed to the out dir for the host-side check to judge.
// usage: node drive.ts <scenario.ts>
// env (set by sandbox.ts): HOME, PI_SLICED_PI_CLI, PI_SLICED_HARNESS_OUT, PI_SLICED_SESSION_ENV (JSON)
import { writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startMockModel, type MockModel } from "./mock-model.ts";
import { PiRpc, type UiAnswers } from "./rpc.ts";
import { walk } from "./lib.ts";

const here = dirname(new URL(import.meta.url).pathname);
const stage = resolve(here, "../..");

export interface Harness {
  out: string;
  home: string;
  /** Scenario arguments from the host-side check. */
  args: any;
  /** Host paths that must not be visible here. */
  hidden: string[];
  /** The staged pi-sliced extension entry. */
  ext: string;
  mock: MockModel;
  /** Start a Pi RPC session with an empty-HOME env (env -i equivalent) plus `env`. */
  startPi(opts?: { env?: Record<string, string>; ui?: UiAnswers; ext?: boolean }): PiRpc;
  write(name: string, data: unknown): void;
  walk: typeof walk;
  probe(host: string, port: number, timeoutMs?: number): Promise<string>;
  log(...a: unknown[]): void;
}

const env = process.env;
const out = env.PI_SLICED_HARNESS_OUT!;
const home = env.HOME!;
const cli = env.PI_SLICED_PI_CLI!;
const sessionEnv: Record<string, string> = JSON.parse(env.PI_SLICED_SESSION_ENV ?? "{}");

const mock = await startMockModel(join(out, "requests.jsonl"));
const sessions: PiRpc[] = [];
const h: Harness = {
  out,
  home,
  args: JSON.parse(env.PI_SLICED_SCENARIO_ARGS ?? "{}"),
  hidden: (env.PI_SLICED_HIDDEN ?? "").split(":").filter(Boolean),
  ext: join(stage, "extensions/pi-sliced/index.ts"),
  mock,
  startPi(opts = {}) {
    const argv = [cli, "--mode", "rpc", "--provider", "pi-sliced-mock", "--model", "mock", "--tools", "+codemode"];
    if (opts.ext !== false) argv.push("-e", h.ext);
    argv.push("-e", join(here, "mock-provider.ts"));
    const pi = new PiRpc({
      argv,
      cwd: process.cwd(),
      env: {
        HOME: home,
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        TERM: "dumb",
        PI_SLICED_MOCK_PORT: String(mock.port),
        ...sessionEnv,
        ...opts.env,
      },
      ui: opts.ui,
      stderr: (s) => process.stderr.write(`[pi ${sessions.length}] ${s}`),
    });
    sessions.push(pi);
    return pi;
  },
  write(name, data) {
    writeFileSync(join(out, name), `${JSON.stringify(data, null, 2)}\n`);
  },
  walk,
  probe(host, port, timeoutMs = 5000) {
    return new Promise((res) => {
      const s = connect({ host, port, timeout: timeoutMs });
      s.on("connect", () => {
        s.destroy();
        res("connected");
      });
      s.on("error", (e: NodeJS.ErrnoException) => res(`error:${e.code}`));
      s.on("timeout", () => {
        s.destroy();
        res("timeout");
      });
    });
  },
  log: (...a) => console.error("[drive]", ...a),
};

let code = 0;
try {
  const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
  await mod.default(h);
} catch (e) {
  code = 1;
  console.error("[drive] scenario failed:", e instanceof Error ? e.stack : e);
  h.write("error.json", { error: String(e instanceof Error ? e.stack : e) });
} finally {
  for (const s of sessions) if (s.proc.exitCode === null) s.proc.kill("SIGKILL");
  await mock.close();
}
process.exit(code);
