// Picker behaviour with fake deps: node --test extensions/pi-sliced/test/
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({ resolve: (await import("./picker-hooks.mjs")).resolve });

const { SlicesPicker, rowSummary, statusText } = await import("../picker.ts");
const { applySelection, buildPool, DetailCache, registerPicker, reportText } = await import("../picker-wiring.ts");
const { MARKERS, footprintRow, heavyConfirmLine, unionMarkers, entryMarkers, ourWords } = await import("../markers.ts");
const { visibleWidth } = await import("@earendil-works/pi-tui");
const fx = await import("./picker-fixtures.ts");
type Picker = InstanceType<typeof SlicesPicker>;
type PickerResult = import("../picker.ts").PickerResult;

const here = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = /install|download/i;

const theme = { fg: (_c: string, text: string) => text, bg: (_c: string, text: string) => text, bold: (text: string) => text };
const keys = {
  up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D", enter: "\r", esc: "\x1b", tab: "\t", shiftTab: "\x1b[Z",
  ctrlC: "\x03", ctrlS: "\x13", ctrlDown: "\x1b[1;5B", ctrlUp: "\x1b[1;5A", end: "\x1b[F", backspace: "\x7f",
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

function makePicker(opts: { deps?: ReturnType<typeof fx.fakeDeps>; done?: (r: PickerResult | null) => void } = {}) {
  const deps = opts.deps ?? fx.fakeDeps();
  const details = new DetailCache(deps);
  const pool = buildPool(fx.CATALOGUE, deps.slice.served(), deps, details);
  const picker = new SlicesPicker([...pool.values()].map((e) => e.skill), theme as never, { requestRender() {} } as never, undefined, opts.done ?? (() => {}), {
    domainSummaries: fx.CATALOGUE.domains,
    searchSkillsSh: async (q: string) => (await deps.skillsSh.search(q)).map((item) => {
      const existing = pool.get(item.id);
      if (existing) return existing.skill;
      const { untracedEntry } = wiring;
      const entry = untracedEntry(item, deps);
      pool.set(item.id, entry);
      return entry.skill;
    }),
  });
  return { picker, deps, pool, details };
}
const wiring = await import("../picker-wiring.ts");

const screen = (p: Picker, width = 120) => p.render(width).join("\n");
const cursor = (p: Picker) => p.render(120).find((line) => line.trimStart().startsWith("›")) ?? "";
const statusLine = (p: Picker) => p.render(120)[1];
const rowsOf = (p: Picker) => p.render(120).slice(4, 4 + 12);
function moveTo(p: Picker, label: string | RegExp) {
  for (let i = 0; i < 80; i++) {
    const line = cursor(p);
    if (typeof label === "string" ? line.includes(label) : label.test(line)) return;
    p.handleInput(keys.down);
  }
  throw new Error(`cursor never reached ${label}\n${screen(p)}`);
}
/** Every Inspect page, top to bottom, at width 200. */
function inspectAll(p: Picker): string {
  const pages: string[] = [];
  for (let i = 0; i < 40; i++) {
    const lines = p.render(200);
    pages.push(lines.slice(5, -4).join("\n"));
    if (/ end\b|\(all \d+ lines\)/.test(lines.at(-4)!)) break;
    p.handleInput(keys.ctrlDown);
  }
  return pages.join("\n");
}
function type(p: Picker, text: string) {
  for (const ch of text) p.handleInput(ch);
}
function expandAll(p: Picker) {
  for (let i = 0; i < 60; i++) {
    const line = cursor(p);
    if (/▸/.test(line)) p.handleInput(keys.right);
    p.handleInput(keys.down);
  }
}

describe("tree", () => {
  test("opens with exactly two top-level branches, Domains and Skills.sh, both collapsed", () => {
    const { picker } = makePicker();
    const rows = rowsOf(picker).filter((line) => line.trim());
    assert.equal(rows.length, 2, rows.join("\n"));
    assert.match(rows[0], /^› ▸ \[ \] Domains/);
    assert.match(rows[1], /^  ▸ \[ \] Skills\.sh/);
  });

  test("Domains groups the Catalogue by domain; Skills.sh asks for a search", () => {
    const { picker } = makePicker();
    picker.handleInput(keys.right);
    const text = screen(picker);
    for (const domain of ["Visual Art & Print", "Craft & Workflow", "Frontend UI"]) assert.match(text, new RegExp(`▸ \\[ \\] ${domain.replace(/[&]/g, "\\$&")}`));
    assert.match(text, /Posters, prints and visual pieces/);
    moveTo(picker, "Skills.sh");
    picker.handleInput(keys.right);
    assert.match(screen(picker), /Type to search skills\.sh/);
  });

  test("Tab moves between the two branches; Shift+Tab collapses all", () => {
    const { picker } = makePicker();
    picker.handleInput(keys.right);
    picker.handleInput(keys.tab);
    assert.match(cursor(picker), /Skills\.sh/);
    picker.handleInput(keys.tab);
    assert.match(cursor(picker), /Domains/);
    picker.handleInput(keys.shiftTab);
    assert.equal(rowsOf(picker).filter((l) => l.trim()).length, 2);
  });

  test("rows sort alphabetically, never by popularity, and show the human summary", () => {
    const { picker } = makePicker();
    expandAll(picker);
    const text = screen(picker);
    assert.ok(text.indexOf("game-ui-frontend") < text.indexOf("shadcn"));
    assert.match(text, /Red-green-refactor loop/);
    assert.doesNotMatch(text, /Use this when/i);
    assert.equal(rowSummary({ summary: "Use this when building a game HUD in the browser" }), "Building a game HUD in the browser");
  });
});

describe("Footprint", () => {
  test("is in the listing row before the skill can be served, compact", () => {
    const { picker } = makePicker();
    expandAll(picker);
    moveTo(picker, "canvas-design");
    const row = cursor(picker);
    assert.match(row, /\[ \] canvas-design/);
    assert.match(row, /\s5\.3 MiB\s/);
    moveTo(picker, "game-ui-frontend");
    assert.match(cursor(picker), /205 KiB · \+1 skill/);
    moveTo(picker, /\] shadcn\s/);
    assert.match(cursor(picker), /136 KiB · 2 CLI · 1 pkg · 1 host/);
    assert.doesNotMatch(cursor(picker), /date-fns|tsc/, "counts only, never names");
    assert.equal(footprintRow(fx.CANVAS.footprint), "5.3 MiB");
  });

  test("Footprint column holds its position across folds, search and selection", () => {
    const { picker } = makePicker();
    const col = () => {
      const line = picker.render(120).find((l) => /\] tdd\s/.test(l));
      return line ? line.search(/9 KiB/) : -1;
    };
    expandAll(picker);
    const first = col();
    assert.ok(first > 0);
    type(picker, "tdd");
    assert.equal(col(), first);
    moveTo(picker, "tdd");
    picker.handleInput(keys.enter);
    assert.equal(col(), first);
    for (let i = 0; i < 3; i++) picker.handleInput(keys.backspace);
    assert.equal(col(), first);
  });

  test("Inspect shows it with no extra key press; details open on request", async () => {
    const { picker } = makePicker();
    expandAll(picker);
    moveTo(picker, "game-ui-frontend");
    picker.handleInput(keys.right);
    let text = screen(picker);
    assert.match(text, /Footprint {2}17 files, 205 KiB · \+1 other skill · 4 repo files/);
    await tick();
    picker.handleInput("d");
    text = screen(picker);
    assert.match(text, /Files outside its folder: 4/);
    assert.match(text, /plugins\/game-studio\/references\/frontend-prompts\.md/);
    assert.match(text, /∞ chain-loads\n\s+pulls plugins\/game-studio\/skills\/web-game-foundations/);
    assert.match(text, /named by bare name: web-game-foundations plugins\/game-studio\/skills\/web-game-foundations/);
    assert.match(text, /pulls in files of plugins\/game-studio\/skills\/web-game-foundations \(1 file, 3\.9 KiB\)/);
    picker.handleInput(keys.esc);
    moveTo(picker, /\] shadcn\s/);
    picker.handleInput(keys.right);
    assert.match(screen(picker), /Footprint {2}16 files, 136 KiB · CLI shadcn, tsc · packages date-fns · 1 host · Heavy/);
    picker.handleInput("d");
    const details = inspectAll(picker);
    assert.match(details, /Heavy because: 1 package to add; 2 CLIs/);
    assert.match(details, /\+ packages\n\s+adds package date-fns/);
    assert.match(details, /fetches and runs remote code\n\s+npx shadcn@latest @ skills\/shadcn\/SKILL\.md:12\n\s+add @latest @ skills\/shadcn\/cli\.md:5/);
    assert.match(details, /CLI: shadcn, tsc\n\s+package: date-fns\n\s+network: ui\.shadcn\.com/);
    assert.doesNotMatch(details, FORBIDDEN);
  });

  test("Untraced rows say the Footprint is unknown", async () => {
    const { picker } = makePicker();
    type(picker, "canvas");
    await tick();
    const row = picker.render(120).find((l) => l.includes("canvas-poster"))!;
    assert.match(row, /Untraced · Footprint unknown/);
  });
});

