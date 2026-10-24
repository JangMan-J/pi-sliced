import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const server = fileURLToPath(new URL("../mcp-server.mjs", import.meta.url));
const markdown = "---\r\nname: demo\r\ndescription: Keep this verbatim.\r\n---\r\nRead ../../references/support file.md.\r\n";
const binary = Buffer.from([0, 255, 128, 1, 13, 10]);
const uri = (entry, path) => `skill://${encodeURIComponent(entry.id)}/${encodeURIComponent(path)}`;

async function fixture(t, { absent = false } = {}) {
  const tmp = mkdtempSync(join(os.tmpdir(), "pi-sliced-mcp-test-"));
  const state = join(tmp, "state.json");
  const root = join(tmp, "repo");
  const put = (path, contents) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  };
  const files = ["skills/demo/SKILL.md", "references/support file.md", "assets/data.bin"];
  put(join(root, files[0]), markdown);
  put(join(root, files[1]), "Outside the skill folder, inside the Trace.\n");
  put(join(root, files[2]), binary);
  put(join(root, "unlisted.txt"), "NOT SERVED");
  put(join(tmp, "secret.txt"), "OUTSIDE ROOT");
  const entry = {
    id: "owner/repo/demo", name: "demo", description: "Verbatim description.\nSecond line: π.",
    root, skillDir: join(root, "skills/demo"), skillMdPath: join(root, files[0]),
    licenceLine: "Licence: MIT. Copyright Fixture.", files,
  };
  function setEntries(entries) {
    writeFileSync(`${state}.next`, JSON.stringify({ entries }));
    renameSync(`${state}.next`, state);
  }
  if (!absent) setEntries([entry]);
  const child = spawn(process.execPath, [server, state], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (s) => { stderr += s; });
  child.stdin.on("error", () => {}); // Requests are rejected on close below.
  const pending = new Map();
  let nextId = 0;
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let response;
    try { response = JSON.parse(line); }
    catch (error) {
      for (const p of pending.values()) p.reject(error);
      return;
    }
    const p = pending.get(response.id);
    if (p) { pending.delete(response.id); p.resolve(response); }
  });
  const closed = new Promise((resolve) => child.once("close", (code, signal) => {
    for (const p of pending.values()) p.reject(new Error(`server exited ${code}/${signal}: ${stderr}`));
    pending.clear();
    resolve({ code, signal });
  }));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
    lines.close();
    rmSync(tmp, { recursive: true, force: true });
  });
  async function request(method, params = {}) {
    assert.equal(child.exitCode, null, stderr);
    const id = ++nextId;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout: ${method}; ${stderr}`)), 3000);
        pending.set(id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    } finally { clearTimeout(timer); pending.delete(id); }
  }
  async function result(method, params) {
    const response = await request(method, params);
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    assert.notEqual(response.result, undefined);
    return response.result;
  }
  const initialized = await result("initialize", {
    protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" },
  });
  assert.ok(initialized.capabilities.tools);
  assert.ok(initialized.capabilities.resources);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  return { tmp, root, entry, state, setEntries, request, result, child, closed };
}

function denied(response) {
  assert.ok(response.error || response.result?.isError, `expected rejection: ${JSON.stringify(response)}`);
  assert.doesNotMatch(JSON.stringify(response), /NOT SERVED|OUTSIDE ROOT/);
}

async function loads(f) {
  return (await f.result("tools/list")).tools.filter((tool) => tool.name.startsWith("load_"));
}

test("load tools preserve descriptions, header, licence, directory and verbatim SKILL.md", async (t) => {
  const f = await fixture(t);
  const tools = await loads(f);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].description, f.entry.description);
  assert.equal(tools[0].inputSchema.type, "object");
  const loaded = await f.result("tools/call", { name: tools[0].name, arguments: {} });
  assert.notEqual(loaded.isError, true);
  assert.equal(loaded.content[0].type, "text");
  const text = loaded.content[0].text;
  const split = text.indexOf("\n\n");
  assert.ok(split > 0, "load has a header separated by a blank line");
  assert.ok(text.slice(0, split).includes(f.entry.licenceLine));
  assert.equal(text.slice(split + 2), markdown);
  assert.deepEqual(loaded.content[1], { type: "text", text: `dir: ${f.entry.skillDir}` });
});

test("load names are valid, bounded, stable and collision-resistant", async (t) => {
  const f = await fixture(t);
  const ids = ["owner/repo/a-b", "owner/repo/a_b", "owner/repo/a.b", "other/repo/a-b",
    `owner/repo/${"long".repeat(40)}a`, `owner/repo/${"long".repeat(40)}b`];
  const entries = ids.map((id, i) => ({ ...f.entry, id, name: "same-name", description: `description-${i}` }));
  f.setEntries(entries);
  const tools = await loads(f);
  assert.equal(tools.length, ids.length);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, ids.length);
  for (const tool of tools) assert.match(tool.name, /^load_[A-Za-z0-9_.-]{1,59}$/);
  assert.deepEqual(tools.map((tool) => tool.description).sort(), entries.map((e) => e.description).sort());
  f.setEntries([...entries].reverse());
  const mapping = (items) => Object.fromEntries(items.map((tool) => [tool.description, tool.name]));
  assert.deepEqual(mapping(await loads(f)), mapping(tools));
});

test("resources and manifest cover exactly the allowlist, including outside-folder files and binary", async (t) => {
  const f = await fixture(t);
  const resources = (await f.result("resources/list")).resources;
  assert.deepEqual(resources.map((r) => r.uri).sort(), [uri(f.entry, f.entry.files[0]), uri(f.entry, "_manifest")].sort());
  const read = async (path) => (await f.result("resources/read", { uri: uri(f.entry, path) })).contents[0];
  const manifest = JSON.parse((await read("_manifest")).text);
  assert.deepEqual([...manifest.files].sort(), f.entry.files.map((path) => uri(f.entry, path)).sort());
  assert.equal((await read(f.entry.files[0])).text, markdown);
  assert.equal((await read(f.entry.files[1])).text, "Outside the skill folder, inside the Trace.\n");
  const resource = await read(f.entry.files[2]);
  assert.equal(resource.uri, uri(f.entry, f.entry.files[2]));
  assert.deepEqual(Buffer.from(resource.blob, "base64"), binary);
});

test("unlisted files, traversal, absolute paths and unknown tools or resources are denied", async (t) => {
  const f = await fixture(t);
  for (const path of ["unlisted.txt", "../secret.txt", "skills/demo/../../../secret.txt", "/etc/passwd", "..\\secret.txt", "skills/demo/../../unlisted.txt"]) {
    denied(await f.request("resources/read", { uri: uri(f.entry, path) }));
  }
  for (const value of ["skill://unknown/SKILL.md", "file:///etc/passwd", "skill://owner%2Frepo%2Fdemo/%ZZ"]) {
    denied(await f.request("resources/read", { uri: value }));
  }
  denied(await f.request("tools/call", { name: "load_not_served", arguments: {} }));
  denied(await f.request("method/not-found"));
  assert.equal((await loads(f)).length, 1, "invalid requests do not kill the server");
});

test("allowlisting a symlink does not permit reading it or traversing a symlinked directory", async (t) => {
  const f = await fixture(t);
  symlinkSync(join(f.tmp, "secret.txt"), join(f.root, "link.txt"));
  symlinkSync(join(f.root, "references"), join(f.root, "linked-dir"), "dir");
  symlinkSync(f.entry.skillMdPath, join(f.root, "internal.md"));
  const paths = ["link.txt", "linked-dir/support file.md", "internal.md"];
  f.setEntries([{ ...f.entry, files: [...f.entry.files, ...paths] }]);
  for (const path of paths) denied(await f.request("resources/read", { uri: uri(f.entry, path) }));
  // Replacing the served SKILL.md after registration must not bypass path checks through tools/call.
  rmSync(f.entry.skillMdPath);
  symlinkSync(join(f.tmp, "secret.txt"), f.entry.skillMdPath);
  denied(await f.request("tools/call", { name: (await loads(f))[0].name, arguments: {} }));
});

test("state is reread for every request; absent state and removed entries expose nothing", async (t) => {
  const f = await fixture(t, { absent: true });
  assert.equal((await loads(f)).length, 0);
  assert.deepEqual((await f.result("resources/list")).resources, []);
  f.setEntries([f.entry]);
  const [tool] = await loads(f);
  assert.ok(tool);
  f.setEntries([{ ...f.entry, description: "Changed description." }]);
  assert.equal((await loads(f))[0].description, "Changed description.");
  f.setEntries([{ ...f.entry, files: [f.entry.files[0]] }]);
  denied(await f.request("resources/read", { uri: uri(f.entry, f.entry.files[1]) }));
  f.setEntries([]);
  denied(await f.request("tools/call", { name: tool.name, arguments: {} }));
  denied(await f.request("resources/read", { uri: uri(f.entry, "_manifest") }));
  assert.deepEqual((await f.result("resources/list")).resources, []);
  f.setEntries([f.entry]);
  rmSync(f.state);
  assert.equal((await loads(f)).length, 0);
  denied(await f.request("tools/call", { name: tool.name, arguments: {} }));
});

test("stdin EOF exits cleanly without a lingering process", async (t) => {
  const f = await fixture(t);
  f.child.stdin.end();
  let timer;
  try {
    const exit = await Promise.race([f.closed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("server did not exit after stdin EOF")), 3000);
    })]);
    assert.deepEqual(exit, { code: 0, signal: null });
  } finally { clearTimeout(timer); }
});
