---
type: spec
thread: trace
created: 2026-10-23T23:20:00Z
created_by: claude-opus-5-5
created_session: 01a16ad8-e553-7570-944c-08638df8729d
updated: 2026-10-24T05:00:00Z
updated_by: claude-opus-5-5
updated_session: 01a16ad8-e553-7570-944c-08638df8729d
---

# Boundary rulings for expected sets (confirmed by Jang, 2026-10-24)

The fixtures are the frozen **Pull in** definition as a careful reader applies it. The rulings below are the agreed reading of that definition, written so that a program can also apply them. They do not replace the definition. If you find a case where applying a ruling clearly misreads the definition, the fixture follows the definition. That means a real direction the ruling drops, or a pure mention the ruling keeps. Put such a case in `misreadings` (see the output section) with the quote and your reason. Do not bend the fixture to the ruling, and do not bend the ruling silently.

## Files

- **F1 Conditional directions count.** "Read X when Y", "If Z, also load [Y]", and "for runtime R see `adapters/R.md`" all pull in the target, in every workflow, followed recursively.
- **F2 Bare skill names.** A sibling skill named only by its name ("Use `hyperframes-cli` for command details") is not pulled in. Record each one under `namedSkills` (see the output section).
- **F3 Own-folder files nothing directs the agent to** (`agents/openai.yaml`, `evals/`, `BENCHMARK.md`, logos, an unreferenced `LICENSE`) are not pulled in. List them under `unreferencedOwnFolder`.
- **F4 Templates.** A path template counts every file it matches (`hyperframes-animation/adapters/<runtime>.md` → every adapter). The exception is a placeholder that stands for a whole skill, as in `<PLUGIN_ROOT>/skills/<name>/SKILL.md`: that names skills (F2), so it pulls in nothing.
- **F4b Skill roots.** A link or path that resolves to a directory holding a `SKILL.md` pulls in that `SKILL.md`, and whatever that file directs. It does not pull in the whole directory. Example: zoom's "- primary: `meeting-sdk/linux`" pulls in `meeting-sdk/linux/SKILL.md`, not `meeting-sdk/linux/agents/openai.yaml`.
- **F5 Repo-root paths outside every skill folder** (`packages/shader-transitions/`, `registry/blocks/vfx-portal/vfx-portal.html`, `docs/…`) count only when their sentence holds a direction verb from the list below. "(`packages/core/src/compiler/compositionAssembly.ts`, the `hasTemplate` gate)" holds no verb, so it does not count. "Read the package source" (`packages/shader-transitions/`) does count, and so does "Study `registry/…`".
- **F6 Site-root links** inside docs (`/reference/audio-effects`) are website routes, not repository paths. They are never followed.
- **F7 Links and relative paths always count.** A markdown link to a repository file always counts. A path to an existing file always counts, verb or not, when it is written relative to the current file or to its skill folder: `./x`, `../x`, `references/x.md`, a bare co-located filename such as `house-style.md`, or a skills-root-relative path such as `meeting-sdk/linux/SKILL.md`. The verb test applies only to F5 and F8.
- **F8 Directory references in prose** (not links) pull in their contents only when the sentence holds a direction verb. "Search the `./canvas-fonts` directory" counts. "The `.mjs` helpers live in the skill's `scripts/` directory" does not. A markdown link to a directory always counts, subject to F4b.
- **F9** is replaced by F4b and F7.
- **F10 Existence and location checks never pull anything in**: "check whether/for…", "if … exists", `test -f`, `[ -f … ]`, `[ -d … ]`.
- **F11** Paths inside code comments, and recursive `**` globs, are never followed.

**Direction verbs** (case-insensitive, whole words; the phrases count as written): read, study, follow, run, load, open, copy, search, consult, use, see, refer to, check out, review, execute, invoke, import, source, fetch, view, look at, start with, start from, apply.

## Amendments (Jang, 2026-10-24)

- **H1. Leaving every skill folder.** A reference of any kind (link, path, or directory) that resolves to a target outside every skill folder counts only when its sentence, read in its heading and list context, directs the agent to read, run, or load that target. A "Related packages" catalogue of links to whole code packages is not such a direction. "- Playtest review: `../../references/playtest-checklist.md`", a companion doc in a reference list, is one. Links inside skill folders still always count.
- **F5, F8, and H1 are judged by reading.** The direction-verb list is a hint, not a gate. A pointer with no listed verb can still be a direction, and a listed verb can still govern something else. In "Run the bundled importer from the skill's `scripts/` directory", the directory is a location, not the thing run. "Load assets from local project files, usually under `assets/`" names the user's project.
- **F7 collisions.** A path written for the user's project ("Read the developer's `package.json`") that happens to match a file in the skill folder is not pulled in. Record each such case in `misreadings`.
- **S1. Where code reach stops.** A script's run-time reads and imports, and any file a script runs, are followed only inside skill folders, and inside the skill's plugin root when that root is a proper subdirectory of the repo with its own plugin manifest (`plugin.json`, `.claude-plugin/plugin.json`, `.codex-plugin/`, `gemini-extension.json`). A plugin root at the repo root adds nothing. A code edge that crosses this boundary is not part of the file set. Record it under `checkoutReach` (`from`, `line`, `text`, `target`, and the file count it would reach). Prose and link directions that leave the skill folders stay under H1.
- **S1, contributor workflows.** A direction inside a contributor or maintenance workflow for the same repo (for example "Contributing a block: run `npx tsx scripts/generate-registry-items.ts`") points at the user's working checkout, in the same class as user-project files. It does not pull the repo file in.

## Outside requirements