describe("Skills.sh dedupe", () => {
  test("a Catalogue skill appears once, as its Catalogue listing; the other item is Untraced", async () => {
    const { picker, deps } = makePicker();
    type(picker, "canvas");
    await tick();
    assert.ok(deps.calls.includes("search canvas"));
    const rows = rowsOf(picker);
    const canvas = rows.filter((l) => /\] canvas-design\b/.test(l));
    assert.equal(canvas.length, 1, rows.join("\n"));
    assert.match(canvas[0], /5\.3 MiB/);
    assert.doesNotMatch(canvas[0], /Untraced/);
    const poster = rows.filter((l) => /\] canvas-poster\b/.test(l));
    assert.equal(poster.length, 1);
    assert.match(poster[0], /Untraced/);
    const domainsAt = rows.findIndex((l) => /Domains/.test(l));
    const skillsShAt = rows.findIndex((l) => /Skills\.sh/.test(l));
    assert.ok(domainsAt < rows.indexOf(canvas[0]) && rows.indexOf(canvas[0]) < skillsShAt);
    assert.ok(skillsShAt < rows.indexOf(poster[0]));
  });
});

describe("Skills.sh order", () => {
  test("display order is by name then id, whatever order the registry returns", async () => {
    const items = [
      { id: "zeta/skills/canvas-b", name: "canvas-b", source: "zeta/skills" },
      { id: "acme/skills/canvas-c", name: "canvas-c", source: "acme/skills" },
      { id: "acme/skills/canvas-a", name: "canvas-a", source: "acme/skills" },
      { id: "acme/other/canvas-a", name: "canvas-a", source: "acme/other" },
    ];
    const orders: string[][] = [];
    for (const results of [items, [...items].reverse()]) {
      const { picker } = makePicker({ deps: fx.fakeDeps({ searchResults: results }) });
      type(picker, "canvas-");
      await tick();
      orders.push(rowsOf(picker).filter((l) => /\] canvas-[abc]\b/.test(l)).map((l) => l.trim()));
    }
    assert.deepEqual(orders[0], orders[1]);
    assert.equal(orders[0].length, 4);
    // Grouped by author as in the archive, every level alphabetical: acme before zeta.
    assert.match(orders[0].at(-1)!, /canvas-b/);
  });
});

