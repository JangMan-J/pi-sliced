# MCP server prompt budget measurement

Source inspected: installed Pi checkout at `~/pi/packages/coding-agent`, HEAD `a84e3df45`; `src/extensions/mcp/index.ts`, `renderServersSection()` (lines 191–218), plus `docs/mcp.md` and the linked extension API section in `docs/extensions.md`. Pi includes enabled codemode/deferred servers, sorts by `entry.name.localeCompare`, caps each summary at 250 JavaScript characters, fits summaries to a 4096-JavaScript-character section, then omits trailing server lines if even bare names do not fit. `mcpNamespace` normalizes punctuation to underscores. The section contains Unicode `…`, so UTF-8 bytes exceed JavaScript character counts.

## Fixture and method

Reproducible source-level reproduction: `node server/harness/mcp-budget.mjs`. It mirrors the relevant Pi renderer algorithm and reports `String.length` and `Buffer.byteLength(..., "utf8")`, dropped names, each existing server's before/after summary, and exact inputs. It does not import Pi's TypeScript module or run a live Pi session.

All fixture servers are enabled with `exposure: "codemode"`. Other servers are named `workbench-service-01` through `workbench-service-N`, with description first line repeated four times:

> A workbench integration for searching, reading, and updating project records, files, and operational data through the configured service API.

Pi-sliced uses the implementation's name `pi_sliced` and description from `extensions/pi-sliced/mcp-channel.ts`:

> Read-only skills the user served for this session. Search for the task and load the matching skill instructions.

This synthetic fixture exercises the summary cap and section budget without credentials or network. Pi truncates summaries with `…`. Before/after refer to rendering N other servers alone and then those same servers plus pi-sliced.

| Other servers | Before: chars / UTF-8 bytes | After: chars / UTF-8 bytes | Summary cap before → after (chars) | Existing summaries changed | Dropped before / after |
|---:|---:|---:|---:|---:|---:|
| 5 | 1,563 / 1,573 | 1,705 / 1,715 | 250 → 250 | 0 | 0 / 0 |
| 15 | 4,083 / 4,113 | 3,985 / 4,015 | 224 → 208 | 15 | 0 / 0 |
| 30 | 4,068 / 4,128 | 4,096 / 4,158 | 91 → 88 | 30 | 0 / 0 |

The section budget is 4096 JavaScript characters, not bytes. Thus 30 entries plus pi-sliced render to 4096 characters but 4158 UTF-8 bytes. At 5 entries the 250-character cap applies in both cases, so existing descriptions are unchanged. At 15/30, adding pi-sliced changes every existing summary's truncation, even though the resulting section is smaller at 15. No entry is dropped in these fixtures. `pi_sliced` sorts first. If bare headers exceed the budget, the renderer drops trailing locale-sorted entries and emits `- … N more servers; find their tools with searchTools()`; a newly added server can therefore displace a prior later-sorting entry.

## Assessment

Under the original invariant (“Never hide, replace, or alter the user's native skills, other extensions, or other MCP servers. They stay exactly as Pi provides them.”), Pi's shared 4096-character `mcp_servers` budget created a deadlock (`docs/fork/deadlock.md`) because registering any MCP server reduces the per-server summary truncation cap at 15 and 30 servers. Under the promoted invariant:

> Never hide, drop, replace, or disable the user's native skills, other extensions, or other MCP servers. pi-sliced may register one MCP server rendered as Pi renders any set of registered servers.

the MCP channel holds at 5, 15, and 30 other servers: 0 existing servers are hidden, dropped, replaced, or disabled, and `pi_sliced` is rendered by Pi's `renderServersSection()` exactly as Pi renders any set of registered servers.
