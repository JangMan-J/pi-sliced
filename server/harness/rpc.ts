// Minimal Pi RPC client (docs/rpc.md): strict LF framing, id-correlated responses,
// event collection, and automatic answers to extension UI dialogs.
import { type ChildProcess, spawn } from "node:child_process";

export type Rec = Record<string, any>;

export interface UiAnswers {
  /** Answer to `confirm` dialogs; default true (the user accepts). */
  confirm?: (req: Rec) => boolean;
  select?: (req: Rec) => string | undefined;
  input?: (req: Rec) => string | undefined;
}

export interface PiOptions {
  /** argv after `node`: the Pi CLI and its options. */
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  ui?: UiAnswers;
  /** Called for every stderr chunk. */
  stderr?: (s: string) => void;
}

export class PiRpc {
  readonly proc: ChildProcess;
  /** Every record Pi wrote to stdout, in order. */
  readonly records: Rec[] = [];
  private buf = "";
  private seq = 0;
  private waiters = new Map<string, (r: Rec) => void>();
  private listeners = new Set<(r: Rec) => void>();
  readonly exited: Promise<number | null>;
  stderrText = "";
  private opts: PiOptions;

  constructor(opts: PiOptions) {
    this.opts = opts;
    this.proc = spawn(process.execPath, opts.argv, { cwd: opts.cwd, env: opts.env, stdio: ["pipe", "pipe", "pipe"] });
    this.exited = new Promise((resolve) => this.proc.on("exit", (code) => resolve(code)));
    this.proc.stdout!.on("data", (c: Buffer) => this.onData(c.toString("utf8")));
    this.proc.stderr!.on("data", (c: Buffer) => {
      const s = c.toString("utf8");
      this.stderrText += s;
      opts.stderr?.(s);
    });
  }

  private onData(s: string) {
    this.buf += s;
    for (;;) {
      const i = this.buf.indexOf("\n");
      if (i < 0) break;
      let line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      let rec: Rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      this.records.push(rec);
      if (rec.type === "response" && rec.id && this.waiters.has(rec.id)) {
        this.waiters.get(rec.id)!(rec);
        this.waiters.delete(rec.id);
      }
      if (rec.type === "extension_ui_request") this.answerUi(rec);
      for (const l of this.listeners) l(rec);
    }
  }

  private answerUi(req: Rec) {
    const ui = this.opts.ui ?? {};
    const reply = (v: Rec) => this.write({ type: "extension_ui_response", id: req.id, ...v });
    switch (req.method) {
      case "confirm":
        reply({ confirmed: ui.confirm ? ui.confirm(req) : true });
        break;
      case "select": {
        const v = ui.select?.(req);
        reply(v === undefined ? { cancelled: true } : { value: v });
        break;
      }
      case "input":
      case "editor": {
        const v = ui.input?.(req);
        reply(v === undefined ? { cancelled: true } : { value: v });
        break;
      }
    }
  }

  write(rec: Rec) {
    this.proc.stdin!.write(`${JSON.stringify(rec)}\n`);
  }

  /** Send one command and wait for its response. */
  request(cmd: Rec, timeoutMs = 120_000): Promise<Rec> {
    const id = `h${++this.seq}`;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`rpc ${cmd.type} timed out\n${this.stderrText.slice(-2000)}`)), timeoutMs);
      this.waiters.set(id, (r) => {
        clearTimeout(t);
        resolve(r);
      });
      this.exited.then((code) => reject(new Error(`pi exited (${code}) during ${cmd.type}\n${this.stderrText.slice(-2000)}`)));
      this.write({ ...cmd, id });
    });
  }

  /** Records from `from` until `pred` matches one (inclusive). */
  waitFor(pred: (r: Rec) => boolean, from: number, timeoutMs = 120_000): Promise<Rec[]> {
    return new Promise((resolve, reject) => {
      const done = () => {
        this.listeners.delete(check);
        clearTimeout(t);
      };
      const check = () => {
        const i = this.records.findIndex((r, k) => k >= from && pred(r));
        if (i >= 0) {
          done();
          resolve(this.records.slice(from, i + 1));
        }
      };
      const t = setTimeout(() => {
        done();
        reject(new Error(`rpc wait timed out\n${this.stderrText.slice(-2000)}`));
      }, timeoutMs);
      this.listeners.add(check);
      check();
    });
  }

  /**
   * Submit `message` as a prompt. Extension commands resolve on their response
   * ("handled"); model runs resolve on `agent_settled`. Returns every record of the exchange.
   */
  async prompt(message: string, timeoutMs = 300_000): Promise<{ disposition: string; records: Rec[] }> {
    const from = this.records.length;
    const res = await this.request({ type: "prompt", message }, timeoutMs);
    if (!res.success) throw new Error(`prompt rejected: ${res.error}`);
    const disposition = res.data?.disposition;
    if (disposition === "started") await this.waitFor((r) => r.type === "agent_settled", from, timeoutMs);
    return { disposition, records: this.records.slice(from) };
  }

  /** Close stdin (orderly shutdown, runs session_shutdown) and wait for exit. */
  async close(timeoutMs = 60_000): Promise<number | null> {
    this.proc.stdin!.end();
    const t = setTimeout(() => this.proc.kill("SIGKILL"), timeoutMs);
    const code = await this.exited;
    clearTimeout(t);
    return code;
  }
}

/** Notify messages among records. */
export const notifies = (records: Rec[]) =>
  records.filter((r) => r.type === "extension_ui_request" && r.method === "notify").map((r) => String(r.message ?? ""));

/** Tool results (by tool call id order) among records. */
export function toolResults(records: Rec[]): Array<{ toolName: string; isError: boolean; text: string; args: Rec }> {
  const out: Array<{ toolName: string; isError: boolean; text: string; args: Rec }> = [];
  const args = new Map<string, Rec>();
  for (const r of records) {
    if (r.type === "tool_execution_start") args.set(r.toolCallId, r.args ?? {});
    if (r.type !== "tool_execution_end") continue;
    const content = r.result?.content ?? [];
    const text = content
      .filter((c: Rec) => c.type === "text")
      .map((c: Rec) => c.text)
      .join("");
    out.push({ toolName: r.toolName, isError: !!r.isError, text, args: args.get(r.toolCallId) ?? {} });
  }
  return out;
}
