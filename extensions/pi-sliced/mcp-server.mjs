#!/usr/bin/env node
// Dependency-free, read-only MCP stdio surface of the current session Slice.
// State is written atomically by mcp-channel.ts, never by the agent or this server.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";

const statePath = process.argv[2];
if (!statePath) {
  console.error("usage: mcp-server.mjs <session-state.json>");
  process.exit(2);
}
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const TEXT = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".js", ".mjs", ".ts", ".tsx", ".py", ".sh", ".rs", ".go", ".c", ".h", ".css", ".html", ".xml", ".csv", ".ini", ".cfg", ".mdx", ".rst"]);
const instructions = "Read-only skills served by the user for this session. Search tools for the task, then call the returned load tool name with {}. Loading reads instructions; it executes nothing. Load one relevant skill, not every skill. The first text block has a licence header then verbatim SKILL.md; the second gives its local directory. Supporting files, including files outside the skill folder, are listed by its skill:// manifest; paths in those URIs are repository-relative. Only Served skills are available.";
const toolName = (e) => `load_${e.name.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 38)}_${createHash("sha256").update(e.id).digest("hex").slice(0, 20)}`;
const uriFor = (e, rel) => `skill://${encodeURIComponent(e.id)}/${encodeURIComponent(rel)}`;
const text = (value) => ({ type: "text", text: value });
function entries() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")).entries; }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
function safeFile(e, rel) {
  if (typeof rel !== "string" || rel.includes("\\") || rel.includes("\0") || rel.split("/").some((s) => !s || s === "." || s === "..") || !e.files.includes(rel)) throw new Error("file is not in this Served skill");
  if (fs.lstatSync(e.root).isSymbolicLink()) throw new Error("symlinks are not served");
  const root = fs.realpathSync(e.root);
  let target = root;
  for (const part of rel.split("/")) {
    target = path.join(target, part);
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error("symlinks are not served");
  }
  const real = fs.realpathSync(target);
  if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) throw new Error("path escapes Served files");
  return real;
}
function resources(es) {
  return es.flatMap((e) => [
    { uri: uriFor(e, path.relative(e.root, e.skillMdPath).split(path.sep).join("/")), name: `${e.name}/SKILL.md`, description: e.description, mimeType: "text/markdown" },
    { uri: uriFor(e, "_manifest"), name: `${e.name}/_manifest`, mimeType: "application/json" },
  ]);
}
function readResource(es, uri) {
  const match = typeof uri === "string" && /^skill:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error("unsupported resource URI");
  const id = decodeURIComponent(match[1]), rel = decodeURIComponent(match[2]);
  const e = es.find((e) => e.id === id);
  if (!e) throw new Error("unknown Served skill");
  if (rel === "_manifest") return { uri, mimeType: "application/json", text: JSON.stringify({ skill: e.id, dir: e.skillDir, root: e.root, files: e.files.map((p) => uriFor(e, p)) }, null, 2) };
  const file = safeFile(e, rel), bytes = fs.readFileSync(file);
  return TEXT.has(path.extname(file).toLowerCase())
    ? { uri, mimeType: file.endsWith(".md") ? "text/markdown" : "text/plain", text: bytes.toString("utf8") }
    : { uri, mimeType: "application/octet-stream", blob: bytes.toString("base64") };
}
function handle({ method, params }) {
  if (method === "initialize") return { protocolVersion: params?.protocolVersion || "2025-03-26", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "pi-sliced", version: "0.1.0" }, instructions };
  if (method === "ping") return {};
  const es = entries();
  switch (method) {
    case "tools/list": return { tools: [
      ...es.map((e) => ({ name: toolName(e), description: e.description, inputSchema: { type: "object", properties: {} }, annotations: READ_ONLY })),
      { name: "list_resources", description: "List Served skill resources and manifests.", inputSchema: { type: "object", properties: {} }, annotations: READ_ONLY },
      { name: "read_resource", description: "Read a Served skill text resource by its manifest URI.", inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] }, annotations: READ_ONLY },
    ] };
    case "resources/list": return { resources: resources(es) };
    case "resources/templates/list": return { resourceTemplates: [] };
    case "resources/read": return { contents: [readResource(es, params?.uri)] };
    case "tools/call": {
      if (params?.name === "list_resources") return { content: [text(JSON.stringify({ resources: resources(es) }))] };
      if (params?.name === "read_resource") {
        const resource = readResource(es, params.arguments?.uri);
        if (resource.blob !== undefined) throw new Error("binary resource: use resources/read");
        return { content: [text(resource.text)] };
      }
      const e = es.find((e) => toolName(e) === params?.name);
      if (!e) throw new Error("unknown Served skill tool");
      const md = fs.readFileSync(safeFile(e, path.relative(e.root, e.skillMdPath).split(path.sep).join("/")), "utf8");
      return { content: [text(`Skill "${e.name}". Relative paths in its SKILL.md resolve against ${e.skillDir}/\n${e.licenceLine}\n\n${md}`), text(`dir: ${e.skillDir}`)] };
    }
    default: throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
  }
}
const send = (response) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...response }) + "\n");
createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  if (!line.trim()) return;
  let request;
  try { request = JSON.parse(line); }
  catch { send({ id: null, error: { code: -32700, message: "Parse error" } }); return; }
  if (!request || typeof request !== "object" || Array.isArray(request) || typeof request.method !== "string") {
    send({ id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } }); return;
  }
  if (request.id === undefined || request.id === null) return;
  try { send({ id: request.id, result: handle(request) }); }
  catch (error) { send({ id: request.id, error: { code: error.code === -32601 ? -32601 : -32603, message: String(error.message) } }); }
});