describe("markers", () => {
  test("rows carry glyphs; a branch shows the union of its children; Skills.sh is Untraced", async () => {
    const { picker } = makePicker();
    const domainsRow = rowsOf(picker)[0];
    assert.match(domainsRow, /\$\+⇅∞↯/);
    picker.handleInput(keys.right);
    moveTo(picker, "Frontend UI");
    assert.match(cursor(picker), /Frontend UI\s+\$\+⇅∞↯/);
    moveTo(picker, "Craft & Workflow");
    assert.doesNotMatch(cursor(picker), /[$+⇅∞↯]/);
    moveTo(picker, "Skills.sh");
    assert.match(cursor(picker), /Skills\.sh\s+\?/);
    assert.deepEqual(unionMarkers([["chain-loads"], ["runs-commands", "network"], ["runs-commands"]]), ["runs-commands", "network", "chain-loads"]);
    assert.deepEqual(entryMarkers(fx.SHADCN.markers), ["runs-commands", "installs-packages", "network", "unpinned-code"]);
    assert.deepEqual(entryMarkers([]), [], "markers come from the Listing only, never from Outside requirements");
  });

  test("the position line names the current row's markers; ? opens the full legend", () => {
    const { picker } = makePicker();
    picker.handleInput(keys.right);
    moveTo(picker, "Frontend UI");
    assert.match(picker.render(120)[16], /\$ commands · \+ packages · ⇅ network · ∞ chain-loads · ↯ remote code/);
    picker.handleInput("?");
    const text = screen(picker);
    assert.equal(MARKERS.length, 14);
    for (const { glyph, meaning } of MARKERS) assert.ok(text.includes(`${glyph}  ${meaning}`), meaning);
    picker.handleInput("?");
    assert.match(screen(picker), /Search:/);
  });
});

