// Proof 6: the agent sees no Catalogue skill or Skills.sh branch item outside the Slice.
import { readFileSync } from "node:fs";
import { frontmatter } from "../../extensions/pi-sliced/frontmatter.ts";
import { fetchCatalogue, readJson, Verdict, writeOut } from "./host.ts";
import { payloadText } from "./lib.ts";
import { runSandbox, serverUrl } from "./sandbox.ts";

const v = new Verdict("check-slice", 6);
const CATALOGUE = "check-nine";
const SERVED = "mattpocock/skills/tdd";
const TERM = process.argv[2] ?? "canvas";
const GATEWAY = process.env.PI_SLICED_GATEWAY_URL || "https://pi-sliced.vercel.app/api/skills";
const UNKNOWN = /^No served skill is named "(.*)"\.$/;

const cat = await fetchCatalogue(CATALOGUE).catch((e) => v.finish(`catalogue ${CATALOGUE} unavailable: ${e.message}`));
const S = cat.skills.find((s) => s.id === SERVED) ?? v.finish(`${CATALOGUE} does not list ${SERVED}`);

const run = await runSandbox({
  name: "slice",
  scenario: "server/harness/scenarios/slice.ts",
  net: "host", // the Skills.sh branch needs the skills.sh proxy
  sessionEnv: { PI_SLICED_CHECK_DRIVER: "1", PI_SLICED_SERVER: serverUrl(), PI_SLICED_CATALOGUE: CATALOGUE },
  args: { serve: SERVED, term: TERM, catalogue: cat.skills.map((s) => ({ id: s.id, name: s.name })) },
});

/** A Skills.sh item's frontmatter description, from the proxy's detail snapshot (host side, for the check only). */
async function skillsShDescription(id: string): Promise<string | undefined> {
  const u = new URL(GATEWAY);
  u.searchParams.set("action", "detail");
  u.searchParams.set("id", id);
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`skills.sh proxy detail ${id} → ${res.status}`);
  const d: any = await res.json();
  const md = (d.files ?? []).find((f: any) => f.path === "SKILL.md")?.contents;
  return typeof md === "string" ? frontmatter(md).description : undefined;
}

/** The payload without the scripted model's own words: its tool calls, and the exact unknown-name echo. */
function redact(body: string): string {
  const p = JSON.parse(body);
  for (const m of p.messages ?? []) {
    if (!Array.isArray(m.content)) continue;
    m.content = m.content.filter((b: any) => {
      if (b.type === "tool_use") return false;
      if (b.type === "tool_result") {
        const text = typeof b.content === "string" ? b.content : (b.content ?? []).map((c: any) => c.text ?? "").join("");
        if (UNKNOWN.test(text)) return false;
      }
      return true;
    });
  }
  return payloadText(JSON.stringify(p));
}

