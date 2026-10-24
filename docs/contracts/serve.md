# Contract: Serving and MCP channel (`pi_sliced`)

pi-sliced serves the session's Slice to the agent through a single read-only stdio MCP server registered with `pi.registerMcpServer` (`exposure: "codemode"`), materialized in a private per-session temporary directory (`extensions/pi-sliced/slice.ts`, `extensions/pi-sliced/mcp-channel.ts`, `extensions/pi-sliced/mcp-server.mjs`). No native tool is registered and no system-prompt section is modified directly.

## Session materialization (`slice.ts`)

- **Session directory:** `${tmpdir}/pi-sliced-<pid>-<rand>` (`0700`). Created on first serve; removed on `session_shutdown`, `exit`, and non-TUI `SIGINT`. `sweepDeadSessions()` at `session_start` removes any `pi-sliced-<pid>-*` directories owned by the current user whose PID is no longer alive.
- **Per-skill slot:** `${sessionDir}/<slot>/`, staged in `.${slot}.partial` and renamed atomically. Removing a skill from the Slice (`unserve`) deletes its slot directory immediately.
- **Catalogue skills:** fetched from the Author's server (`/v1/skills/<id>@<revision>` and `/v1/blobs/<sha>`) over HTTPS using only the pinned certificate (`extensions/pi-sliced/author-server.pem`). Every file in `Detail.files` is verified against its expected byte length and git blob SHA-1 (`sha1("blob <len>\0" + bytes)`) before its slot is exposed, and materialized at its repository-relative path with mode `0644` (`100644`) or `0755` (`100755`). Relative paths in `SKILL.md` resolve against `skillDir` (`${root}/${skillPath}`).
- **Untraced items:** fetched from the Skills.sh proxy snapshot (`action=detail`) that the user inspected, and materialized at the snapshot's relative paths (`0644`).

## MCP server registration (`mcp-channel.ts`)

- **Lifecycle:** Registered only while the Slice is non-empty. Unregistered (`pi.unregisterMcpServer`) as soon as the Slice becomes empty or on `session_shutdown`.
- **Server name:** `pi_sliced` by default. At `session_start`, `reserveConfig` records server names from the user's `~/.pi/agent/mcp.json` and (when trusted) the project's `.pi/mcp.json` without evaluating credentials. If `pi_sliced` (or `pi-sliced`) collides with a reserved config name or an active extension MCP server (`pi.getMcpServers()`), the channel selects the first free `pi_sliced_2`, `pi_sliced_3`, …
- **Exposure and description:**
  - `exposure: "codemode"`
  - `description: "Read-only skills the user served for this session. Search for the task and load the matching skill instructions."`
- **Unread context cost (proof 7):** Because codemode MCP lists only the server summary in the system prompt before discovery, unread context delta is fixed (+286 B across Slices of 1, 10, and 50 Served skills), with zero per-skill unread bytes.
- **Atomic state handoff:** Before registering or refreshing the server, `mcp-channel.ts` writes `${sessionDir}/.mcp-state.json.next` (`0600`) and atomically renames it to `${sessionDir}/.mcp-state.json`, incrementing `PI_SLICED_MCP_GENERATION` in the child environment so Pi reconnects and refreshes its tool index. Each Served entry's allowlisted file list (`filesUnder(root)`) is snapshotted once at materialization time. If registration throws, `slice.ts` rolls back the serve, deletes the slot directory, and rewrites `.mcp-state.json`.

## MCP stdio protocol (`mcp-server.mjs`)

`mcp-server.mjs` is a dependency-free JSON-RPC 2.0 server over stdio. It rereads `${sessionDir}/.mcp-state.json` on every request so unserved skills become unavailable immediately, even before Pi completes a reconnect.

All tools carry read-only annotations:
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`.

### Tools (`tools/list`, `tools/call`)

| Tool | Input schema | Description / Return |
| --- | --- | --- |
| `load_<name>_<hash>` | `{ type: "object", properties: {} }` | One tool per Served skill: `<name>` is `entry.name` with non-`[A-Za-z0-9_]` replaced by `_` and truncated to 38 chars; `<hash>` is the first 20 hex chars of `sha256(entry.id)`. Tool `description` is the skill's verbatim frontmatter `description`. Calling it returns two text content blocks: (1) load header, licence line, blank line, and verbatim `SKILL.md`; (2) `dir: <skillDir>`. |
| `list_resources` | `{ type: "object", properties: {} }` | Lists the `skill://` (`SKILL.md`) and `skill-manifest://` (`_manifest`) resource descriptors for every currently Served skill. |
| `read_resource` | `{ type: "object", properties: { uri: { type: "string" } }, required: ["uri"] }` | Returns the text of any `skill://` text file or `skill-manifest://` JSON manifest. Rejects binary resources (use `resources/read`). |

### Resources (`resources/list`, `resources/read`)

- **`skill://<encodeURIComponent(id)>/<encodeURIComponent(relPath)>`**
  - `relPath` is a repository-relative POSIX path from the Served entry's initial file allowlist (`entry.files`).
  - Path traversal (`.`, `..`, backslashes, NUL bytes), files outside `entry.files`, and symlinks at the root or any path segment are rejected.
  - Known text extensions with valid UTF-8 bytes return `{ uri, mimeType: "text/markdown" | "text/plain", text }`; binary or non-UTF-8 files return `{ uri, mimeType: "application/octet-stream", blob: <base64> }`.
- **`skill-manifest://<encodeURIComponent(id)>/`**
  - Dedicated URI scheme for generated metadata so a traced `_manifest` file in a repository is never shadowed.
  - Returns `{ uri, mimeType: "application/json", text }` containing `{ skill: id, dir: skillDir, root, files: ["skill://..."] }`.

### Licence load header (`licenceLine`)

The first text block returned by `load_<name>_<hash>` has the exact form:

```text
Skill "<name>". Relative paths in its SKILL.md resolve against <skillDir>/
<licenceLine>

<verbatim SKILL.md>
```

where `<licenceLine>` is:
- **Catalogue skill with a governing licence (`entry.licence` non-null):**
  `Licence: <spdx | "unrecognised licence">[; <copyright>]. Full text: <server>/v1/licences/<owner>/<repo>/<name>@<revision>`
  (This licence URL is the only Author's server URL the agent ever sees.)
- **Catalogue skill with `entry.licence === null`:**
  `Licence: none was found in its source.`
- **Untraced item (`entry.kind === "untraced"`):**
  `Licence: unknown (Untraced).`