- **O1 CLI.** A CLI counts when a pulled-in file runs it: in a shell-language code fence (`bash`, `sh`, `shell`, `console`, `zsh`), in an inline code span that holds a command, or in a run script. The thing a runner runs is recorded instead of the runner: `npx shadcn@latest` → `shadcn`, `pnpm dlx x`, `bunx x`, `uvx x`. These base tools never count:
  - shell builtins and keywords;
  - coreutils-class utilities: `ls cat cp mv rm mkdir rmdir touch chmod chown chgrp ln head tail grep egrep fgrep sed awk sort uniq wc cut tr tee find xargs basename dirname pwd date sleep env printenv which whoami id hostname uname kill ps du df stat readlink realpath mktemp seq yes diff cmp file tar gzip gunzip zip unzip less more nl od sha256sum sha1sum md5sum shasum base64 sudo nohup timeout watch newgrp usermod groupadd useradd su clear`;
  - `bash sh zsh git curl wget python python3 node`;
  - the runners and installers `npx pnpm bunx uvx npm pip pip3 apt apt-get yarn bun uv brew pipx`.
- **O2 Package.** A package counts when a pulled-in file installs it with an install command (`npm install x`, `pnpm add x`, `pip install x`, `uv add x`, …), or when a pulled-in run script imports it and it is not in the language's standard library. Name it by its registry name. Imports inside Markdown code examples written for the user's project do not count.
- **O3 Network.** A host counts when its URL appears in a command or script the skill runs, or in a prose line that tells the agent to fetch, download, open, read, or follow it. Documentation links otherwise do not count. Loopback hosts (`localhost`, `127.0.0.1`) never count, and neither do placeholder hosts (`<host>`, `example.com`). Name it by the host.
- **O4 Credential.** An env-var-shaped name ending in `_KEY`, `_TOKEN`, `_SECRET`, or `PASSWORD` counts when it is set or read in a shell fence, a run script, or an inline code span. Name it by the variable.
- **O5 MCP server.** One counts when the text says "<Name> MCP server", "<Name> MCP tool", or "<Name> MCP tools". Name it lowercased, for example `figma`.

## Output additions

Add these keys to each `<base>.json`:

- `namedSkills`: `[{"name": "code-review", "from": "<path>", "line": 38, "text": "<quoted>"}]`. List every bare-name reference to another skill in this repository, made in a pulled-in file, one entry per distinct name, giving its first occurrence.
- `misreadings`: `[{"ruling": "F7", "item": "<path or name>", "from": "<path>", "line": 0, "text": "<quoted>", "ruling_gives": "included|excluded", "definition_gives": "included|excluded", "reason": "..."}]`. List each case where you judge that a ruling misreads the frozen definition. The fixture follows `definition_gives`.
- `checkoutReach`: `[{"from": "<path>", "line": 0, "text": "<quoted>", "target": "<repo path>", "files": 0}]` (S1).
- Drop `runtime` flags; O1 replaces them.

## Amendments (Jang via executive, decisions-r1, 2026-10-24)

- **D0. F7 as written.** judge-3's reading stands: in the `skill-folder-only` class a mention of a skill file counts unless the path names a user-project file. F7 deliberately counts relative paths inside skill folders (an unserved file the agent goes to open is worse than a slightly larger set). Keep recording "mention, not direction" cases as misreadings.
- **O3 run scripts.** A URL counts when it is code or a whole string value, not when it sits inside a message or description string. OAuth scope URLs are identifiers and never count.
- **O1 relative paths.** A program run by relative path (`./x`, `.\x`) is the user's build output or a checkout's script, not a CLI. What it installs still counts.
- **O4 suffixes.** Add `_CREDS` and `_CREDENTIALS`.
- **O3 data files.** Kept as written: a URL in a data file states no requirement. Run-time hosts belong to exercise runs.
- **F11.** A comment inside a code example in a Markdown file reads as prose (F7, F8, H1 apply). A comment in a run script never counts.
- **O3, mechanical** (hosts are disclosure-only and never make a skill Heavy):
  1. HTML in a pulled-in file: a resource the browser loads (`<script src>`, `<link href>` stylesheet, CSS `@import url()`, `<img src>`) counts its host.
  2. Shell-fence URLs count only when a fetching command fetches them (`curl`, `wget`, `git clone`, an installer's source). A URL passed as an argument to another CLI does not count statically.
  3. Prose verbs: fetch, download, open, read, follow, visit, go to, navigate to, and "install … through/from/via <link>", coming before the URL.
- **O2 amendments.** An install from a URL counts as a package named by the URL's last path segment without its archive extension (`zoom-videosdk-react-0.0.1`); its host counts under O3. A manifest block (`pubspec.yaml`, `package.json` dependencies, `requirements.txt`, `pyproject` dependencies) in a pulled-in file, followed in the same file by that ecosystem's install command (`flutter pub get`, `npm install`, `pip install -r`, …), counts the dependencies it declares.
- **S1 contributor workflows (judge-4).** The criterion is a direction that edits the skill's or the repository's own files: contributing, registering or cataloguing a new module, publishing, releasing. Not a keyword list.

## Amendment (Jang via executive, 2026-10-24): clarification of F1 and F8, from judge calibration

- **(i)** A direction to any agent or worker that runs as part of the skill's workflow counts, at any step: a sub-agent or worker the skill dispatches, or a later step of the workflow. ("The frame worker reads `rules/`" and "concrete rules resolve in Step 5 from `rules/`" are directions. If the directory were not served, that step would fail with a missing file.)
- **(ii)** "Read item X by id from directory D" pulls in D. A directory whose files are read one at a time by id is used as a whole.
- **(iii)** An explicit prohibition ("never assume `../media-use`", "do not read X") is never a pull-in, in any class.