try {
  const err = readJson(`${run.out}/error.json`);
  const r = readJson(`${run.out}/result.json`);
  if (err || !r) v.finish(`session did not complete (drive exit ${run.code}): ${err?.error ?? "no result"}`);
  const requests: Array<{ seq: number; body: string }> = readFileSync(`${run.out}/requests.jsonl`, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

  // The session state: a Slice of one, and Skills.sh results held.
  for (const e of r.served.errors) v.fail(`serve ${e.id}: ${e.message}`);
  for (const e of r.held.errors) v.fail(`Skills.sh search: ${e.message}`);
  v.ok(r.state.slice.length === 1 && r.state.slice[0].id === SERVED, `Slice is not exactly ${SERVED}: ${r.state.slice.map((e: any) => e.id)}`);
  v.ok(r.held.items.length > 0, `the session holds no Skills.sh items for "${TERM}"; the check would be vacuous`);
  v.ok(r.state.untraced === r.held.items.length, `session holds ${r.state.untraced} Skills.sh items, search returned ${r.held.items.length}`);

  // Needles: id and frontmatter description of every unserved skill the session knew of.
  const needles: Array<{ id: string; kind: string; text: string }> = [];
  for (const s of cat.skills) if (s.id !== SERVED) needles.push({ id: s.id, kind: "Catalogue id", text: s.id }, { id: s.id, kind: "Catalogue description", text: s.description });
  const items = r.held.items.filter((i: any) => i.id !== SERVED);
  const descs = new Map<string, string | undefined>();
  for (let i = 0; i < items.length; i += 8) {
    await Promise.all(
      items.slice(i, i + 8).map(async (it: any) => {
        try {
          descs.set(it.id, await skillsShDescription(it.id));
        } catch (e) {
          v.fail(`cannot read the description of Skills.sh item ${it.id}: ${(e as Error).message}`);
        }
      }),
    );
  }
  let noDesc = 0;
  for (const it of items) {
    needles.push({ id: it.id, kind: "Skills.sh id", text: it.id });
    const d = descs.get(it.id);
    if (!d) noDesc++;
    else if (d === S.description) v.note(`Skills.sh item ${it.id} shares the Served skill's description; its description is not a needle`);
    else needles.push({ id: it.id, kind: "Skills.sh description", text: d });
  }
  if (noDesc) v.note(`${noDesc} Skills.sh item(s) have no frontmatter description; their ids are still needles`);

  // Every model request payload.
  v.ok(requests.length >= 5, `only ${requests.length} model requests captured`);
  let leaks = 0;
  for (const q of requests) {
    const text = redact(q.body);
    for (const n of needles) {
      if (!text.includes(n.text)) continue;
      leaks++;
      v.fail(`request ${q.seq} contains the ${n.kind} of unserved ${n.id}`);
    }
  }
  // Positive control: the capture does carry the Served skill.
  const t1 = requests.filter((q) => q.seq >= r.turn1.from);
  v.ok(t1.length && t1.every((q) => payloadText(q.body).includes(S.description)), `the Served skill's description is missing from turn-1 payloads (capture broken?)`);
  const load = r.turn1.tools[0];
  v.ok(load && !load.isError && load.text.includes("\n\n---"), `served_skill ${S.name} did not return its SKILL.md`);

  // The agent's search and loads return nothing about unserved skills.
  const search = r.search[0];
  const [found, control = ""] = (search?.text ?? "").split("CONTROL\n");
  v.ok(search && found.trim() === "", `search for unserved ids/names found: ${found.slice(0, 400)}`);
  v.ok(control.includes(r.state.slice[0]?.skillDir), `control search did not find the Served skill's folder: ${control.slice(0, 300)}`);
  for (const l of r.loads) {
    const m = UNKNOWN.exec(l.text);
    v.ok(m && m[1] === l.args.name, `served_skill ${JSON.stringify(l.args)} returned: ${l.text.slice(0, 200)}`);
  }
  v.ok(r.loads.length === 2 * r.unserved.length, `expected ${2 * r.unserved.length} served_skill results, got ${r.loads.length}`);
  v.ok(r.exit === 0, `pi exited ${r.exit}`);

  v.note(
    `session: Slice [${SERVED}]; held ${r.held.items.length} Skills.sh items for "${TERM}"; ${cat.skills.length - 1} unserved Catalogue skills`,
  );
  v.note(`${requests.length} model requests × ${needles.length} needles (ids and descriptions) checked; ${leaks} found`);
  v.note(`agent search of HOME and temp dirs for ${r.unserved.length} unserved ids and names: ${JSON.stringify(found.trim())}; control found ${JSON.stringify(control.trim())}`);
  v.note(`agent loads by name and id: ${r.loads.length}, each "No served skill is named …" and nothing else`);
  writeOut("slice.json", { requests: requests.length, needles: needles.length, held: r.held.items.length });
  run.cleanup();
  v.finish(`no payload carries an unserved skill's id or description; loads and searches for them return nothing`);
} catch (e) {
  v.fail(String((e as Error).stack ?? e));
  v.finish(`harness error (work dir ${run.work})`);
}
