// Scenario helpers: the user's actions through the extension's RPC check seam
// (PI_SLICED_CHECK_DRIVER=1: /pi-sliced-check-serve, /pi-sliced-check-untraced, /pi-sliced-check-state).
import type { Harness } from "../drive.ts";
import { notifies, type PiRpc, type Rec } from "../rpc.ts";

export function seamEvents(records: Rec[]): Rec[] {
  const out: Rec[] = [];
  for (const m of notifies(records)) {
    try {
      const v = JSON.parse(m);
      if (v && typeof v.check === "string") out.push(v);
    } catch {
      // not a seam message
    }
  }
  return out;
}

/** The user serves `ids` (`<id>[@revision]`) from the configured catalogue. */
export async function serve(pi: PiRpc, ids: string[]) {
  const { records } = await pi.prompt(`/pi-sliced-check-serve ${ids.join(" ")}`, 600_000);
  const ev = seamEvents(records);
  return {
    footprints: ev.filter((e) => e.check === "footprint"),
    served: ev.filter((e) => e.check === "served"),
    errors: ev.filter((e) => e.check === "error"),
  };
}

/** Skills.sh search, held in session state as the Picker holds it. */
export async function untraced(pi: PiRpc, query: string) {
  const { records } = await pi.prompt(`/pi-sliced-check-untraced ${query}`, 120_000);
  const ev = seamEvents(records);
  return { items: ev.find((e) => e.check === "untraced")?.items ?? [], errors: ev.filter((e) => e.check === "error") };
}

export interface SeamState {
  sessionDir: string | null;
  slice: Array<Rec & { id: string; name: string; root: string; skillDir: string; skillMdPath: string }>;
  untraced: number;
  activeTools: string[];
}
export async function state(pi: PiRpc): Promise<SeamState> {
  const { records } = await pi.prompt("/pi-sliced-check-state");
  const s = seamEvents(records).find((e) => e.check === "state");
  if (!s) throw new Error(`/pi-sliced-check-state printed no state (is PI_SLICED_CHECK_DRIVER=1 honoured?)`);
  return s as unknown as SeamState;
}

/** Fail early, with Pi's stderr, when the extension's seam is missing. */
export async function requireSeam(h: Harness, pi: PiRpc) {
  const res = await pi.request({ type: "get_commands" });
  const names: string[] = (res.data?.commands ?? []).map((c: Rec) => c.name);
  const need = ["pi-sliced-check-serve", "pi-sliced-check-untraced", "pi-sliced-check-state"];
  const missing = need.filter((n) => !names.includes(n));
  if (missing.length) throw new Error(`extension check seam missing: ${missing.join(", ")}; commands: ${names.join(", ")}\n${pi.stderrText.slice(-3000)}`);
  h.log("seam present");
}