describe("status line", () => {
  test("states the current selections at the top of every screen, with the Untraced disclaimer", async () => {
    const { picker } = makePicker();
    assert.match(statusLine(picker), /Select Skills\s+Nothing selected/);
    expandAll(picker);
    moveTo(picker, "tdd");
    picker.handleInput(keys.enter);
    assert.match(statusLine(picker), /Selected \(1\) · tdd/);
    type(picker, "poster");
    await tick();
    moveTo(picker, "canvas-poster");
    picker.handleInput(keys.enter);
    assert.match(statusLine(picker), /Selected \(2\) · includes 1 Untraced item: Footprint unknown · tdd, canvas-poster/);
    picker.handleInput(keys.right);
    assert.match(picker.render(120)[1], /includes 1 Untraced item/);
    assert.equal(statusText([]), "Nothing selected · the Slice is empty");
  });

  test("the disclaimer survives a narrow width", () => {
    const names = Array.from({ length: 8 }, (_, i) => ({ id: `a/b/skill-${i}`, name: `skill-number-${i}` }));
    const text = statusText([{ id: "x/y/z", name: "z", untraced: true }, ...names]);
    assert.ok(text.indexOf("Untraced") < text.indexOf("skill-number-0"));
  });
});

describe("Heavy confirm", () => {
  test("names the cost; declining leaves the skill unserved; accepting selects it", () => {
    let result: PickerResult | null | undefined;
    const { picker } = makePicker({ done: (r) => { result = r; } });
    expandAll(picker);
    moveTo(picker, "canvas-design");
    picker.handleInput(keys.enter);
    let text = screen(picker);
    assert.match(text, /canvas-design: 5\.3 MiB, 83 files\. Serve it\?/);
    assert.match(text, /n\/Esc keep unserved/);
    picker.handleInput("n");
    assert.match(cursor(picker), /\[ \] canvas-design/);
    assert.match(statusLine(picker), /Nothing selected/);
    picker.handleInput(keys.enter);
    picker.handleInput(keys.esc);
    assert.match(cursor(picker), /\[ \] canvas-design/);
    picker.handleInput(keys.enter);
    picker.handleInput("y");
    assert.match(cursor(picker), /\[x\] canvas-design/);
    assert.match(statusLine(picker), /Selected \(1\) · canvas-design/);
    picker.handleInput(keys.enter);
    assert.match(cursor(picker), /\[ \] canvas-design/, "deselecting never asks");
    picker.handleInput(keys.enter);
    picker.handleInput(keys.enter);
    picker.handleInput(keys.esc);
    assert.deepEqual(result, { served: ["anthropics/skills/canvas-design"] });
    assert.equal(heavyConfirmLine("shadcn", fx.SHADCN.footprint, fx.SHADCN.heavyBecause), "shadcn: 136.1 KiB, 16 files; 1 package to add, 2 CLIs. Serve it?");
    assert.equal(heavyConfirmLine("canvas-design", fx.CANVAS.footprint, fx.CANVAS.heavyBecause), "canvas-design: 5.3 MiB, 83 files. Serve it?");
  });

  test("a group serve with Heavy skills inside asks once, naming each; non-Heavy skills never ask", () => {
    const { picker } = makePicker();
    picker.handleInput(keys.right);
    moveTo(picker, "Frontend UI");
    picker.handleInput(keys.enter);
    const text = screen(picker);
    assert.match(text, /shadcn: 136\.1 KiB, 16 files; 1 package to add, 2 CLIs\. Serve it\?/);
    assert.match(text, /Also selects 1 more that are not Heavy/);
    picker.handleInput("n");
    assert.match(cursor(picker), /\[ \] Frontend UI/);
    moveTo(picker, "Craft & Workflow");
    picker.handleInput(keys.enter);
    assert.match(cursor(picker), /\[x\] Craft & Workflow/);
  });

  test("Ctrl+C cancels and discards", () => {
    let result: PickerResult | null | undefined;
    const { picker } = makePicker({ done: (r) => { result = r; } });
    picker.handleInput(keys.right);
    moveTo(picker, "Craft & Workflow");
    picker.handleInput(keys.enter);
    picker.handleInput(keys.ctrlC);
    assert.equal(result, null);
  });
});

