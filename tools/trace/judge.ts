// Recorded judgements for the boundary cases a mechanical rule cannot settle
// (rulings F5, F8, H1, and F7 collisions): does this sentence direct the agent
// to read, run, or load this target? A judge agent answers each question once;
// the answers are committed and replayed, so a Trace is exact and repeatable.
// Stores are append-only and versioned by judge prompt: a better prompt writes a
// new store under its own version, and never edits an old answer.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const JUDGE = "judge-7";

export type QuestionClass = "outside-skill-folders" | "prose-directory" | "skill-folder-only";

// A panel judge answers no question itself: it replays the answers of judge versions in order, and asks
// the last version of a class's list (Jang, rulings c1 N3). judge-7: every judge-4 answer stands; new
// outside-skill-folders questions go to judge-10 (gpt-6-astra), skill-folder-only to judge-11
// (gpt-6-luna). prose-directory stays with judge-8 pending replacement calibration.
// Each answer is stored under the version that gave it.
export const PANELS: Record<string, Record<QuestionClass, string[]>> = {
  "judge-7": {
    "outside-skill-folders": ["judge-4", "judge-8", "judge-10"],
    "prose-directory": ["judge-4", "judge-8"],
    "skill-folder-only": ["judge-4", "judge-9", "judge-11"],
  },
};

/** The judge versions whose answers a judge (or panel) replays for a class, the asking version last. */
export function versionsFor(judge: string, cls: QuestionClass): string[] {
  return PANELS[judge]?.[cls] ?? [judge];
}

export interface Question {
  id: string;
  class: QuestionClass;
  source: string;
  revision: string;
  file: string; // the file holding the reference
  line: number;
  ref: string; // the reference as written
  sentence: string;
  context: string[]; // heading, list lead-in, and the neighbouring lines
  target: {
    path: string; // repo path the reference resolves to ("" is the repo root)
    isDirectory: boolean;
    files: number; // files the target covers
    bytes: number | null; // known only for blobs already fetched; null otherwise
    codePackage: string | null; // nearest enclosing dir (or the target) holding a package manifest
  };
  verbHint: string[]; // listed direction verbs present in the sentence
  workflow: "contributor" | null; // the text sits in a contributor or maintenance workflow for the repo (S1)
}

export interface Answer {
  id: string;
  pullsIn: boolean;
  reason: string;
  judge: string; // prompt version
  model: string;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function questionId(q: Omit<Question, "id">): string {
  return sha256([q.source, q.revision, q.file, String(q.line), q.ref, q.target.path, sha256(q.sentence)].join("\n"));
}

export function storePath(root: string, judge: string, source: string, revision: string): string {
  return join(root, "traces", "judgements", judge, source, `${revision}.jsonl`);
}

/** Answers for one repository Revision under one judge version or panel. Conflicting duplicates are an error. */
export class JudgementStore {
  private answers = new Map<string, Map<string, Answer>>(); // version -> id -> answer
  readonly pending = new Map<string, Question>();

  readonly root: string;
  readonly judge: string;

  constructor(root: string, judge: string = JUDGE) {
    this.root = root;
    this.judge = judge;
  }

  private loaded = new Set<string>();

  private versions(): string[] {
    const p = PANELS[this.judge];
    return p ? [...new Set(Object.values(p).flat())] : [this.judge];
  }

  private of(version: string): Map<string, Answer> {
    let m = this.answers.get(version);
    if (!m) this.answers.set(version, (m = new Map()));
    return m;
  }

  private load(source: string, revision: string): void {
    const key = `${source}@${revision}`;
    if (this.loaded.has(key)) return;
    this.loaded.add(key);
    for (const v of this.versions()) {
      const p = storePath(this.root, v, source, revision);
      if (!existsSync(p)) continue;
      const m = this.of(v);
      for (const line of readFileSync(p, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const a = JSON.parse(line) as Answer;
        const prev = m.get(a.id);
        if (prev && prev.pullsIn !== a.pullsIn) throw new Error(`conflicting judgements for ${a.id} in ${p}`);
        if (!prev) m.set(a.id, a);
      }
    }
  }

  /** The recorded answer (the first version in the class's list that has one), or undefined after noting the question as pending. */
  decide(q: Question): boolean | undefined {
    this.load(q.source, q.revision);
    for (const v of versionsFor(this.judge, q.class)) {
      const a = this.answers.get(v)?.get(q.id);
      if (a) return a.pullsIn;
    }
    this.pending.set(q.id, q);
    return undefined;
  }

  /** The version that answers a new question of this class. */
  asks(cls: QuestionClass): string {
    return versionsFor(this.judge, cls).at(-1)!;
  }

  /** Append answers to the store of the version that gave each. Answers for unknown or already-answered ids are rejected. */
  append(source: string, revision: string, questions: Map<string, Question>, answers: Answer[]): number {
    this.load(source, revision);
    let n = 0;
    for (const a of answers) {
      const q = questions.get(a.id);
      if (!q || q.source !== source || q.revision !== revision) throw new Error(`answer ${a.id} matches no question for ${source}@${revision}`);
      if (a.judge !== this.asks(q.class)) throw new Error(`answer ${a.id} is from judge ${a.judge}; ${this.judge} asks ${this.asks(q.class)} for ${q.class}`);
      if (typeof a.pullsIn !== "boolean") throw new Error(`answer ${a.id} has no boolean pullsIn`);
      if (versionsFor(this.judge, q.class).some((v) => this.answers.get(v)?.has(a.id))) continue; // never rewrite a stored answer
      const p = storePath(this.root, a.judge, source, revision);
      mkdirSync(dirname(p), { recursive: true });
      appendFileSync(p, JSON.stringify({ id: a.id, pullsIn: a.pullsIn, reason: a.reason, judge: a.judge, model: a.model, file: q.file, line: q.line, ref: q.ref, target: q.target.path }) + "\n");
      this.of(a.judge).set(a.id, a);
      n++;
    }
    return n;
  }
}
