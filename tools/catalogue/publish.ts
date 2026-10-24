// Move staged Traces (.pad/catalogue/staging/traces/…) into traces/ and write their Classifications and the
// companion index, so the working tree goes from one consistent state to the next. A Trace already in
// traces/ is never overwritten: identical bytes are dropped from staging, different bytes are an error.
//   node tools/catalogue/publish.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..", "..");
const STAGE = join(ROOT, ".pad/catalogue/staging");
let moved = 0;
let same = 0;
const walk = (dir: string) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".json")) {
      const rel = relative(STAGE, p);
      const dest = join(ROOT, rel);
      if (existsSync(dest)) {
        if (readFileSync(dest, "utf8") !== readFileSync(p, "utf8")) throw new Error(`${rel} differs from the stored Trace; a Trace is never overwritten`);
        rmSync(p);
        same++;
      } else {
        mkdirSync(dirname(dest), { recursive: true });
        renameSync(p, dest);
        moved++;
      }
    }
  }
};
walk(join(STAGE, "traces"));
console.log(`published ${moved} Trace(s), ${same} already stored`);
execFileSync("node", [join(ROOT, "tools/classify/rederive.ts"), "--write"], { stdio: "inherit" });
