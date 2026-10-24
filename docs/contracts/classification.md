# Contract: Classification, format `pi-sliced.classification/1` (classifier `classify-1`)

A Classification describes what a skill pulls in. Deterministic code computes it from its stored Trace (`pi-sliced.trace/2`) alone, with no model, network or file contents. `scripts/rederive` rebuilds every Classification byte for byte.

- **Path:** `classifications/<owner>/<repo>/<name>/<revision>/<tracer>+<judge>+classify-1.json`.
- **Coverage:** every stored `/2` Trace has one.
- **Companion index:** reverse edges are kept in a separate file, `classifications/companions.json` (format `pi-sliced.companions/1`), rebuilt from every current Trace. For each skill folder it lists the Candidates that name it (`namedBy`) or pull in its files (`pulledBy`).

| Key | Meaning |
| --- | --- |
| `trace` | `{path, sha256}` of the Trace it was derived from |
| `status` | `resolved` or `unresolvable` (then only `reason` follows) |
| `footprint` | `files`, `bytes`, `own`, `otherSkills{count,files,bytes}`, `packages[]`, `repoFiles`, `assets{fonts,images,media,other,bytes}`, `outside{cli,package,mcp-server,credential,network}`, `summary` (the full one-line Footprint, for Inspect's compact Footprint block), and `short` (counts only, for a listing row: `2.9 MiB · +44 skills · 28 CLI · 86 pkg · 38 keys · 12 hosts · MCP 1`; a row carries the markers plus `short`) |
| `heavy` | `{heavy, because[]}`, exactly the glossary rule: files > 1 MiB, or any package, MCP server, CLI or credential |
| `markers` | `[{marker, because[]}]`, in fixed order; only markers that apply |
| `security` | every signal, by kind, with where it was seen |
| `companions` | `named` (sibling skills named by bare name) and `pulled` (other skill folders whose files it pulls in) |
| `checkoutReach` | `{edges, targets, files, bytes}` |

Markers (`classify-1` definitions, confirmed by Jang on 2026-10-24, rulings c1; glyph grouping and drawing are the Picker's):

| Marker | Applies when the Trace has |
| --- | --- |
| `runs-commands` | any Outside requirement of kind `cli` |
| `installs-packages` | any of kind `package` |
| `network` | any of kind `network` |
| `credentials` | any of kind `credential` |
| `mcp-server` | any of kind `mcp-server` |
| `chain-loads` | files in another skill's folder, or a `skill-fetch` signal |
| `stub` | an own folder of 4 KiB or less, with either 4 times its bytes or more outside it, or one file in it plus an Outside `cli` or `mcp-server` entry (a lone `SKILL.md` wrapping a CLI or MCP server) |
| `checkout-scripts` | any `checkoutReach` edge |
| `persistent-writes` | a `persist-write` signal |
| `unpinned-code` | a `fetch-run` signal |
| `opaque-code` | an `opaque` signal |
| `sends-credentials` | a `secret-egress` signal (a review prompt, not a verdict) |
| `agent-override-text` | an `injection` or `invisible-unicode` signal |

`Untraced` is not a Classification marker. It belongs to Skills.sh branch items, which have no Trace.