describe("Inspect", () => {
  test("a long skill: most visible rows are body text and the last body line is reachable", async () => {
    const deps = fx.fakeDeps({ skillMd: fx.longSkillMd("tdd", 300) });
    const { picker } = makePicker({ deps });
    expandAll(picker);
    moveTo(picker, "tdd");
    picker.handleInput(keys.right);
    await tick();
    const lines = picker.render(120);
    assert.equal(lines.length, 21);
    const skillMdLines = new Set(fx.longSkillMd("tdd", 300).split("\n"));
    const bodyRows = lines.filter((line) => skillMdLines.has(line.trim()));
    assert.ok(bodyRows.length > lines.length / 2, `${bodyRows.length} of ${lines.length} rows are body text\n${lines.join("\n")}`);
    assert.match(lines.join("\n"), /lines 1–12 of 307\) ↓ more/);
    for (let i = 0; i < 40; i++) picker.handleInput(keys.ctrlDown);
    let text = screen(picker);
    assert.match(text, /Body line 300 of tdd\./);
    assert.match(text, /of 307\) end/);
    for (let i = 0; i < 40; i++) picker.handleInput(keys.ctrlUp);
    assert.match(screen(picker), /^ {2}---$/m);
    picker.handleInput(keys.end);
    assert.match(screen(picker), /Body line 300 of tdd\./);
    picker.handleInput("f");
    text = screen(picker);
    assert.match(text, /Red-green-refactor loop/);
    assert.match(text, /f full body/);
  });

  test("Inspect serves the Detail the user inspected, at its Revision", async () => {
    const deps = fx.fakeDeps();
    let result: PickerResult | null = null;
    const made = makePicker({ deps, done: (r) => { result = r; } });
    expandAll(made.picker);
    moveTo(made.picker, "tdd");
    made.picker.handleInput(keys.right);
    await tick();
    made.picker.handleInput(keys.enter);
    assert.match(made.picker.render(120)[2], /\[x\] tdd/);
    made.picker.handleInput(keys.esc);
    made.picker.handleInput(keys.esc);
    const report = await applySelection(deps, made.pool, new Set(), result!, made.details);
    assert.deepEqual(report, { served: ["tdd"], unserved: [], failed: [] });
    assert.deepEqual(deps.calls.filter((c) => c.startsWith("detail") || c.startsWith("serve")), [
      `detail mattpocock/skills/tdd@${fx.TDD.revision}`,
      `serveCatalogue mattpocock/skills/tdd@${fx.TDD.revision}`,
    ]);
  });

  test("Untraced Inspect loads the skills.sh SKILL.md and says the Footprint is unknown", async () => {
    const { picker, deps } = makePicker();
    type(picker, "poster");
    await tick();
    moveTo(picker, "canvas-poster");
    picker.handleInput(keys.right);
    await tick();
    const text = screen(picker);
    assert.match(text, /Footprint unknown: Untraced/);
    assert.match(text, /Body line 1 of canvas-poster/);
    assert.ok(deps.calls.includes("skillMd someone/art-skills/canvas-poster"));
  });
});

