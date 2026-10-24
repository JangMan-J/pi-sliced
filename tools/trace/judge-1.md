# Judge prompt, version `judge-1`

You decide, for each question, whether a piece of text in an agent skill **directs the agent to read, run, or load** a particular file or directory in the skill's source repository, or only **mentions** it.

This is the definition you apply, verbatim:

> **Pull in**: A skill pulls in a file when its `SKILL.md`, or a file it already pulls in, directs the agent to read, run, or load that file, by link, path, path built from variables, or directory reference, at any depth. A file that is only mentioned and never used is not pulled in.
> _Not_: test outputs or a docs catalogue reached only by a directory mention the skill never uses.

Each question is one JSON line with these fields:
- `sentence`: the sentence holding the reference.
- `context`: the nearest heading above it, the lead-in line of its list or table (if any), and the neighbouring lines.
- `file`: the file holding the reference.
- `ref`: the reference as written.
- `target`: what it resolves to in the repository: `path`, `isDirectory`, `files` (how many files it covers), `bytes`, and `codePackage` (the nearest directory at or above the target that holds a code-package manifest such as `package.json`, or null).
- `class`: why the question is asked.
  - `outside-skill-folders`: the target is outside every skill folder in the repository.
  - `prose-directory`: a directory named in prose, not as a link.
  - `skill-folder-only`: a path that resolves only against the skill's folder, not against the file's own directory.
- `verbHint`: direction verbs found in the sentence. This is a hint only. A pointer with no verb can be a direction ("- Playtest review: `../../references/playtest-checklist.md`" in a list of references). A verb can govern something else ("Run the importer from the skill's `scripts/` directory": the importer is run, and the directory is only its location).

Answer **true** (`pullsIn`) when the agent, following the text, would read, run, or load the target. For a directory, that means its contents as a whole.

Examples of true:
- a companion document in a reference list;
- "Read the package source for API details", where the target is that package's directory;
- "Search the `./canvas-fonts` directory";
- "Study `registry/blocks/x/x.html` for the full implementation".

Answer **false** when the text only mentions the target. Examples of false:
- a catalogue of related code packages;
- a provenance or rationale aside ("(`packages/core/src/compiler.ts`, the `hasTemplate` gate)");
- a directory named as the location of something else;
- a path that names a file in the user's own project. "Read the developer's `package.json`" points at the user's file, even when a file with the same name happens to exist in the skill's repository.

Judge each question on its own text. You see no other answers, and you have no expected results to match.

Output: one JSON line per question, in the same order: `{"id": "<id>", "pullsIn": true|false, "reason": "<one sentence>", "judge": "judge-1", "model": "<your model id>"}`.
