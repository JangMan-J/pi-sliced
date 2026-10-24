#!/usr/bin/env node
// The Author's server: serves the built store over HTTPS, GET only.
//
//   GET /v1/catalogues/<name>                         → Catalogue (application/json)
//   GET /v1/skills/<owner>/<repo>/<name>@<revision>   → Detail (application/json, immutable)
//   GET /v1/blobs/<sha>                               → raw bytes (application/octet-stream, immutable)
//
// Anything else is 404; a known path with another method is 405. One line per request
// goes to stderr (the journal under systemd): time, remote ip, method, path, status, bytes.
//
// Environment: PI_SLICED_SERVER_HOST (0.0.0.0), PI_SLICED_SERVER_PORT (8790),
// PI_SLICED_SERVER_KEY / PI_SLICED_SERVER_CERT (~/.config/pi-sliced/server/{key,cert}.pem),
// PI_SLICED_STORE (${XDG_DATA_HOME:-~/.local/share}/pi-sliced/store).
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";
import { blobPath, cataloguePath, detailPath } from "./lib.mjs";

const SEG = "(?!\\.{1,2}(?:/|@|$))[A-Za-z0-9_.-]+";
const ROUTES = [
  { re: /^\/v1\/catalogues\/([a-z0-9][a-z0-9_-]*)$/, file: ([name]) => cataloguePath(name), type: "application/json", immutable: false },
  {
    re: new RegExp(`^/v1/skills/(${SEG})/(${SEG})/(${SEG})@([0-9a-f]{40})$`),
    file: ([owner, repo, name, revision]) => detailPath(`${owner}/${repo}/${name}`, revision),
    type: "application/json",
    immutable: true,
  },
  { re: /^\/v1\/blobs\/([0-9a-f]{40})$/, file: ([sha]) => blobPath(sha), type: "application/octet-stream", immutable: true },
];

/** Route a raw request target to { file, type, immutable }, or null. No decoding: `%`, `?` and `#` never match. */
export function route(target) {
  for (const r of ROUTES) {
    const m = r.re.exec(target);
    if (m) return { file: r.file(m.slice(1)), type: r.type, immutable: r.immutable };
  }
  return null;
}

function log(req, status, bytes) {
  const ip = req.socket.remoteAddress ?? "-";
  process.stderr.write(`${new Date().toISOString()} ${ip} ${req.method} ${JSON.stringify(req.url)} ${status} ${bytes}\n`);
}

function plain(req, res, status, text, extra = {}) {
  const body = Buffer.from(text + "\n");
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "content-length": body.length, ...extra });
  res.end(body);
  log(req, status, body.length);
}

export function handler(req, res) {
  const r = route(req.url ?? "");
  if (!r) return plain(req, res, 404, "not found");
  if (req.method !== "GET") return plain(req, res, 405, "method not allowed", { allow: "GET" });
  let st;
  try {
    st = statSync(r.file);
    if (!st.isFile()) throw new Error("not a file");
  } catch {
    return plain(req, res, 404, "not found");
  }
  res.writeHead(200, {
    "content-type": r.type,
    "content-length": st.size,
    "cache-control": r.immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
  });
  const stream = createReadStream(r.file);
  let sent = 0;
  stream.on("data", (c) => (sent += c.length));
  stream.on("error", () => res.destroy());
  stream.on("end", () => log(req, 200, sent));
  stream.pipe(res);
}

if (import.meta.main) {
  const conf = join(homedir(), ".config", "pi-sliced", "server");
  const key = readFileSync(process.env.PI_SLICED_SERVER_KEY || join(conf, "key.pem"));
  const cert = readFileSync(process.env.PI_SLICED_SERVER_CERT || join(conf, "cert.pem"));
  const host = process.env.PI_SLICED_SERVER_HOST || "0.0.0.0";
  const port = Number(process.env.PI_SLICED_SERVER_PORT || 8790);
  const server = createServer({ key, cert, requestTimeout: 60_000, headersTimeout: 15_000 }, handler);
  server.on("tlsClientError", () => {}); // scanners; not requests
  server.listen(port, host, () => process.stderr.write(`author-server listening on https://${host}:${port}\n`));
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
}