describe("serving through deps", () => {
  test("applySelection serves added skills, unserves cleared ones, and nothing else", async () => {
    const deps = fx.fakeDeps();
    await deps.slice.serveCatalogue(fx.detailOf(fx.TDD));
    deps.calls.length = 0;
    const details = new DetailCache(deps);
    const pool = buildPool(fx.CATALOGUE, deps.slice.served(), deps, details);
    assert.equal(pool.get("mattpocock/skills/tdd")!.skill.checked, true);
    pool.set("someone/art-skills/canvas-poster", wiring.untracedEntry(fx.SKILLS_SH[1], deps));
    const report = await applySelection(deps, pool, new Set(["mattpocock/skills/tdd"]), { served: ["shadcn-ui/ui/shadcn", "someone/art-skills/canvas-poster"] }, details);
    assert.deepEqual(deps.calls, [
      "unserve mattpocock/skills/tdd",
      `detail shadcn-ui/ui/shadcn@${fx.SHADCN.revision}`,
      `serveCatalogue shadcn-ui/ui/shadcn@${fx.SHADCN.revision}`,
      "serveUntraced someone/art-skills/canvas-poster",
    ]);
    assert.equal(reportText(report, 2), "pi-sliced: 2 skills served; added shadcn, canvas-poster; removed tdd.");
  });

  test("a Detail at another Revision is refused", async () => {
    const deps = fx.fakeDeps();
    deps.catalogue.detail = async (id) => ({ ...fx.detailOf(fx.TDD), id, revision: "f".repeat(40) });
    const details = new DetailCache(deps);
    const pool = buildPool(fx.CATALOGUE, [], deps, details);
    const report = await applySelection(deps, pool, new Set(), { served: ["mattpocock/skills/tdd"] }, details);
    assert.equal(report.served.length, 0);
    assert.match(report.failed[0], /answered mattpocock\/skills\/tdd@f{40}/);
    assert.ok(!deps.calls.some((c) => c.startsWith("serveCatalogue")));
  });

  test("registerPicker registers /slices and refuses non-terminal modes", async () => {
    const commands = new Map<string, { description: string; handler: (args: string, ctx: unknown) => Promise<void> }>();
    registerPicker({ registerCommand: (name: string, opts: never) => commands.set(name, opts) } as never, fx.fakeDeps());
    assert.deepEqual([...commands.keys()], ["slices"]);
    const notes: string[] = [];
    await commands.get("slices")!.handler("", { mode: "rpc", ui: { notify: (m: string) => notes.push(m) } });
    assert.deepEqual(notes, ["/slices needs the interactive terminal UI"]);
    assert.doesNotMatch(commands.get("slices")!.description, FORBIDDEN);
  });
});

describe("vocabulary", () => {
  test("no Picker screen, hint, legend, confirm or notification contains install or download", async () => {
    const screens: string[] = [];
    const capture = (p: Picker) => { for (const w of [80, 120, 200]) screens.push(screen(p, w)); };
    const { picker } = makePicker();
    capture(picker);
    expandAll(picker);
    capture(picker);
    picker.handleInput("?");
    capture(picker);
    picker.handleInput("?");
    moveTo(picker, "canvas-design");
    picker.handleInput(keys.enter);
    capture(picker);
    picker.handleInput("n");
    moveTo(picker, "game-ui-frontend");
    picker.handleInput(keys.right);
    capture(picker);
    await tick();
    capture(picker);
    picker.handleInput("d");
    capture(picker);
    picker.handleInput("f");
    capture(picker);
    picker.handleInput(keys.esc);
    moveTo(picker, /\] shadcn\s/);
    picker.handleInput(keys.right);
    await tick();
    picker.handleInput("d");
    screens.push(inspectAll(picker));
    picker.handleInput(keys.esc);
    picker.handleInput(keys.enter);
    capture(picker);
    picker.handleInput("n");
    type(picker, "canvas");
    capture(picker);
    await tick();
    capture(picker);
    type(picker, "zzzz");
    await tick();
    capture(picker);
    const failing = makePicker({ deps: Object.assign(fx.fakeDeps(), {}) });
    failing.deps.skillsSh.search = async () => { throw new Error("proxy unreachable"); };
    type(failing.picker, "qq");
    await tick();
    capture(failing.picker);
    const errorPicker = new SlicesPicker([], theme as never, { requestRender() {} } as never, undefined, () => {}, { catalogueError: "connect ECONNREFUSED" });
    errorPicker.handleInput(keys.right);
    capture(errorPicker);
    for (const s of screens) assert.doesNotMatch(s, FORBIDDEN, s);
    for (const m of MARKERS) assert.doesNotMatch(`${m.short} ${m.meaning}`, FORBIDDEN);
    assert.doesNotMatch(reportText({ served: ["a"], unserved: ["b"], failed: ["c (x)"] }, 1), FORBIDDEN);
  });

  test("the Picker's source files never use the words", () => {
    for (const file of ["picker.ts", "picker-wiring.ts", "markers.ts"]) {
      // markers.ts names the words only in its rewrite table and the contract's marker key.
      const text = readFileSync(join(here, "..", file), "utf8")
        .split("\n")
        .filter((line) => !/^\s*\[\/\\b(install|download)/.test(line))
        .join("\n")
        .replaceAll('"installs-packages"', "");
      assert.doesNotMatch(text, FORBIDDEN, file);
    }
  });
});

