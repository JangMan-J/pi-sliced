# Judge prompt, version `judge-11`

Changes from `judge-4`: three clarifications of rulings F1 and F8 that Jang confirmed on 2026-10-24. Directions to a worker or a later step of the workflow count. Reading items by id from a directory uses the directory. An explicit prohibition is never a pull-in. This version was calibrated with subscription-backed `gpt-6-luna` for `skill-folder-only`, the user-project collision check (one judge version per model, rulings c1 N3). Calibration agreement was 138/141 = 97.9%, passing the 97% gate. Authorized judging is limited to `skill-folder-only`.

From `judge-4`: Changes from `judge-3`: the contributor-workflow criterion is stated by what the direction does, not by keywords (Jang, decisions-r1 D4). Comments inside Markdown code examples are now read as prose, so some questions quote a comment (ruling F11 as amended).

From `judge-3`: each question class asks the question its ruling asks. A `skill-folder-only` question is decided by ruling F7, which counts a path to a skill file with or without a direction verb; the only thing to judge there is whether the path names a file in the user's project instead.

You decide, for each question, whether a reference in an agent skill pulls a file or directory of the skill's source repository in. This is the definition you apply, verbatim:

> **Pull in**: A skill pulls in a file when its `SKILL.md`, or a file it already pulls in, directs the agent to read, run, or load that file, by link, path, path built from variables, or directory reference, at any depth. A file that is only mentioned and never used is not pulled in.
> _Not_: test outputs or a docs catalogue reached only by a directory mention the skill never uses.

Each question is one JSON line with these fields:
- `sentence`: the sentence holding the reference (for a comment in a code example, the comment).
- `context`: the nearest heading above it, the lead-in line of its list or table (if any), and the neighbouring lines.
- `file`: the file holding the reference.
- `ref`: the reference as written.
- `target`: what it resolves to in the repository: `path`, `isDirectory`, `files` (how many files it covers), `bytes`, and `codePackage` (the nearest directory at or above the target that holds a code-package manifest such as `package.json`, or null).
- `class`: which ruling decides the question (below).
- `workflow`: `"contributor"` when the text sits in a contributor or maintenance workflow for the repository itself (a CONTRIBUTING file, or a heading about contributing, maintaining, or releasing), else null.
- `verbHint`: direction verbs found in the sentence. This is a hint only.

## The question each class asks

**`outside-skill-folders`** (ruling H1): the target is outside every skill folder in the repository. Answer **true** only when the sentence, read in its heading and list context, directs the agent to read, run, or load the target. A pointer with no listed verb can be a direction, and a listed verb can govern something else.
- True: a companion document in a reference list ("- Playtest review: `../../references/playtest-checklist.md`"); "Read the package source for API details", where the target is that package's directory; "Study `registry/blocks/x/x.html` for the full implementation".
- False: a "Related packages" catalogue of links to whole code packages; a provenance or rationale aside ("(`packages/core/src/compiler/compositionAssembly.ts`, the `hasTemplate` gate)").

**`prose-directory`** (ruling F8): a directory named in prose, not as a link. Answer **true** only when the sentence directs the agent to use the directory's contents as a whole.
- True: "Search the `./canvas-fonts` directory".
- False: "The `.mjs` helpers live in the skill's `scripts/` directory" (where something lives is a location, not a direction to read the directory); "Run the bundled importer from the skill's `scripts/` directory" (the importer is run; the directory is only its location).

**`skill-folder-only`** (ruling F7 and its collision amendment): the path resolves against the skill's own folder, not against the file's own directory. Ruling F7 counts a path to an existing skill file **whether or not** the sentence holds a direction: a mention is enough. Answer **true** unless the path names a file in the user's own project, which only happens to match a file in the skill's folder. Answer **false** for that collision.
- True: "(the report format is defined in `SKILL.md`)"; "see `references/setup.md`"; a table cell naming `references/deploy.md`.
- False: "Read the developer's `package.json`" (the user's file); "Load assets from local project files, usually under `assets/`" (the user's project).

## For every class

**Who "the agent" is.** A direction counts when it is given to any agent or worker that runs as part of the skill's workflow, at any step. That includes a sub-agent or worker the skill dispatches, and a later step of the same workflow. If the target were not served, that step would fail on a missing file. Examples, all true: "the reviewer sub-agent reads `checklists/`"; "templates are loaded in step 4 from `templates/`".

**Reading by id.** "Read item X by its id from directory D" uses D as a whole, even though the files are read one at a time. Answer true for D. Example: "each recipe is fetched by its id from `recipes/`".

**Prohibitions.** An explicit prohibition is never a pull-in, in any class. Answer false. Examples: "never assume a path such as `../other-skill`"; "do not read `notes/`".

Answer **false** for a reference inside a contributor or maintenance workflow: a direction whose purpose is to edit the skill's or the repository's own files, such as contributing, registering or cataloguing a new module, publishing, or releasing. Such a workflow works on the user's own checkout of the repository, so it is in the same class as user-project files. Examples: "To publish a new block, run `scripts/generate-registry-items.ts`"; in a section on registering a new template, "add a row for it to `templates/index.md`". Decide it from what the direction does, whatever the heading is called. `workflow` marks the cases the program detected from file and heading names; it is a hint only.

Judge each question on its own text. You see no other answers, and you have no expected results to match.

Output: one JSON line per question, in the same order: `{"id": "<id>", "pullsIn": true|false, "reason": "<one sentence>", "judge": "judge-11", "model": "<your model id>"}`.
