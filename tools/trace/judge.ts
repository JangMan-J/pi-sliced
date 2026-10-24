// Recorded judgements for the boundary cases a mechanical rule cannot settle
// (rulings F5, F8, H1, and F7 collisions): does this sentence direct the agent
// to read, run, or load this target? A judge agent answers each question once;
// the answers are committed and replayed, so a Trace is exact and repeatable.
// Stores are append-only and versioned by judge prompt: a better prompt writes a
// new store under its own version, and never edits an old answer.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const JUDGE = "judge-4";

export type QuestionClass = "outside-skill-folders" | "prose-directory" | "skill-folder-only";

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

/** Answers for one repository Revision under one judge version. Conflicting duplicates are an error. */
export class JudgementStore {
  private answers = new Map<string, Answer>();
  readonly pending = new Map<string, Question>();

  readonly root: string;
  readonly judge: string;

  constructor(root: string, judge: string = JUDGE) {
    this.root = root;
    this.judge = judge;
  }

  private loaded = new Set<string>();

  private load(source: string, revision: string): void {
    const key = `${source}@${revision}`;
    if (this.loaded.has(key)) return;
    this.loaded.add(key);
    const p = storePath(this.root, this.judge, source, revision);
    if (!existsSync(p)) return;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const a = JSON.parse(line) as Answer;
      const prev = this.answers.get(a.id);
      if (prev && prev.pullsIn !== a.pullsIn) throw new Error(`conflicting judgements for ${a.id} in ${p}`);
      if (!prev) this.answers.set(a.id, a);
    }
  }

  /** The recorded answer, or undefined after noting the question as pending. */
  decide(q: Question): boolean | undefined {
    this.load(q.source, q.revision);
    const a = this.answers.get(q.id);
    if (a) return a.pullsIn;
    this.pending.set(q.id, q);
    return undefined;
  }

  /** Append answers to the store for their Revision. Answers for unknown or already-answered ids are rejected. */
  append(source: string, revision: string, questions: Map<string, Question>, answers: Answer[]): number {
    this.load(source, revision);
    const p = storePath(this.root, this.judge, source, revision);
    mkdirSync(dirname(p), { recursive: true });
    let n = 0;
    for (const a of answers) {
      const q = questions.get(a.id);
      if (!q || q.source !== source || q.revision !== revision) throw new Error(`answer ${a.id} matches no question for ${source}@${revision}`);
      if (a.judge !== this.judge) throw new Error(`answer ${a.id} is from judge ${a.judge}, store is ${this.judge}`);
      if (typeof a.pullsIn !== "boolean") throw new Error(`answer ${a.id} has no boolean pullsIn`);
      if (this.answers.has(a.id)) continue; // never rewrite a stored answer
      appendFileSync(p, JSON.stringify({ id: a.id, pullsIn: a.pullsIn, reason: a.reason, judge: a.judge, model: a.model, file: q.file, line: q.line, ref: q.ref, target: q.target.path }) + "\n");
      this.answers.set(a.id, a);
      n++;
    }
    return n;
  }
}
