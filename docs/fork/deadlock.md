# Deadlock proof: MCP serving channel vs shared `mcp_servers` prompt budget

## 1. Quoted text

From `INVARIANTS.md` (line 15):

> - Never hide, replace, or alter the user's native skills, other extensions, or other MCP servers. They stay exactly as Pi provides them.

From `KERNEL.md` (proof 7, lines 25–26):

> 7. **The cost of a Served skill the agent has not read is measured**
>    Check: `scripts/check-cost` captures request payloads for Slices of 0, 1, 10, and 50 skills and writes the measured sizes. It passes only if each payload exceeds the empty-Slice payload by no more than a fixed overhead that is the same for every Slice size, plus, per Served skill, its name, its frontmatter description, and at most 128 bytes of framing, with no skill body and no reference file.

## 2. Kind

**Kernel against a limit** (Pi 1.4.0's shared 4,096-character `mcp_servers` prompt section budget in `~/pi/packages/coding-agent/src/extensions/mcp/index.ts:191-218`, `renderServersSection()`).

## 3. Why it holds for every MCP implementation

Serving the Slice as a codemode MCP server via `pi.registerMcpServer` eliminates per-skill unread context growth across Slice sizes (flat +286 B total overhead at 1, 10, and 50 Served skills, compared to the native tool + prompt section channel which grows by ~450 B per Served skill per request: +953 B at 1 skill, +5,826 B at 10 skills, +22,485 B at 50 skills).

However, in Pi 1.4.0 (`~/pi/packages/coding-agent`, HEAD `a84e3df45`, `src/extensions/mcp/index.ts:191-218`), `renderServersSection()` renders every enabled `codemode` or `deferred` MCP server into a single 4,096-character `mcp_servers` system-prompt section, computing a uniform per-server summary cap:

```
perServer = min(250, floor((4096 - size(kept)) / kept) - 2)
```

Because `perServer` divides the remaining 4,096-character budget by the total number of kept servers `kept`, registering any MCP server reduces the character cap of every other MCP server's summary once the section exceeds the 250-character-per-server regime, even when no server is dropped, replaced, or disabled. Under a literal reading of `INVARIANTS.md` line 15 ("Never hide, replace, or alter the user's native skills, other extensions, or other MCP servers. They stay exactly as Pi provides them."), no extension can register an MCP server in Pi without altering other MCP servers' rendered prompt summaries at 15 or 30 servers.

## 4. Rerunnable evidence

### A. Shared `mcp_servers` section budget (`node server/harness/mcp-budget.mjs`)

Command:

```sh
node server/harness/mcp-budget.mjs
```

Measured output (`docs/measurements/mcp-server-budget.md`):

| Other servers | Before: chars / UTF-8 bytes | After: chars / UTF-8 bytes | Summary cap before → after (chars) | Existing summaries changed | Dropped before / after |
|---:|---:|---:|---:|---:|---:|
| 5 | 1,563 / 1,573 | 1,705 / 1,715 | 250 → 250 | 0 | 0 / 0 |
| 15 | 4,083 / 4,113 | 3,985 / 4,015 | 224 → 208 | 15 | 0 / 0 |
| 30 | 4,068 / 4,128 | 4,096 / 4,158 | 91 → 88 | 30 | 0 / 0 |

### B. Unread request payload cost (`scripts/check-cost`)

Command:

```sh
scripts/check-cost
```

Measured unread request payload sizes across Slices of 0, 1, 10, and 50 admitted skills (`docs/measurements/comparison.md`):

| Slice size | Native tool payload bytes (Δ vs 0) | MCP payload bytes (Δ vs 0) |
|---:|---:|---:|
| 0 | 7,891 (0) | 7,891 (0) |
| 1 | 8,844 (+953) | 8,177 (+286) |
| 10 | 13,717 (+5,826) | 8,177 (+286) |
| 50 | 30,376 (+22,485) | 8,177 (+286) |

## 5. Smallest frozen-set change

Replace `INVARIANTS.md` line 15:

```markdown
- Never hide, replace, or alter the user's native skills, other extensions, or other MCP servers. They stay exactly as Pi provides them.
```

with:

```markdown
- Never hide, drop, replace, or disable the user's native skills, other extensions, or other MCP servers. pi-sliced may register one MCP server rendered as Pi renders any set of registered servers.
```

Every other line in `KERNEL.md`, `INVARIANTS.md`, and `GLOSSARY.md` remains byte-identical.
