// Proof 7, in the sandbox: one fresh session per Slice size; the user serves the first N skills,
// then one prompt the model answers with text only, so each session sends exactly one payload.
// Records that payload and whether it carries any served skill's body or reference file text.
// args: { sizes: number[], ids: string[] }
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Harness } from "../drive.ts";
import { payloadText } from "../lib.ts";
import { requireSeam, serve, state } from "./common.ts";

/** Lines of `text` long enough to identify it (≥ 40 chars), capped. */
const lines = (text: string, cap: number) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 40)
    .slice(0, cap);

export default async function (h: Harness) {
  const { sizes, ids } = h.args as { sizes: number[]; ids: string[] };
  const runs: unknown[] = [];
  let base = "";
  for (const n of sizes) {
    const pi = h.startPi();
    await requireSeam(h, pi);
    const served = n ? await serve(pi, ids.slice(0, n)) : { footprints: [], served: [], errors: [] };
    const st = await state(pi);
    const from = h.mock.requests.length;
    h.mock.script([{ text: "ok" }]);
    await pi.prompt("Hello.");
    const reqs = h.mock.requests.slice(from);
    const body = reqs[0]?.body ?? "";
    const text = payloadText(body);
    if (n === 0) base = text;

    // Body and reference text of every Served skill, absent from the payload.
    const hits: Array<{ id: string; file: string; line: string }> = [];
    let probed = 0;
    for (const e of st.slice) {
      for (const f of h.walk(e.root).filter((x) => x.kind === "file")) {
        const bytes = readFileSync(join(e.root, f.path));
        if (bytes.includes(0)) continue; // binary: no text to find
        let t = bytes.toString("utf8");
        if (join(e.root, f.path) === e.skillMdPath) t = t.replace(/^---\n[\s\S]*?\n---\n/, ""); // body only
        for (const l of lines(t, 200)) {
          if (e.description.includes(l) || e.name.includes(l) || base.includes(l)) continue;
          probed++;
          if (text.includes(l)) hits.push({ id: e.id, file: f.path, line: l });
        }
      }
    }
    const exit = await pi.close(); // after reading the served files: exit removes them
    runs.push({
      n,
      served: served.served.length,
      errors: served.errors,
      slice: st.slice.map((e) => ({ id: e.id, name: e.name, description: e.description })),
      requests: reqs.length,
      body,
      probed,
      hits,
      exit,
    });
  }
  h.write("result.json", { runs });
}
