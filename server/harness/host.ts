// Host-side helpers for the checks: the Author's server over its pinned cert, Traces, verdicts.
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { join } from "node:path";
import type { Catalogue, Detail } from "../../extensions/pi-sliced/types.ts";
import { repo, serverUrl } from "./sandbox.ts";

export const PROOF_NINE = [
  "openai/plugins/debug-zoom-integration",
  "openai/plugins/game-ui-frontend",
  "heygen-com/hyperframes/hyperframes-core",
  "figma/mcp-server-guide/figma-generate-diagram",
  "shopify/shopify-ai-toolkit/shopify",
  "anthropics/skills/canvas-design",
  "nvidia/skills/amc-run-video-calibration",
  "shadcn-ui/ui/shadcn",
  "mattpocock/skills/tdd",
];

/** GET from the Author's server, trusting only the committed cert. */
export function authorGet(path: string, timeoutMs = 30_000): Promise<Buffer> {
  const ca = readFileSync(join(repo, "extensions/pi-sliced/author-server.pem"));
  const url = new URL(path, serverUrl());
  return new Promise((resolve, reject) => {
    const req = request(url, { ca, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        res.statusCode === 200 ? resolve(Buffer.concat(chunks)) : reject(new Error(`GET ${url} → ${res.statusCode}`)),
      );
    });
    req.on("timeout", () => req.destroy(new Error(`GET ${url} timed out`)));
    req.on("error", reject);
    req.end();
  });
}
export const fetchCatalogue = async (name: string): Promise<Catalogue> =>
  JSON.parse((await authorGet(`/v1/catalogues/${name}`)).toString("utf8"));
export const fetchDetail = async (id: string, revision: string): Promise<Detail> =>
  JSON.parse((await authorGet(`/v1/skills/${id}@${revision}`)).toString("utf8"));

export interface TraceFile {
  path: string;
  size: number;
  blob: string;
}
export interface Trace {
  candidate: string;
  revision: string;
  skillPath: string;
  status: string;
  files: TraceFile[];
}
/** The current stored Trace of `id` at `revision`: highest tracer, then highest judge (`trace-<t>+judge-<j>.json`). */
export function traceFor(id: string, revision: string): { file: string; trace: Trace } {
  const dir = join(repo, "traces", id, revision);
  if (!existsSync(dir)) throw new Error(`no Trace of ${id} at ${revision} (${dir})`);
  const names = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort((a, b) => {
      const rank = (n: string) => (/^trace-(\d+)\+judge-(\d+)\.json$/.exec(n) ?? [0, -1, -1]).slice(1).map(Number);
      const [ta, ja] = rank(a);
      const [tb, jb] = rank(b);
      return ta - tb || ja - jb || (a < b ? -1 : a > b ? 1 : 0);
    });
  if (!names.length) throw new Error(`no Trace of ${id} at ${revision}`);
  const file = join(dir, names[names.length - 1]);
  return { file, trace: JSON.parse(readFileSync(file, "utf8")) };
}

/** Collects failures and prints the one-line verdict plus detail. */
export class Verdict {
  fails: string[] = [];
  notes: string[] = [];
  readonly check: string;
  readonly proof: number;
  constructor(check: string, proof: number) {
    this.check = check;
    this.proof = proof;
  }
  fail(msg: string) {
    this.fails.push(msg);
  }
  note(msg: string) {
    this.notes.push(msg);
  }
  ok(cond: unknown, msg: string) {
    if (!cond) this.fail(msg);
    return !!cond;
  }
  abort(summary: string): never {
    this.fail(summary);
    return this.finish('measurement did not complete');
  }
  finish(summary: string): never {
    const pass = this.fails.length === 0;
    for (const n of this.notes) console.log(`  ${n}`);
    for (const f of this.fails) console.log(`  FAIL: ${f}`);
    console.log(`${pass ? "PASS" : "FAIL"} ${this.check} (proof ${this.proof}): ${summary}${pass ? "" : ` — ${this.fails.length} failure(s)`}`);
    process.exit(pass ? 0 : 1);
  }
}

export const outDir = join(repo, "server/harness/out");
export function writeOut(name: string, data: unknown) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), `${JSON.stringify(data, null, 2)}\n`);
}
export const readJson = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined);
