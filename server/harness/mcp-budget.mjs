#!/usr/bin/env node
// Source-level reproduction of Pi a84e3df45's renderServersSection() in
// ~/pi/packages/coding-agent/src/extensions/mcp/index.ts (191-218).
// Kept standalone so fixture and counts can be rerun without Pi dependencies.
const LIMIT = 4096;
const MAX_DESCRIPTION = 250;
const intro = "MCP servers whose tools are not declared to you. Call the tools of `codemode` servers from codemode scripts.";
const sentence = "A workbench integration for searching, reading, and updating project records, files, and operational data through the configured service API.";
const description = `${sentence} ${sentence} ${sentence} ${sentence}`;
const piDescription = "Read-only skills the user served for this session. Search for the task and load the matching skill instructions.";

function namespace(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
function truncate(text, max) {
  if (text.length <= max) return text;
  return max <= 1 ? "" : `${text.slice(0, max - 1).trimEnd()}…`;
}
function render(names) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const heads = sorted.map((name) => `- mcp__${namespace(name)} (codemode)`);
  const omitted = (count) => count > 0
    ? [`- … ${count} more server${count === 1 ? "" : "s"}; find their tools with searchTools()`]
    : [];
  const size = (kept) => [intro, ...heads.slice(0, kept), ...omitted(sorted.length - kept)].join("\n").length;
  let kept = sorted.length;
  while (kept > 0 && size(kept) > LIMIT) kept--;
  const perServer = kept === 0
    ? 0
    : Math.min(MAX_DESCRIPTION, Math.floor((LIMIT - size(kept)) / kept) - 2);
  const summaries = sorted.slice(0, kept).map((name) => {
    const summary = perServer > 0 ? truncate(name === "pi_sliced" ? piDescription : description, perServer) : "";
    return summary;
  });
  const lines = sorted.slice(0, kept).map((name, i) => summaries[i]
    ? `${heads[i]}: ${summaries[i]}`
    : heads[i]);
  const text = [intro, ...lines, ...omitted(sorted.length - kept)].join("\n");
  return {
    characters: text.length,
    utf8Bytes: Buffer.byteLength(text, "utf8"),
    kept: sorted.slice(0, kept),
    dropped: sorted.slice(kept),
    perServerDescriptionCap: perServer,
    summaries: Object.fromEntries(sorted.slice(0, kept).map((name, i) => [name, summaries[i]])),
    text,
  };
}

for (const count of [5, 15, 30]) {
  const others = Array.from({ length: count }, (_, i) => `workbench-service-${String(i + 1).padStart(2, "0")}`);
  const before = render(others);
  const after = render([...others, "pi_sliced"]);
  const existingChanges = Object.fromEntries(others.map((name) => [name, {
    before: before.summaries[name] ?? null,
    after: after.summaries[name] ?? null,
    changed: (before.summaries[name] ?? null) !== (after.summaries[name] ?? null),
  }]));
  console.log(JSON.stringify({
    otherServers: count,
    input: { otherNames: others, piSlicedName: "pi_sliced", otherDescription: description, piSlicedDescription: piDescription },
    before: { characters: before.characters, utf8Bytes: before.utf8Bytes, kept: before.kept.length, dropped: before.dropped, descriptionCap: before.perServerDescriptionCap },
    after: { characters: after.characters, utf8Bytes: after.utf8Bytes, kept: after.kept.length, dropped: after.dropped, descriptionCap: after.perServerDescriptionCap },
    existingServers: existingChanges,
  }));
}