describe("our wording for Classification text", () => {
  test("install and download become add and fetch, as whole words only", () => {
    assert.equal(ourWords("4 packages to install"), "4 packages to add");
    assert.equal(ourWords("installs date-fns"), "adds package date-fns");
    assert.equal(ourWords("install @latest @ a.md:3"), "add @latest @ a.md:3");
    assert.equal(ourWords("Downloads fonts; downloadable PDF; installation; Installed"), "Fetches fonts; fetchable PDF; setup; Added");
    assert.equal(ourWords("runs cptinstall.exe"), "runs cptinstall.exe", "names quoted from the skill are left as they are");
  });
});

describe("widths", () => {
  test("every line fits the width on every screen, including narrow ones", async () => {
    const { picker } = makePicker();
    const check = () => {
      for (const width of [0, 1, 8, 20, 40, 60, 80, 100, 160]) {
        for (const line of picker.render(width)) assert.ok(visibleWidth(line) <= width, `width ${width}: ${line}`);
      }
    };
    check();
    expandAll(picker);
    check();
    moveTo(picker, "canvas-design");
    picker.handleInput(keys.enter);
    check();
    picker.handleInput("n");
    picker.handleInput("?");
    check();
    picker.handleInput("?");
    picker.handleInput(keys.right);
    await tick();
    check();
    picker.handleInput(keys.esc);
    type(picker, "canvas");
    await tick();
    check();
  });

  test("the Footprint is never shed at 60 columns", () => {
    const { picker } = makePicker();
    expandAll(picker);
    moveTo(picker, "canvas-design");
    const row = picker.render(60).find((l) => l.startsWith("›"))!;
    assert.match(row, /5\.3 MiB/);
  });
});

const piRoot = process.env.PI_SOURCE_DIR ?? join(process.env.HOME ?? "", "pi");
const virtualTerminal = join(piRoot, "packages/tui/test/virtual-terminal.ts");
const themeModule = join(piRoot, "packages/coding-agent/dist/modes/interactive/theme/theme.js");
describe("real renderer", { skip: !existsSync(virtualTerminal) && "no Pi source checkout" }, () => {
  test("styled frames stay within width and Ctrl+Up/Down reach the Picker on both screens", async () => {
    const { TuiMainScreen, TuiAltScreen } = await import("@earendil-works/pi-tui");
    const { VirtualTerminal } = await import(virtualTerminal);
    const { getThemeByName } = await import(themeModule);
    for (const Tui of [TuiMainScreen, TuiAltScreen]) {
      const terminal = new VirtualTerminal(100, 30);
      const tui = new Tui(terminal);
      const deps = fx.fakeDeps({ skillMd: fx.longSkillMd("tdd", 120) });
      const pool = buildPool(fx.CATALOGUE, [], deps, new DetailCache(deps));
      const picker = new SlicesPicker([...pool.values()].map((e) => e.skill), getThemeByName("dark"), tui, undefined, () => {}, { domainSummaries: fx.CATALOGUE.domains });
      tui.addChild(picker);
      tui.setFocus(picker);
      tui.start();
      const frame = async () => { tui.renderNow(true); await terminal.flush(); return terminal.getViewport().join("\n"); };
      try {
        let text = await frame();
        assert.match(text, /Select Skills\s+Nothing selected/);
        assert.match(text, /▸ \[ \] Domains/);
        terminal.sendInput(keys.right);
        terminal.sendInput(keys.ctrlDown);
        text = await frame();
        assert.match(text, /› ▸ \[ \] Skills\.sh/);
        terminal.sendInput(keys.ctrlUp);
        terminal.sendInput(keys.down);
        terminal.sendInput(keys.right);
        terminal.sendInput(keys.down);
        text = await frame();
        assert.match(text, /›\s+\[ \] tdd/);
        assert.match(text, /Ctrl\+C cancel/);
        terminal.sendInput(keys.right);
        await tick();
        text = await frame();
        assert.match(text, /Footprint {2}3 files, 9 KiB/);
        assert.match(text, /Body line 1 of tdd/);
        for (let i = 0; i < 12; i++) terminal.sendInput(keys.ctrlDown);
        text = await frame();
        assert.match(text, /Body line 120 of tdd/);
        for (const width of [0, 1, 8, 20, 40, 80, 100]) {
          for (const line of picker.render(width)) assert.ok(visibleWidth(line) <= width, `width ${width}`);
        }
      } finally {
        tui.stop();
      }
    }
  });
});
