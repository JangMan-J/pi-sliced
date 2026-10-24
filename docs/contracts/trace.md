# Contract: Trace, format `pi-sliced.trace/2`

A Trace is the recorded facts about one Candidate at one Revision. It is written once and never overwritten. A new tracer or judge version writes a new file beside the old one.

- **Path:** `traces/<owner>/<repo>/<name>/<revision>/<tracer>+<judge>.json`, for example `traces/mattpocock/skills/tdd/5beb35b…/trace-3+judge-4.json`.
- **Unresolvable source:** the revision directory is `none`.
- **Current Trace:** the one with the highest tracer number, then the highest judge number.
- **Version history:** `trace-2+judge-4.json` files are format `pi-sliced.trace/1` and are history. Everything new is `/2`.
- **File layout:** one JSON object, one array element per line, sorted keys as below.

| Key | Meaning |
| --- | --- |
| `format` | `"pi-sliced.trace/2"` |
| `tracer`, `judge` | versions that produced it (`trace-3`, `judge-4`) |
| `candidate` | `<owner>/<repo>/<name>` |
| `source`, `revision` | `<owner>/<repo>` and the 40-hex commit SHA (`"none"` when the source does not resolve) |
| `skillPath` | the skill's own folder in the repository |
| `status` | `"resolved"` or `"unresolvable"` (pending Traces are never stored) |
| `reason` | only when unresolvable |
| `totals` | `{files, bytes}` of the traced file set |
| `files` | every file the skill pulls in, sorted by path: `{path, size, blob, how, from?, line?, judged?}` |
| `outside` | Outside requirements: `{kind, name, at}`, kind one of `cli`, `package`, `network`, `credential`, `mcp-server` |
| `regions` | where the files sit: `{kind, path, files, bytes}`, kind `own`, `skill` (another skill's folder), `package` (a code package outside skill folders; `""` is the repo root), `repo` |
| `signals` | facts about what the text does: `{kind, detail, at}` (kinds below) |
| `namedSkills` | sibling skills named by bare name: `{name, path, at}` |
| `checkoutReach` | code edges that leave the skill folders (disclosed, never served): `{at, ref, target, package, files, bytes}` |
| `licence` | the governing licence fact, or null |

Fields inside the lists:

- **`files[i]`:**
  - `blob` is the git blob SHA. `size` is in bytes.
  - `how` is one of `root`, `link`, `path`, `variable-path`, `directory`, `script-read`. It describes the edge the walk first reached the file by.
  - `from` is the index into `files` of the file that holds that edge, and `line` is the line in that file.
  - `judged` names the judge class when a recorded judgement admitted the edge.
- **`at`:** evidence by reference, as `[fileIndex, line]` pairs pointing into `files`. The text of a line can be recovered from the file's blob at the Revision.
- **Signal kinds:**
  - `fetch-run`: unpinned remote code is fetched and run (`curl … | sh`, `npx pkg` with no version, `@latest`, `pip install git+…`);
  - `skill-fetch`: more skills are fetched at run time;
  - `persist-write`: a write to a skill folder, shell rc, autostart location or `~/.ssh`;
  - `secret-egress`: a secret-shaped variable and a non-loopback host appear on one command line;
  - `injection`: text aimed at overriding the agent or hiding actions from the user;
  - `invisible-unicode`: invisible or direction-changing characters;
  - `opaque`: an executable binary, a minified script or an encoded blob.

**For serving (proofs 4 and 5):** the served file set is exactly `files[].path` with `files[].blob` at `revision`, from `source`.
